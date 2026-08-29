#!/usr/bin/env node
/**
 * Drives the demo app in a real browser: draws a tactical graphic, edits its
 * amplifiers through the Feature Properties dialog, and asserts on what the
 * OpenLayers features actually hold.
 *
 * This exists to guard the properties migration — style functions must read
 * amplifiers off the feature. Its assertions are deliberately
 * NOT pixel comparisons — they read `properties.tacticalGraphic` off the live
 * features and evaluate the style functions, which is what the migration
 * changed. A screenshot alone would have missed the `feature.set()` /
 * `changed()` bug entirely.
 *
 *   npm start                 # in one terminal
 *   node scripts/drive-app.mjs
 *   node scripts/drive-app.mjs --headed --keep-open
 *
 * Reads the `window.__tacticalGraphics` hook installed by OpenLayers.tsx in
 * development builds.
 */
import {chromium} from 'playwright';
import {mkdirSync, readFileSync, statSync} from 'fs';
import {join} from 'path';

const URL = process.env.APP_URL ?? 'http://localhost:3000/';
const HEADED = process.argv.includes('--headed');
const KEEP_OPEN = process.argv.includes('--keep-open');
const SHOTS = join(process.cwd(), '.playwright-out');

/** OL suppresses map clicks for 1s after drawend (TacticalGraphicsManager.lastDrawEndedAt). */
const DRAW_END_GUARD_MS = 1300;

let failures = 0;
const check = (label, ok, detail = '') => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
    if (!ok) failures++;
};

/**
 * Stroke-color predicates for the hostility-default guard. A graphic drawn
 * without a hostility must render in the neutral default and must never flip to
 * Friendly blue — `getColorByHostility(friend)` is `rgba(0,0,255,1)`.
 *
 * "Neutral default" is two colours, not one: `getDefaultLineColor()` returns
 * `#000000` in light mode and `rgb(198,198,198)` in dark, and the demo boots
 * dark. Matching only black failed this check on every run against correct code.
 */
const isBlue = c => typeof c === 'string' && c.replace(/\s+/g, ' ').includes('0, 0, 255');
const isNeutral = c =>
    typeof c === 'string' &&
    (c === '#000000' || c.replace(/\s+/g, ' ').includes('0, 0, 0') || c.replace(/\s+/g, '').includes('198,198,198'));
/** Hostile red — `rgba(255, 0, 0, 1)` in light mode, `rgb(208,123,123)` in dark. */
const isRed = c => typeof c === 'string' && /255,0,0|208,123,123/.test(c.replace(/\s+/g, ''));

/** Reads the rendering source's features, projected down to plain JSON. */
const readFeatures = page =>
    page.evaluate(() => {
        const src = window.__tacticalGraphics?.manager?.renderingVectorSource;
        if (!src) return null;
        return src.getFeatures().map(f => ({
            graphicName: f.get('graphicName') ?? null,
            tacticalGraphic: f.get('tacticalGraphic') ?? null,
            revision: f.getRevision(),
            geometryType: f.getGeometry()?.getType() ?? null,
            hasStyleFn: typeof f.getStyle() === 'function',
        }));
    });

/**
 * Evaluates a feature's style function at the current resolution and reports
 * the text it renders and whether any stroke is dashed. This is the assertion
 * that actually exercises `readGraphicLabels` inside the style function.
 */
const readRenderedStyle = (page, graphicName) =>
    page.evaluate(name => {
        const {map, manager} = window.__tacticalGraphics;
        const resolution = map.getView().getResolution();
        const feature = manager.renderingVectorSource
            .getFeatures()
            .find(f => f.get('graphicName') === name && typeof f.getStyle() === 'function');
        if (!feature) return null;

        const result = feature.getStyle()(feature, resolution);
        const styles = Array.isArray(result) ? result : result ? [result] : [];
        return {
            count: styles.length,
            texts: styles.map(s => s.getText?.()?.getText?.()).filter(t => typeof t === 'string'),
            dashes: styles.map(s => s.getStroke?.()?.getLineDash?.()).filter(Boolean),
            strokeColors: styles.map(s => s.getStroke?.()?.getColor?.()).filter(Boolean),
        };
    }, graphicName);

/**
 * Every style a graphic's features actually produced, flattened.
 *
 * Reaches for the *evaluated* styles rather than the features, because what this file
 * checks about the centre symbol -- that an image drew, how wide the browser made it,
 * and where it landed -- exists only after the style function has run and the image has
 * loaded. `Icon.getWidth()` is documented to return `undefined` until then, and jsdom
 * never loads one, which is why the assertion lives here and not in a unit test.
 */
const readDrawnStyles = (page, graphicName) =>
    page.evaluate(name => {
        const {map, manager} = window.__tacticalGraphics;
        const resolution = map.getView().getResolution();
        const out = [];
        for (const f of manager.renderingVectorSource.getFeatures()) {
            if (f.get('graphicName') !== name) continue;
            const style = f.getStyle();
            if (typeof style !== 'function') continue;
            const result = style(f, resolution);
            for (const s of Array.isArray(result) ? result : result ? [result] : []) {
                const img = s.getImage?.();
                const own = s.getGeometry?.();
                const geom = own ?? f.getGeometry();
                out.push({
                    symbolId: f.get('symbolId') ?? null,
                    hostility: f.get('tacticalGraphic')?.hostility ?? null,
                    stroke: s.getStroke?.()?.getColor?.() ?? null,
                    text: s.getText?.()?.getText?.() ?? null,
                    src: img?.getSrc?.() ?? null,
                    imageWidth: img?.getWidth?.() ?? null,
                    imageHeight: img?.getHeight?.() ?? null,
                    ownGeometry: !!own,
                    geometryType: geom?.getType?.() ?? null,
                    coordinates: geom?.getCoordinates?.() ?? null,
                });
            }
        }
        return {resolution, styles: out};
    }, graphicName);

