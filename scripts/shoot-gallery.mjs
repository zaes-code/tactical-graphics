#!/usr/bin/env node
/**
 * Recaptures docs/images/sample-gallery.png — the hero screenshot in the
 * README, showing every proven graphic drawn at once.
 *
 * Run it whenever something visible in that picture changes: the app chrome,
 * the graphic styling, or the proven-graphics list itself (which the
 * pre-commit hook regenerates from the progress tracker).
 *
 *   npm start                     # in one terminal
 *   npm run shoot-gallery         # writes docs/images/sample-gallery.png
 *   npm run shoot-gallery -- out.png --headed
 *
 * Two details matter for the picture to stay consistent between captures:
 *
 * 1. The viewport must be 1600x1000. `drawProvenSamples` derives its grid
 *    columns from the map size, so a different viewport reflows the whole
 *    grid and the image stops being comparable to the previous one.
 * 2. The basemap is dimmed, not hidden. It was hidden outright, which left the
 *    symbols floating on flat colour with nothing to place them; at full
 *    strength, though, coastlines and place labels run under the symbols and
 *    fight them for legibility. {@link BASEMAP_OPACITY} is the compromise —
 *    enough coastline to read as a map, faint enough that the line work stays
 *    the brightest thing in the frame.
 */
import {chromium} from 'playwright';
import {mkdirSync} from 'fs';
import {dirname, join, resolve} from 'path';

const URL = process.env.APP_URL ?? 'http://localhost:3000/';
const HEADED = process.argv.includes('--headed');
const OUT = resolve(process.argv.slice(2).find(a => !a.startsWith('--')) ?? join('docs', 'images', 'sample-gallery.png'));

/** The committed image's dimensions. See note 1 above — do not change casually. */
const VIEWPORT = {width: 1600, height: 1000};

const browser = await chromium.launch({headless: !HEADED});
const page = await browser.newPage({viewport: VIEWPORT, deviceScaleFactor: 1});

/**
 * How strongly the basemap reads behind the symbols, 0-1.
 *
 * Tuned against the dark demo chrome: the graphics are near-white line work, so the
 * basemap has to sit clearly below them in contrast. Raise it and place labels start
 * competing with the amplifiers; drop it much further and the coastlines stop being
 * legible at all, which is the state this replaced.
 */
const BASEMAP_OPACITY = 0.35;

console.log(`opening ${URL}`);
await page.goto(URL, {waitUntil: 'load', timeout: 120_000});

// The dev-build hook installed by OpenLayers.tsx. Its presence means the map
// and manager are constructed, which is what the gallery needs.
await page.waitForFunction(() => !!window.__tacticalGraphics?.manager, null, {timeout: 120_000});
await page.waitForTimeout(2500);

await page.getByText('Draw samples', {exact: true}).click();

// See note 2 above. Identified by source rather than layer index so adding a
// layer to the demo doesn't silently dim the wrong one.
await page.evaluate(opacity => {
    window.__tacticalGraphics.map
        .getLayers()
        .getArray()
        .filter(l => typeof l.getSource === 'function' && l.getSource()?.getTileGrid)
        .forEach(l => l.setOpacity(opacity));
}, BASEMAP_OPACITY);

// **Wait for the tiles.** While the basemap was hidden it did not matter whether it
// had loaded; now a shot taken too early catches a half-tiled map, and the missing
// squares are conspicuous against the ones that arrived. `rendercomplete` fires when
// every source the frame needs has finished, which is exactly the condition.
await page.evaluate(
    () =>
        new Promise(resolve => {
            const map = window.__tacticalGraphics.map;
            const done = () => resolve();
            map.once('rendercomplete', done);
            map.render();
            setTimeout(done, 30_000); // never hang the capture on a slow tile server
        }),
);

// Settle: the sweep draws ~200 graphics, each adding several features. Wait for
// the count to stop climbing rather than guessing at a fixed delay.
let previous = -1;
for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const n = await page.evaluate(() => window.__tacticalGraphics.manager.renderingVectorSource.getFeatures().length);
    if (n > 0 && n === previous) break;
    previous = n;
}
await page.waitForTimeout(2000); // let OL finish the frame

const count = await page.evaluate(() => window.__tacticalGraphics.manager.renderingVectorSource.getFeatures().length);
if (!count) {
    await browser.close();
    throw new Error('no features rendered — did the sample sweep fail? run with --headed to watch it');
}

mkdirSync(dirname(OUT), {recursive: true});
await page.screenshot({path: OUT});
console.log(`${count} features rendered; wrote ${OUT}`);

await browser.close();
