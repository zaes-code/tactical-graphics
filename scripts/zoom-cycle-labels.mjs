#!/usr/bin/env node
/**
 * Draw samples, zoom all the way in and out several times, and check nothing broke.
 *
 *   npm start
 *   npm run sweep:zoom            (exits 1 on any failure)
 *
 * Written for a defect no unit test could see (user's report, 2026-09-21). A MapLibre dash
 * layer had its `line-dasharray` rewritten on every zoom; tiles MapLibre had already built
 * kept pointing at the old pattern, its line render threw in `setConstantDashPositions`, and
 * the frame aborted before the symbol layer drew. A few full zoom cycles on the sample
 * gallery left the map with no labels at all, and every suite was green.
 *
 * Fails on **any page error** on either engine, and on MapLibre when fewer labels are rendered
 * at the starting view after the zooming than before it. **The page-error check is the one that
 * catches the original defect**: with it reinstated, the map recovers once the zooming stops,
 * so the label count read 320 -> 320 while 132 errors had been thrown on the way. OpenLayers' labels are canvas text
 * with no rendered-feature query, so its half is the page-error check.
 * `dashLayersAcrossZoom.test.ts` is the unit half.
 */
import {chromium} from 'playwright';

const URL = process.env.APP_URL ?? 'http://localhost:3000/';
const CYCLES = Number(process.env.TG_CYCLES ?? 3);

/** Rendered label features at the current view, or undefined on an engine that cannot say. */
const renderedLabels = page =>
    page.evaluate(() => {
        const mlb = window.__tacticalGraphicsMapLibre?.map;
        if (!mlb) return undefined;
        const layers = mlb.getStyle().layers.filter(l => l.type === 'symbol' && l.id.startsWith('tg-')).map(l => l.id);
        return mlb.queryRenderedFeatures({layers}).length;
    });

const failures = [];
for (const engine of ['maplibre', 'openlayers']) {
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
        if (m.type() === 'error') errors.push(m.text().slice(0, 200));
    });
    await page.addInitScript(e => localStorage.setItem('tg_mapEngine', e), engine);
    await page.goto(URL, {waitUntil: 'networkidle'});
    await page.waitForFunction(() => !!window.__tacticalEngine, {timeout: 30000});
    await page.waitForTimeout(2500);
    await page.getByRole('button', {name: /draw samples/i}).click();
    await page.waitForTimeout(3000);

    const view = await page.evaluate(() => {
        const ol = window.__tacticalGraphics?.map;
        if (ol) return {center: ol.getView().getCenter(), zoom: ol.getView().getZoom()};
        const m = window.__tacticalGraphicsMapLibre.map;
        return {center: m.getCenter().toArray(), zoom: m.getZoom()};
    });
    const before = await renderedLabels(page);

    // By the wheel, as a user does it: fractional zoom steps, all the way in and out.
    await page.mouse.move(1000, 520);
    for (let c = 0; c < CYCLES; c++) {
        for (let i = 0; i < 25; i++) {
            await page.mouse.wheel(0, -400);
            await page.waitForTimeout(60);
        }
        await page.waitForTimeout(800);
        for (let i = 0; i < 25; i++) {
            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(60);
        }
        await page.waitForTimeout(800);
    }

    // Back to the starting view, so the two counts describe the same picture.
    await page.evaluate(v => {
        const ol = window.__tacticalGraphics?.map;
        if (ol) {
            ol.getView().setCenter(v.center);
            ol.getView().setZoom(v.zoom);
        } else window.__tacticalGraphicsMapLibre.map.jumpTo({center: v.center, zoom: v.zoom});
    }, view);
    await page.waitForTimeout(3000);
    const after = await renderedLabels(page);

    const counts = before === undefined ? 'labels not queryable on this engine' : `labels ${before} -> ${after}`;
    console.log(`${engine.padEnd(10)} ${CYCLES} cycles  errors ${errors.length}  ${counts}`);
    if (errors.length) failures.push(`${engine}: ${errors.length} page errors, first: ${errors[0]}`);
    if (before !== undefined && (before === 0 || after < before)) failures.push(`${engine}: rendered labels ${before} -> ${after}`);
    await browser.close();
}

if (failures.length) {
    console.error('\nFAIL\n  ' + failures.join('\n  '));
    process.exit(1);
}
console.log('\nOK');