const selectGraphic = async (page, displayName) => {
    await page.getByPlaceholder('Filter graphics').fill(displayName);
    await page.getByText(displayName, {exact: true}).first().click();
    // Match on both labels. The button now returns to "Add Graphic" after a
    // draw ends, but it legitimately reads "Drawing…" mid-draw, and its handler
    // restarts the draw for the newly selected shape either way — so matching
    // both keeps this working whichever state the previous step left it in.
    await page.locator('button').filter({hasText: /Add Graphic|Drawing…/}).first().click();
};

/** Draws a 3-vertex line at vertical offset `yOff`: click, click, double-click to finish. */
const drawLine = async (page, box, yOff = 0) => {
    const pt = (fx, fy) => [box.x + box.width * fx, box.y + box.height * (fy + yOff)];
    const [x1, y1] = pt(0.45, 0.35);
    const [x2, y2] = pt(0.62, 0.45);
    const [x3, y3] = pt(0.8, 0.35);
    await page.mouse.click(x1, y1);
    await page.mouse.click(x2, y2);
    await page.mouse.dblclick(x3, y3);
    return {mid: [(x1 + x2) / 2, (y1 + y2) / 2]};
};

const openDialogAt = async (page, [x, y]) => {
    await page.mouse.click(x, y);
    await page.waitForSelector('#name-input', {timeout: 5000});
};

/**
 * OK applies and closes the dialog. Note it stays *disabled* until the form is
 * dirty (`hasChanges`), so always edit a field before calling this.
 */
const applyAndCloseDialog = async page => {
    await page.getByRole('button', {name: 'OK'}).click();
    await page.waitForSelector('#name-input', {state: 'detached', timeout: 5000});
};

/**
 * MUI's <Select> renders an unlabelled div[role=combobox]; its <InputLabel> has
 * no `for`, so getByLabel('Status') never resolves. Scope to the FormControl
 * that contains the label text instead.
 */
const chooseSelectOption = async (page, fieldLabel, optionName) => {
    const field = page.locator('.MuiFormControl-root').filter({has: page.getByText(fieldLabel, {exact: true})});
    await field.locator('[role="combobox"]').first().click();
    await page.getByRole('option', {name: optionName, exact: true}).click();
};

