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
import {mkdirSync} from 'fs';
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

    // ── 7. No console errors ────────────────────────────────────────────────
    console.log('\n7. Console is clean');
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
