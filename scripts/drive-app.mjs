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
 * without a hostility must render in the neutral default (black) and must never
 * flip to Friendly blue — `getColorByHostility(friend)` is `rgba(0,0,255,1)`.
 */
const isBlue = c => typeof c === 'string' && c.replace(/\s+/g, ' ').includes('0, 0, 255');
const isBlack = c => typeof c === 'string' && (c === '#000000' || c.replace(/\s+/g, ' ').includes('0, 0, 0'));

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
    // The draw button's label sticks at "Drawing…" after drawend — MapControls
    // derives it from `interactionMode`, which OpenLayers.tsx never resets to
    // `view`. Its handler restarts the draw for the newly selected shape either
    // way, so match on both labels rather than on "Add Graphic" alone.
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
        'unset hostility renders a black stroke (not Friendly blue)',
        (beforeLabel?.strokeColors.length ?? 0) > 0 && beforeLabel.strokeColors.every(isBlack) && !beforeLabel.strokeColors.some(isBlue),
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
        features.some(f => f.tacticalGraphic?.label === 'ALPHA'),
        JSON.stringify(features.map(f => f.tacticalGraphic?.label)),
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
        'renaming an unset-hostility graphic keeps its black stroke',
        (afterLabel?.strokeColors.length ?? 0) > 0 && afterLabel.strokeColors.every(isBlack) && !afterLabel.strokeColors.some(isBlue),
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

    // ── 4. Route direction icons ────────────────────────────────────────────
    // Guards src/tacticalgraphics/svg/*.svg, which render as ol/style/Icon.
    console.log('\n4. Route direction renders an arrow icon');
    await selectGraphic(page, 'route');
    const {mid: routeMid} = await drawLine(page, box, 0.45);
    await page.waitForTimeout(DRAW_END_GUARD_MS);

    await openDialogAt(page, routeMid);
    await page.fill('#name-input', 'MSR1');
    await chooseSelectOption(page, 'Direction', 'ONE_WAY');
    await applyAndCloseDialog(page);
    await page.waitForTimeout(400);
    await page.screenshot({path: join(SHOTS, '04-route-direction.png')});

    const icons = await page.evaluate(() => {
        const {map, manager} = window.__tacticalGraphics;
        const resolution = map.getView().getResolution();
        const srcs = [];
        for (const f of manager.renderingVectorSource.getFeatures()) {
            if (f.get('graphicName') !== 'Route' || typeof f.getStyle() !== 'function') continue;
            const result = f.getStyle()(f, resolution);
            for (const s of Array.isArray(result) ? result : [result]) {
                const src = s?.getImage?.()?.getSrc?.();
                if (src) srcs.push(src);
            }
        }
        return srcs;
    });
    check('route renders arrow icons', icons.length > 0, `${icons.length} icon(s)`);
    check(
        'icon resolves to a one-way arrow asset',
        icons.some(s => /one_way|data:image\/svg/.test(s)),
        icons[0]?.slice(0, 80),
    );

    // The icon is drawn onto a canvas by OL; a broken SVG would fail to decode.
    const iconsDecode = await page.evaluate(
        srcs =>
            Promise.all(
                srcs.map(
                    src =>
                        new Promise(resolve => {
                            const img = new Image();
                            img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
                            img.onerror = () => resolve(false);
                            img.src = src;
                        }),
                ),
            ),
        icons,
    );
    check('every arrow SVG decodes as an image', iconsDecode.length > 0 && iconsDecode.every(Boolean), JSON.stringify(iconsDecode));

    // ── 5. No console errors ────────────────────────────────────────────────
    console.log('\n5. Console is clean');
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