const main = async () => {
    mkdirSync(SHOTS, {recursive: true});
    const browser = await chromium.launch({headless: !HEADED});
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}});

    const consoleErrors = [];
    page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text()));
    page.on('pageerror', e => consoleErrors.push(String(e)));

    // Pin the library config to its defaults before the app boots.
    //
    // `lineWidth` is a host setting, persisted in this key by the settings panel, so
    // a developer who once dragged the slider would otherwise get failures here
    // rather than in their own app. A fresh Playwright context happens to start with
    // empty storage, which made this work by accident; state it outright.
    //
    // The route checks no longer *depend* on the value — they discriminate by
    // geometry identity, not stroke width (@see readRouteFigure) — but label
    // scaling and decoration sizing still read the config, so pin it regardless.
    await page.addInitScript(() => localStorage.setItem('tg_graphicsSettings', '{}'));

    console.log(`\nDriving ${URL}\n`);
    await page.goto(URL, {waitUntil: 'domcontentloaded'});

    // ── 0. App boots ────────────────────────────────────────────────────────
    console.log('0. App boots');
    await page.waitForFunction(() => !!window.__tacticalGraphics?.manager, {timeout: 30000});
    await page.waitForSelector('.map-container canvas', {timeout: 30000});
    check('OpenLayers map + manager initialised', true);
    const box = await page.locator('.map-container').boundingBox();
    check('map container has a box', !!box && box.width > 400, `${box?.width}x${box?.height}`);

    // ── 1. Draw a Phase Line ────────────────────────────────────────────────
    console.log('\n1. Draw a Phase Line');
    await selectGraphic(page, 'phase line');
    const {mid} = await drawLine(page, box);
    await page.waitForFunction(
        () => (window.__tacticalGraphics.manager.renderingVectorSource.getFeatures().length ?? 0) > 0,
        {timeout: 10000},
    );
    await page.screenshot({path: join(SHOTS, '01-drawn.png')});

    let features = await readFeatures(page);
    const styled = features.filter(f => f.hasStyleFn);
    check('features were rendered', features.length > 0, `${features.length} features`);
    check(
        'every feature carries properties.tacticalGraphic',
        features.every(f => f.tacticalGraphic !== null),
        `${features.filter(f => f.tacticalGraphic).length}/${features.length}`,
    );
    check(
        'stamped name matches the graphic drawn',
        features.some(f => f.tacticalGraphic?.name === 'PhaseLine'),
        features[0]?.tacticalGraphic?.name,
    );
    check('a styled feature exists', styled.length > 0);

    const beforeLabel = await readRenderedStyle(page, 'PhaseLine');
    check('style function runs and renders text', (beforeLabel?.texts.length ?? 0) > 0, JSON.stringify(beforeLabel?.texts));
    check('unnamed phase line renders the doctrinal "PL"', beforeLabel?.texts.some(t => t.trim() === 'PL'), JSON.stringify(beforeLabel?.texts));
    check(
        'unset hostility renders the neutral default stroke (not Friendly blue)',
        (beforeLabel?.strokeColors.length ?? 0) > 0 && beforeLabel.strokeColors.every(isNeutral) && !beforeLabel.strokeColors.some(isBlue),
        JSON.stringify(beforeLabel?.strokeColors),
    );

    // ── 2. Rename it — the writeGraphicProperties -> changed() path ──────────
    console.log('\n2. Rename via Feature Properties');
    await page.waitForTimeout(DRAW_END_GUARD_MS);
    const revBefore = Math.max(...(await readFeatures(page)).map(f => f.revision));

    await openDialogAt(page, mid);
    check('dialog opened on the drawn graphic', true);
    await page.fill('#name-input', 'ALPHA');
    await applyAndCloseDialog(page);
    await page.waitForTimeout(300);
    await page.screenshot({path: join(SHOTS, '02-renamed.png')});

    features = await readFeatures(page);
    const revAfter = Math.max(...features.map(f => f.revision));
    check(
        'amplifier persisted onto the feature',
        features.some(f => f.tacticalGraphic?.designation === 'ALPHA'),
        JSON.stringify(features.map(f => f.tacticalGraphic?.designation)),
    );
    check('feature revision bumped (feature.changed() fired)', revAfter > revBefore, `${revBefore} -> ${revAfter}`);

    const afterLabel = await readRenderedStyle(page, 'PhaseLine');
    check(
        'style function now renders "PL ALPHA"',
        afterLabel?.texts.some(t => t.includes('ALPHA')),
        JSON.stringify(afterLabel?.texts),
    );
    // Regression guard: editing a property on a graphic that never set a hostility
    // must not silently recolor it Friendly blue (dialog used to default to Friend).
    check(
        'renaming an unset-hostility graphic keeps its neutral stroke',
        (afterLabel?.strokeColors.length ?? 0) > 0 && afterLabel.strokeColors.every(isNeutral) && !afterLabel.strokeColors.some(isBlue),
        JSON.stringify(afterLabel?.strokeColors),
    );

    // ── 3. Status -> planned must dash the stroke ───────────────────────────
    // Phase Line has no Status field (PHASE_LINE = f(..., hostility=true, status=false)
    // in graphicFieldRegistry.ts), so drive a Release Line, which does — and which
    // routes through defaultLineStyle rather than phaseLineStyle.
    console.log('\n3. Status = planned dashes the stroke (release line)');
    await selectGraphic(page, 'release line');
    const {mid: releaseMid} = await drawLine(page, box, 0.25);
    await page.waitForTimeout(DRAW_END_GUARD_MS);

    const solid = await readRenderedStyle(page, 'ReleaseLine');
    check('release line rendered', (solid?.count ?? 0) > 0, `${solid?.count} styles`);
    check('stroke is solid before status is set', (solid?.dashes.length ?? 0) === 0);

    await openDialogAt(page, releaseMid);
    await page.fill('#name-input', 'RL1');
    await chooseSelectOption(page, 'Status', 'planned');
    await applyAndCloseDialog(page);
    await page.waitForTimeout(300);
    await page.screenshot({path: join(SHOTS, '03-planned.png')});

    features = await readFeatures(page);
    check(
        'status persisted onto the feature',
        features.some(f => f.tacticalGraphic?.status === 'planned'),
        JSON.stringify(features.map(f => f.tacticalGraphic?.status).filter(Boolean)),
    );
    const planned = await readRenderedStyle(page, 'ReleaseLine');
    check('style function reads status and dashes the stroke', (planned?.dashes.length ?? 0) > 0, JSON.stringify(planned?.dashes));
    check('label survives the status change', planned?.texts.some(t => t.includes('RL1')), JSON.stringify(planned?.texts));

    check(
        'the earlier phase line is untouched by the second graphic',
        (await readRenderedStyle(page, 'PhaseLine'))?.texts.some(t => t.includes('ALPHA')),
    );

    // ── 4. Route traffic-direction figure ───────────────────────────────────
    // FM 1-02.2 Table 5-17 stacks the figure above the route line: arrows for
    // one-way / two-way, and `←— ALT —→` for alternating. The figure is drawn
    // geometry (shaft LineString + filled arrowhead Polygon), not an icon
    // sprite, so this reads the shapes rather than an Icon src.
    console.log('\n4. Route direction renders the traffic-direction figure');
    await selectGraphic(page, 'route');
    const {mid: routeMid} = await drawLine(page, box, 0.45);
    await page.waitForTimeout(DRAW_END_GUARD_MS);

    /**
     * Style geometry types + texts + dashes for the Route's styled feature.
     *
     * The route line is told apart from the arrow shafts by **geometry identity**,
     * not by stroke width. `routeControlMeasureStyleFromLabels` draws the line on
     * the feature's own geometry object (`geometry: geom`) and builds every shaft a
     * fresh `LineString`, so `style.getGeometry() === feature.getGeometry()` picks
     * out the line exactly, at any configured width.
     *
     * This used to compare widths against a hardcoded 2 — "the route line is
     * thicker, shafts are ROUTE_ARROW_WIDTH". That silently stopped discriminating
     * when the default `lineWidth` went 4 -> 2: `routeArrowWidth()` is
     * `max(1, LINE_WIDTH() / 2)`, so shafts became 1 and the *route line* became
     * the thing matching `=== 2`. Three checks then failed against correct code —
     * the hostile-line colour read back `null` because nothing was wider than 2.
     */
    const readRouteFigure = () =>
        page.evaluate(() => {
            const {map, manager} = window.__tacticalGraphics;
            const resolution = map.getView().getResolution();
            const feature = manager.renderingVectorSource
                .getFeatures()
                .find(f => f.get('graphicName') === 'Route' && typeof f.getStyle() === 'function');
            if (!feature) return null;
            const result = feature.getStyle()(feature, resolution);
            const styles = Array.isArray(result) ? result : result ? [result] : [];

            // **Matched by coordinates, not by object identity.**
            //
            // `s.getGeometry() === feature.getGeometry()` held while the style function
            // reused the feature's own geometry object. It stopped holding when the
            // route moved onto the shared paint layer, which describes each mark as
            // plain coordinates and lets the OpenLayers bridge build a fresh geometry
            // per paint. Nothing about the rendering changed — but the probe then
            // counted the route line as a third arrow shaft, reported its stroke among
            // the traffic figure's colours (so a hostile route "proved" the arrows had
            // gone red), and found no route line at all to read `lineColor` from. Three
            // failures, one bad assumption, and none of them in the code under test.
            const own = feature.getGeometry();
            const ownCoords = own?.getCoordinates?.() ?? [];
            const sameLine = coords =>
                Array.isArray(coords) &&
                coords.length === ownCoords.length &&
                coords.every((p, i) => Math.abs(p[0] - ownCoords[i][0]) < 1e-6 && Math.abs(p[1] - ownCoords[i][1]) < 1e-6);
            const isRouteLine = s => {
                const g = s.getGeometry?.();
                return !!g && g.getType?.() === 'LineString' && sameLine(g.getCoordinates?.());
            };
            const shaftStyles = styles.filter(
                s => !isRouteLine(s) && s.getGeometry?.()?.getType?.() === 'LineString' && s.getStroke?.(),
            );
            const headStyles = styles.filter(s => s.getGeometry?.()?.getType?.() === 'Polygon' && s.getFill?.());

            return {
                heads: headStyles.length,
                shafts: shaftStyles.length,
                texts: styles.map(s => s.getText?.()?.getText?.()).filter(t => typeof t === 'string'),
                dashes: styles.map(s => s.getStroke?.()?.getLineDash?.()).filter(Boolean),
                // Colour of the traffic figure vs. colour of the route line —
                // the amplifier block is black, only the line answers to hostility.
                figureColors: [
                    ...shaftStyles.map(s => s.getStroke().getColor()),
                    ...headStyles.map(s => s.getFill().getColor()),
                ],
                lineColor: styles.filter(isRouteLine).map(s => s.getStroke?.()?.getColor?.())[0] ?? null,
            };
        });

    const general = await readRouteFigure();
    check('general route draws no traffic arrow', (general?.heads ?? -1) === 0, `${general?.heads} head(s)`);

    await openDialogAt(page, routeMid);
    await page.fill('#name-input', 'MSR1');
    await chooseSelectOption(page, 'Direction', 'ONE_WAY');
    await applyAndCloseDialog(page);
    await page.waitForTimeout(400);
    await page.screenshot({path: join(SHOTS, '04-route-direction.png')});

    // One arrow per end of the route: a shaft and a solid head each.
    const oneWay = await readRouteFigure();
    check('one-way draws one arrowhead per end', oneWay?.heads === 2, `${oneWay?.heads} head(s)`);
    check('each arrowhead has a shaft', oneWay?.shafts === 2, `${oneWay?.shafts} shaft(s)`);
    check('identifier survives the direction change', oneWay?.texts.some(t => t.includes('MSR1')), JSON.stringify(oneWay?.texts));

    await openDialogAt(page, routeMid);
    await chooseSelectOption(page, 'Direction', 'TWO_WAY');
    await applyAndCloseDialog(page);
    await page.waitForTimeout(400);
    const twoWay = await readRouteFigure();
    check('two-way stacks two opposed arrows per end', twoWay?.heads === 4, `${twoWay?.heads} head(s)`);

    // The one the plate is explicit about: ALT sits *between* two outward arrows.
    await openDialogAt(page, routeMid);
    await chooseSelectOption(page, 'Direction', 'ALTERNATING');
    await chooseSelectOption(page, 'Status', 'planned');
    await applyAndCloseDialog(page);
    await page.waitForTimeout(400);
    await page.screenshot({path: join(SHOTS, '04b-route-alternating.png')});
    const alternating = await readRouteFigure();
    check('alternating renders the ALT amplifier', alternating?.texts.filter(t => t === 'ALT').length === 2, JSON.stringify(alternating?.texts));
    check('ALT is flanked by an arrow on each side', alternating?.heads === 4, `${alternating?.heads} head(s)`);
    check('planned dashes the route line', (alternating?.dashes.length ?? 0) > 0, JSON.stringify(alternating?.dashes));
    check(
        'only the route line dashes — the traffic arrows stay solid',
        alternating?.dashes.length === 1,
        `${alternating?.dashes.length} dashed stroke(s)`,
    );

    // The traffic figure is part of the amplifier block, not the control
    // measure's line work: a hostile route turns red under the arrows, not
    // through them.
    await openDialogAt(page, routeMid);
    await chooseSelectOption(page, 'Hostility', 'Hostile/Faker');
    await applyAndCloseDialog(page);
    await page.waitForTimeout(400);
    const hostile = await readRouteFigure();
    check('hostile route line takes the hostility colour', isRed(hostile?.lineColor), String(hostile?.lineColor));
    check(
        'traffic arrows stay in the label colour on a hostile route',
        (hostile?.figureColors.length ?? 0) > 0 && hostile.figureColors.every(isNeutral) && !hostile.figureColors.some(isRed),
        JSON.stringify([...new Set(hostile?.figureColors)]),
    );

    // ── 5. Passage lane DTG stays readable at every bearing ─────────────────
    // The DTG reads across the lane, so its rotation has to be folded back
    // upright independently. Four bearings, one per quadrant: the south-west one
    // is the case that broke, because the upright pass corrects by *adding* π and
    // leaves the angle numerically outside any range test while pointing the
    // right way. A label turned more than 90° off upright is upside down.
    console.log('\n5. Passage lane DTG stays readable at every bearing');
    const readLaneLabelRotation = () =>
        page.evaluate(() => {
            const {map, manager} = window.__tacticalGraphics;
            const resolution = map.getView().getResolution();
            for (const feature of manager.renderingVectorSource.getFeatures()) {
                if (typeof feature.getStyle() !== 'function') continue;
                const result = feature.getStyle()(feature, resolution);
                const text = (Array.isArray(result) ? result : [result])
                    .map(s => s?.getText?.())
                    .find(t => t && t.getText());
                if (text) return text.getRotation();
            }
            return null;
        });

    const laneCenter = [box.x + box.width * 0.6, box.y + box.height * 0.45];
    for (const [degrees, quadrant] of [[20, 'east'], [110, 'north'], [200, 'west'], [290, 'south']]) {
        await page.evaluate(() => window.__tacticalGraphics.manager.renderingVectorSource.clear());
        await selectGraphic(page, 'passage lane');
        const radians = (degrees * Math.PI) / 180;
        // Screen y grows downward, hence the negated sine.
        const [x1, y1] = [laneCenter[0] - Math.cos(radians) * 60, laneCenter[1] + Math.sin(radians) * 60];
        const [x2, y2] = [laneCenter[0] + Math.cos(radians) * 180, laneCenter[1] - Math.sin(radians) * 180];
        await page.mouse.click(x1, y1);
        await page.mouse.dblclick(x2, y2);
        await page.waitForTimeout(DRAW_END_GUARD_MS);

        // The dialog opens on the lane's centre line; nudge across it if the
        // first click lands between the strokes.
        for (const nudge of [0, -12, 12]) {
            await page.mouse.click((x1 + x2) / 2 + nudge, (y1 + y2) / 2);
            await page.waitForTimeout(500);
            if (await page.locator('#starttime-input').count()) break;
        }
        await page.fill('#starttime-input', '2007-02-12T06:00');
        await applyAndCloseDialog(page);
        await page.waitForTimeout(300);

        const rotation = await readLaneLabelRotation();
        const off = rotation === null ? null : Math.round((rotation * 180) / Math.PI);
        check(
            `lane drawn ${quadrant}ward renders its DTG upright`,
            off !== null && Math.abs(off) <= 90,
            `${off}° off upright`,
        );
    }
    await page.screenshot({path: join(SHOTS, '05-passage-lane-bearing.png')});

    // ── 6. Graphics survive an engine switch ────────────────────────────────
    //
    // The only place this can be checked. Both engines need a real map — MapLibre a
    // GL context — so jsdom cannot host either, and the handover is demo wiring rather
    // than library code, so no unit suite covers it.
    //
    // It was broken and silent: `MapLibre.tsx` announced `onReady` *before* it built
    // its engine, and every verb on the handle delegates through `engine?.…`, so the
    // restore that `MapRendering` fires on hearing `onReady` went nowhere. Switching
    // to MapLibre dropped every graphic and left the seven the mount used to draw, so
    // the map looked populated and the count was wrong. Assert the number.
    console.log('\n6. Graphics survive an engine switch');
    const engineCount = () => page.evaluate(() => window.__tacticalEngine?.snapshot()?.features.length ?? -1);
    const switchTo = async name => {
        await page.getByRole('button', {name, exact: true}).click();
        await page.waitForFunction(() => !!window.__tacticalEngine, {timeout: 30000});
        await page.waitForTimeout(7000);
    };

    /*
     * **Clear the filter first.** The sweep draws what the panel is listing, so the
     * search term an earlier step typed would narrow it — which is the feature working,
     * and a driver that did not know it drew three graphics and called the sweep broken.
     */
    await page.getByPlaceholder('Filter graphics').fill('');
    await page.waitForTimeout(500);

    await page.getByRole('button', {name: /draw samples/i}).click();
    await page.waitForTimeout(5000);
    const drawnOnOl = await engineCount();
    check('the sweep draws on OpenLayers', drawnOnOl > 100, `${drawnOnOl} graphics`);

    await switchTo('MapLibre');
    const carried = await engineCount();
    check('every graphic crosses to MapLibre', carried === drawnOnOl, `${carried} of ${drawnOnOl}`);

    await page.getByRole('button', {name: /clear all/i}).click();
    await page.waitForTimeout(2000);
    await switchTo('OpenLayers');
    const afterClear = await engineCount();
    // A removal has to cross too, or switching back would resurrect the map.
    check('a removal crosses back', afterClear === 0, `${afterClear} left`);

    await page.getByRole('button', {name: /draw samples/i}).click();
    await page.waitForTimeout(5000);
    const redrawn = await engineCount();
    await switchTo('MapLibre');
    await switchTo('OpenLayers');
    check('a round trip loses nothing', (await engineCount()) === redrawn, `${redrawn} graphics`);

    // ── 6b. The view onto them crosses too ──────────────────────────────────
    //
    // Centre and metres-per-pixel, not a zoom number: MapLibre's tiles are 512 px and
    // OpenLayers' are 256, so the same view is `z` in one and `z - 1` in the other and
    // storing the raw number would halve or double the scale on every switch. Assert
    // the resolution rather than the zoom for exactly that reason.
    const viewOf = () => page.evaluate(() => JSON.parse(localStorage.getItem('tg_viewport') ?? 'null'));
    await page.getByRole('button', {name: /draw samples/i}).click();
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
        const view = window.__tacticalGraphics.map.getView();
        view.setCenter([1500000, 4000000]);
        view.setZoom(6);
    });
    await page.waitForTimeout(2500);
    const olView = await viewOf();
    check('OpenLayers records where it is looking', !!olView && olView.resolution > 0, JSON.stringify(olView));

    await switchTo('MapLibre');
    const mlbView = await viewOf();
    const sameScale = olView && mlbView && Math.abs(mlbView.resolution / olView.resolution - 1) < 0.02;
    const sameSpot =
        olView && mlbView && Math.abs(mlbView.lon - olView.lon) < 0.5 && Math.abs(mlbView.lat - olView.lat) < 0.5;
    check('MapLibre opens at the same scale', !!sameScale, `${olView?.resolution} -> ${mlbView?.resolution}`);
    check('MapLibre opens at the same place', !!sameSpot, `${mlbView?.lon?.toFixed(3)}, ${mlbView?.lat?.toFixed(3)}`);
    await switchTo('OpenLayers');
    const backView = await viewOf();
    check(
        'and back again, without drifting',
        !!backView && Math.abs(backView.resolution / olView.resolution - 1) < 0.02,
        `${backView?.resolution}`,
    );

    // Nothing is persisted, by design: the handover is an in-memory ref, so a reload
    // is the way back to an empty map. The *viewport* is deliberately the exception —
    // three numbers in localStorage, so a refresh comes back to the same view of an
    // empty map. @see mapViewport.ts
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => !!window.__tacticalEngine, {timeout: 30000});
    await page.waitForTimeout(3000);
    check('a refresh starts empty — the handover is not persisted', (await engineCount()) === 0);

    // ── 7. Export writes a file Import can read back ─────────────────────────
    //
    // The serialization itself is covered exhaustively in jest — every registered
    // graphic, every amplifier it offers, and gestures applied before the round trip.
    // What no test touched is the layer either side of it: the Blob and the synthetic
    // `<a download>` click on the way out, and `JSON.parse(await file.text())` on the
    // way back. Both live in `OpenLayers.tsx`, neither is reachable from jsdom, and a
    // user who presses Export meets them before meeting anything that is tested.
    //
    // **The comparison never names a field.** It diffs whole `tacticalGraphic` bags,
    // so it keeps working across a schema rename — which matters, because the suites
    // that DO name fields quietly stopped covering one when it was renamed.
    console.log('\n7. Export and re-import a saved map');

    const snap = () => page.evaluate(() => window.__tacticalEngine?.snapshot() ?? null);
    const graphicCount = async () => (await snap())?.features.length ?? -1;

    /** Wait for the sample sweep to stop adding graphics rather than guess a delay. */
    const settle = async () => {
        let previous = -1;
        for (let i = 0; i < 40; i++) {
            await page.waitForTimeout(500);
            const n = await graphicCount();
            if (n > 0 && n === previous) return n;
            previous = n;
        }
        return previous;
    };

    /**
     * Is every key the saved bag carried still there, with the same value?
     *
     * One-directional on purpose: a rebuild legitimately *stamps* values it derived —
     * a holder writes back the metre size it handed the generator — so an extra key
     * after a restore is correct, while a missing one is lost work. Numbers compare
     * with a relative tolerance because they make a float round trip through JSON.
     */
    const bagKeeps = (before, after) => {
        if (!before) return true;
        if (!after) return false;
        for (const [key, value] of Object.entries(before)) {
            const back = after[key];
            if (typeof value === 'number' && typeof back === 'number') {
                if (Math.abs(value - back) / Math.max(1e-9, Math.abs(value), Math.abs(back)) > 1e-6) return false;
            } else if (JSON.stringify(value) !== JSON.stringify(back)) {
                return false;
            }
        }
        return true;
    };

    const bagsOf = collection =>
        new Map((collection?.features ?? []).map(f => [f.properties?.symbolId, f.properties?.tacticalGraphic]));
    const geometriesOf = collection =>
        new Map((collection?.features ?? []).map(f => [f.properties?.symbolId, JSON.stringify(f.geometry)]));

    await page.getByRole('button', {name: /draw samples/i}).click();
    const drawn = await settle();
    const beforeExport = await snap();
    check('a map to save', drawn > 0, `${drawn} graphics`);

    // The download event is the only proof the anchor click actually fired.
    const [download] = await Promise.all([
        page.waitForEvent('download', {timeout: 30000}),
        page.getByRole('button', {name: /^export$/i}).click(),
    ]);
    const savedPath = join(SHOTS, 'exported.geojson');
    await download.saveAs(savedPath);

    check(
        'Export offers the file under its own name',
        download.suggestedFilename() === 'tactical-graphics.geojson',
        download.suggestedFilename(),
    );
    check('Export wrote bytes', statSync(savedPath).size > 0, `${statSync(savedPath).size} bytes`);

    let saved = null;
    try {
        saved = JSON.parse(readFileSync(savedPath, 'utf8'));
    } catch (e) {
        check('the exported file parses as JSON', false, e.message);
    }
    check('the file is a FeatureCollection', saved?.type === 'FeatureCollection', String(saved?.type));
    check('the file carries its snapshot version', Number.isFinite(saved?.tacticalGraphicsVersion), String(saved?.tacticalGraphicsVersion));
    check('one saved feature per graphic', saved?.features?.length === drawn, `${saved?.features?.length} of ${drawn}`);

    // What went out must be what was on the map — checked before anything is cleared,
    // so a failure here blames the writer rather than the reader.
    const liveBags = bagsOf(beforeExport);
    const fileBags = bagsOf(saved);
    const unwritten = [...liveBags].filter(([id, bag]) => !bagKeeps(bag, fileBags.get(id)));
    check(
        'every graphic on the map reached the file, amplifiers intact',
        unwritten.length === 0,
        unwritten.slice(0, 3).map(([id]) => id).join(', '),
    );

    await page.getByRole('button', {name: /clear all/i}).click();
    await page.waitForTimeout(1500);
    check('Clear all empties the map', (await graphicCount()) === 0);

    // The hidden input the Import button clicks on the user's behalf. Driving it
    // directly is the same code path — the click only opens the picker.
    await page.locator('input[type="file"]').setInputFiles(savedPath);
    await page.waitForTimeout(4000);
    const afterImport = await snap();
    const importedCount = afterImport?.features?.length ?? -1;

    check('every graphic came back', importedCount === drawn, `${importedCount} of ${drawn}`);

    const backBags = bagsOf(afterImport);
    const lost = [...fileBags].filter(([id, bag]) => !bagKeeps(bag, backBags.get(id)));
    check('every amplifier survived the file', lost.length === 0, lost.slice(0, 3).map(([id]) => id).join(', '));

    /**
     * Did any vertex actually move?
     *
     * Compared as numbers against a tolerance rather than as JSON text. A coordinate
     * makes a float round trip through the file and comes back as -77.04000000000001:
     * the same place, a different string. The first version of this check compared
     * `JSON.stringify` and reported five graphics moved — every one of them by a
     * measured 0.00 m.
     *
     * A changed vertex COUNT is a different failure and is reported as such: it means
     * the restore rebuilt a different shape, not that a float drifted.
     */
    const METRES_PER_DEGREE = 111_320; // rough, and only ever used to express a tolerance
    const VERTEX_TOLERANCE_M = 0.01;
    const movedBy = (a, b) => {
        if (!b) return {metres: Infinity, note: 'did not come back'};
        const flat = json => {
            const out = [];
            (function walk(c) {
                typeof c[0] === 'number' ? out.push(c) : c.forEach(walk);
            })(JSON.parse(json).coordinates);
            return out;
        };
        const before = flat(a);
        const after = flat(b);
        if (before.length !== after.length) return {metres: Infinity, note: `${before.length} vertices -> ${after.length}`};
        let worst = 0;
        for (let i = 0; i < before.length; i++) {
            worst = Math.max(worst, Math.hypot(before[i][0] - after[i][0], before[i][1] - after[i][1]));
        }
        return {metres: worst * METRES_PER_DEGREE, note: null};
    };

    const fileGeom = geometriesOf(saved);
    const backGeom = geometriesOf(afterImport);
    const nameOf = new Map((saved?.features ?? []).map(f => [f.properties?.symbolId, f.properties?.tacticalGraphic?.name]));
    const moved = [...fileGeom]
        .map(([id, geometry]) => ({name: nameOf.get(id), ...movedBy(geometry, backGeom.get(id))}))
        .filter(m => m.metres > VERTEX_TOLERANCE_M);
    check(
        'every graphic came back to the same coordinates',
        moved.length === 0,
        moved.slice(0, 5).map(m => `${m.name} ${m.note ?? `${m.metres.toFixed(2)} m`}`).join(', '),
    );

    // Restore promises *editable*, not merely visible: a graphic with no controller is
    // a picture of itself. @see persistence.ts
    const controllers = await page.evaluate(() => window.__tacticalGraphics?.manager?.graphicControllers?.length ?? -1);
    check(
        'imported graphics are editable, not just drawn',
        controllers === importedCount,
        `${controllers} controllers for ${importedCount} graphics`,
    );

    await page.screenshot({path: join(SHOTS, '07-imported.png')});

    // ── 8. The centre symbol ─────────────────────────────────────────────────────
    //
    // Six graphics draw a host-supplied unit symbol as part of themselves. Two things
    // about it are only true in a browser: the image has to load before anything can
    // measure it, and the affiliation has to survive a *click* -- the dialog identifies
    // its graphic by the `symbolId` on the feature the hit test returned, and the symbol
    // is the biggest thing a security operation draws.
    console.log('\n8. The centre symbol');
    await page.getByRole('button', {name: /clear all/i}).click();
    await page.waitForTimeout(1200);

    await selectGraphic(page, 'cover');
    /*
     * **Two clicks, not one.** Cover, guard and screen were dropped on a single anchor at a
     * fixed screen size until 2026-08-29; APP-06 gives them four anchor points, so the
     * operator draws one arrow — point 1 at the arrowhead, point 2 at its inner end — and
     * the other is derived. The centre of the finished symbol is past point 2, which is
     * where the unit symbol sits and therefore where this clicks to open the dialog.
     */
    const armTip = [box.x + box.width * 0.3, box.y + box.height * 0.4];
    const armInner = [box.x + box.width * 0.45, box.y + box.height * 0.4];
    await page.mouse.click(armTip[0], armInner[1]);
    await page.mouse.dblclick(armInner[0], armInner[1]);
    await page.waitForTimeout(DRAW_END_GUARD_MS);
    const coverAt = [armInner[0] + (armInner[0] - armTip[0]) * 0.21, armInner[1]];

    const coverBefore = await readDrawnStyles(page, 'Cover');
    const symbolBefore = coverBefore.styles.find(s => s.src);
    check('a Cover draws its centre symbol', !!symbolBefore, symbolBefore ? `${symbolBefore.imageWidth}px wide` : 'none');
    check(
        'the centre symbol carries its graphic symbolId',
        !!symbolBefore?.symbolId,
        'without one the dialog opens on an empty selection and drops the edit',
    );

    // Click the symbol itself, which is what an operator aims at. Cover has no
    // identifier field, so there is no #name-input to wait on here.
    await page.mouse.click(coverAt[0], coverAt[1]);
    await page.waitForSelector('[role="dialog"]', {timeout: 5000});
    await chooseSelectOption(page, 'Hostility', 'Hostile/Faker');
    await page.getByRole('button', {name: 'OK'}).click();
    await page.waitForSelector('[role="dialog"]', {state: 'detached', timeout: 5000});
    await page.waitForTimeout(600);

    const coverAfter = await readDrawnStyles(page, 'Cover');
    const symbolAfter = coverAfter.styles.find(s => s.src);
    check(
        'an affiliation set by clicking the symbol reaches the graphic',
        coverAfter.styles.some(s => s.hostility === 'Hostile/Faker'),
        JSON.stringify([...new Set(coverAfter.styles.map(s => s.hostility))]),
    );
    check('and redraws the symbol at the new identity', !!symbolAfter && symbolAfter.src !== symbolBefore?.src);
    check('and turns the arms hostile red', coverAfter.styles.some(s => isRed(String(s.stroke))));

    // The escort takes the same provider through a different path: its symbol goes in
    // the break in its own bar, sized from the bar rather than from the global setting.
    // It is a tactical mission task, so it offered no affiliation at all until the rule
    // changed -- and an entity symbol with no identity is stuck on `pending`.
    await selectGraphic(page, 'escort');
    const escortY = box.y + box.height * 0.5;
    await page.mouse.click(box.x + box.width * 0.3, escortY);
    await page.mouse.dblclick(box.x + box.width * 0.62, escortY);
    await page.waitForTimeout(DRAW_END_GUARD_MS);

    const escortBefore = (await readDrawnStyles(page, 'Escort')).styles.find(s => s.src);
    check('an Escort draws a symbol in its bar', !!escortBefore, escortBefore ? `${escortBefore.imageWidth?.toFixed(1)}px wide` : 'none');

    await page.mouse.click(box.x + box.width * 0.46, escortY);
    await page.waitForSelector('[role="dialog"]', {timeout: 5000});
    await chooseSelectOption(page, 'Hostility', 'Hostile/Faker');
    await page.getByRole('button', {name: 'OK'}).click();
    await page.waitForSelector('[role="dialog"]', {state: 'detached', timeout: 5000});
    await page.waitForTimeout(600);

    const escortAfter = (await readDrawnStyles(page, 'Escort')).styles.find(s => s.src);
    check('the Escort offers an affiliation and redraws its symbol at it', !!escortAfter && escortAfter.src !== escortBefore?.src);

    // The follow tasks put their symbol *inside* the body, in place of field T, so it
    // has to fit there -- and both renderers size an icon by its width and let the height
    // follow the image, so a taller-than-wide frame is the case that overflows.
    for (const [name, display, yFraction] of [
        ['FollowAndAssume', 'follow and assume', 0.62],
        ['FollowAndSupport', 'follow and support', 0.82],
    ]) {
        await selectGraphic(page, display);
        await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * yFraction);
        await page.mouse.dblclick(box.x + box.width * 0.72, box.y + box.height * yFraction);
        await page.waitForTimeout(DRAW_END_GUARD_MS);

        const drawn = await readDrawnStyles(page, name);
        const symbol = drawn.styles.find(s => s.src);
        check(
            `${name} draws a unit symbol`,
            !!symbol,
            symbol ? `${symbol.imageWidth?.toFixed(1)}x${symbol.imageHeight?.toFixed(1)}px` : 'none',
        );
        // The body is the closed ring: a stroked LineString of its own with 5+ points.
        const body = drawn.styles.find(
            s => s.ownGeometry && s.geometryType === 'LineString' && Array.isArray(s.coordinates) && s.coordinates.length >= 5,
        )?.coordinates;
        const at = drawn.styles.find(s => s.geometryType === 'Point' && s.src)?.coordinates;
        check(`${name} draws its body`, !!body && !!at);
        if (!symbol || !body || !at) continue;

        const res = drawn.resolution;
        const halfW = ((symbol.imageWidth ?? 0) * res) / 2;
        const halfH = ((symbol.imageHeight ?? 0) * res) / 2;
        const xs = body.map(c => c[0]);
        const ys = body.map(c => c[1]);
        check(
            `${name} keeps the symbol inside its body`,
            at[0] - halfW > Math.min(...xs) &&
                at[0] + halfW < Math.max(...xs) &&
                at[1] - halfH > Math.min(...ys) &&
                at[1] + halfH < Math.max(...ys),
            `symbol ${((halfH * 2) / res).toFixed(1)}px tall, body ${((Math.max(...ys) - Math.min(...ys)) / res).toFixed(1)}px`,
        );
        // Specifically clear of the rear point: the support variant's rear edge is a
        // notch cut forward into the body, and the content is centred past it.
        const axisY = (Math.max(...ys) + Math.min(...ys)) / 2;
        const onAxis = body.filter(c => Math.abs(c[1] - axisY) < res);
        const rearX = Math.min(...(onAxis.length ? onAxis : body).map(c => c[0]));
        check(
            `${name} keeps the symbol clear of the rear edge`,
            at[0] - halfW > rearX,
            `${((at[0] - halfW - rearX) / res).toFixed(1)}px past it`,
        );
        check(`${name} draws the symbol instead of field T, not as well as`, !drawn.styles.some(s => s.text));
    }

    // Zooming in must not inflate the symbol with the graphic. Everything else about a
    // follow task is drawn in metres and gets bigger; a framed unit symbol carries a fixed
    // amount of information, so it stops at the same ceiling the escort uses. Only a
    // browser can answer this -- the size is the width the icon was actually built at.
    const measureFollow = async () => {
        // An Icon rebuilt at a new size reports no width until its image has loaded, and
        // changing the zoom rebuilds it. Poll rather than sleep once: a fixed wait is how a
        // measurement of zero gets reported as a symbol that vanished.
        let drawn = await readDrawnStyles(page, 'FollowAndAssume');
        for (let i = 0; i < 20 && !(drawn.styles.find(s => s.src)?.imageWidth > 0); i++) {
            await page.waitForTimeout(250);
            drawn = await readDrawnStyles(page, 'FollowAndAssume');
        }
        const symbol = drawn.styles.find(s => s.src);
        const body = drawn.styles.find(
            s => s.ownGeometry && s.geometryType === 'LineString' && Array.isArray(s.coordinates) && s.coordinates.length >= 5,
        )?.coordinates;
        const ys = body?.map(c => c[1]) ?? [];
        return {
            symbolPx: symbol?.imageWidth ?? 0,
            bodyPx: body ? (Math.max(...ys) - Math.min(...ys)) / drawn.resolution : 0,
        };
    };

    const before = await measureFollow();
    // Centre on the graphic before zooming. `Icon.getWidth()` is undefined until the image
    // has loaded, and an icon rebuilt at a new size only loads if the map actually draws
    // it -- zooming past the graphic leaves it off-screen and reports a symbol of zero,
    // which reads exactly like one that vanished.
    await page.evaluate(() => {
        const {map, manager} = window.__tacticalGraphics;
        const view = map.getView();
        // On the symbol itself, so the capture shows the thing being measured.
        let centre;
        for (const f of manager.renderingVectorSource.getFeatures()) {
            if (f.get('graphicName') !== 'FollowAndAssume' || typeof f.getStyle() !== 'function') continue;
            const result = f.getStyle()(f, view.getResolution());
            for (const style of Array.isArray(result) ? result : result ? [result] : []) {
                if (style.getImage?.()?.getSrc?.()) centre = style.getGeometry?.()?.getCoordinates?.();
            }
        }
        if (centre) view.setCenter(centre);
        view.setZoom((view.getZoom() ?? 4) + 4);
    });
    await page.waitForTimeout(1200);
    const zoomed = await measureFollow();

    check('zooming in grows the follow task itself', zoomed.bodyPx > before.bodyPx * 4, `${before.bodyPx.toFixed(0)}px -> ${zoomed.bodyPx.toFixed(0)}px tall`);
    check(
        'and stops its unit symbol at the shared ceiling',
        zoomed.symbolPx <= 96 && zoomed.symbolPx > before.symbolPx,
        `${before.symbolPx.toFixed(1)}px -> ${zoomed.symbolPx.toFixed(1)}px, ceiling 96px`,
    );
    check('so the symbol no longer fills its body', zoomed.symbolPx < zoomed.bodyPx / 2, `symbol ${zoomed.symbolPx.toFixed(0)}px in a ${zoomed.bodyPx.toFixed(0)}px body`);
    await page.screenshot({path: join(SHOTS, '08-center-symbol-zoomed.png')});
    await page.evaluate(() => {
        const view = window.__tacticalGraphics.map.getView();
        view.setZoom((view.getZoom() ?? 8) - 4);
    });
    await page.waitForTimeout(800);

    await page.screenshot({path: join(SHOTS, '08-center-symbol.png')});

    // ── 9. No console errors ────────────────────────────────────────────────────
    console.log('\n9. Console is clean');
    const realErrors = consoleErrors.filter(e => !/favicon|ResizeObserver|Download the React DevTools/i.test(e));
    check('no console/page errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    console.log(`\nScreenshots: ${SHOTS}`);
    console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}\n`);

    if (KEEP_OPEN) {
        console.log('--keep-open: leaving the browser up. Ctrl-C to exit.');
        await new Promise(() => {});
    }
    await browser.close();
    process.exit(failures === 0 ? 0 : 1);
};

main().catch(err => {
    console.error('\nDriver crashed:', err.message);
    process.exit(1);
});
