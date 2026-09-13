/**
 * Every graphic's line work, in color, on both engines.
 *
 *   npm run sweep:colors
 *   ONLY=RoadblockCompleteExecuted npm run sweep:colors
 *
 * **Nothing else this repository runs looks at color.** The handle sweep measures geometry,
 * the modal sweep measures fields, `compare-engines` measures gestures and the round trip
 * measures coordinates — so 271204 drew in the draw-marker grey on one engine for weeks while
 * every sweep stayed green. The manual plate comparison of 2026-08 found six defects of this
 * class, and that is not something to run by hand every release.
 *
 * Three questions, in the order they are worth asking:
 *
 * 1. **Do the two engines paint the same set of colors?** A color on one and not the other
 *    is a defect whichever engine turns out to be right.
 * 2. **Does an obstacle carry 8.1.4.3's green?** That paragraph beats affiliation, and the
 *    library states the membership in `OBSTACLE_GRAPHICS`. This is the check the roadblock
 *    would have failed.
 * 3. **Does each engine paint every color the shared paint assigns?** The generated
 *    thumbnails are rendered from that paint and nothing else, so they are the library's own
 *    answer to what a symbol looks like. Any color in one that is neither the palette's
 *    default line color nor a label halo is a *fixed doctrinal* color — 8.1.4.3's green,
 *    CBRN's yellow — and an engine missing it has not asked for the registered paint. This is
 *    the general form of question 2, and it is what would have caught the roadblock without
 *    anyone having to know it was an obstacle.
 *
 * The palette's default is deliberately excluded, because the demo runs a dark palette and the
 * thumbnails a light one: black here is "whatever the host configured", not a doctrinal choice.
 * A graphic whose doctrine really is black is therefore not covered by question 3.
 *
 * Read off each engine's own answer rather than off a screenshot: OpenLayers resolves its style
 * function, MapLibre carries the color as a feature property its layers read through
 * `['get', 'color']`. A pixel count cannot tell a symbol's ink from a basemap's.
 */
import {chromium} from 'playwright';
import fs from 'fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const lib = require('../dist/cjs/index.js');
const {
    listTacticalGraphicNames,
    baseGeometryFor,
    baseVertexCount,
    synthesizedBase,
    normalizeDrawnBase,
    drawsAsObstacle,
    getObstacleColor,
    getLabelHaloColor,
    getLabelFillColor,
} = lib;
const {GRAPHIC_THUMBNAIL_SVGS} = require('../dist/cjs/assets/graphicThumbnails.js');

const CENTRE = [-0.35, 40];
const HALF = 0.35;
const RES = 1200;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : undefined;

function baseFor(name) {
    const kind = baseGeometryFor(name);
    const [cx, cy] = CENTRE;
    if (kind === 'Point') return {type: 'Point', coordinates: [cx, cy]};
    if (kind === 'Polygon') {
        const ring = [[cx - HALF, cy - HALF * 0.7], [cx + HALF, cy - HALF * 0.7], [cx + HALF, cy + HALF * 0.7], [cx - HALF, cy + HALF * 0.7]];
        return {type: 'Polygon', coordinates: [[...ring, ring[0]]]};
    }
    if (kind !== 'LineString') return undefined;
    const want = baseVertexCount(name) ?? 3;
    const stated = synthesizedBase(name, CENTRE, HALF, want);
    const run = stated ?? (want === 2
        ? [[cx - HALF, cy], [cx + HALF, cy]]
        : Array.from({length: want}, (_, i) => {
            const t = want === 1 ? 0.5 : i / (want - 1);
            return [cx - HALF + 2 * HALF * t, cy + HALF * 0.25 * Math.sin(Math.PI * t)];
        }));
    return {type: 'LineString', coordinates: normalizeDrawnBase(name, run, RES)};
}

const featureFor = name => ({
    type: 'Feature',
    geometry: baseFor(name),
    properties: {tacticalGraphic: {name, radius: 40000, rotation: 0}, role: 'base', graphicName: name, symbolId: `c-${name}`},
});

const NAMES = listTacticalGraphicNames().filter(n => (!ONLY || ONLY.has(n)) && baseFor(n));

/**
 * Label chrome, which the two engines file in different places.
 *
 * OpenLayers keeps a label's halo and text on its `label` feature, which the collector below
 * already skips; MapLibre renders the halo as an ordinary fill in `tg-fill`, where no property
 * distinguishes it from the symbol's own. Named from the config rather than as literals, so a
 * host palette change does not quietly turn this into a filter over nothing.
 */
const CHROME = [getLabelHaloColor(), getLabelFillColor()].filter(Boolean);

/** `rgb(0, 255, 0)`, `#0f0` and `#00FF00` are one color; opacity is not part of the question. */
function canonical(value) {
    const text = String(value).trim().toLowerCase();
    const rgb = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    let parts;
    if (rgb) {
        parts = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    } else {
        const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
        if (hex) {
            const full = hex[1].length === 3 ? hex[1].replace(/(.)/g, '$1$1') : hex[1];
            parts = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
        }
    }
    if (!parts || parts.some(n => !Number.isFinite(n))) return text;
    return '#' + parts.map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
}

/** The palette's own default and the label halo, which say nothing about doctrine. */
const NOT_DOCTRINAL = new Set(['#000000', '#ffffff', 'none']);

/**
 * The fixed colors the shared paint gives this symbol, read off its generated thumbnail.
 *
 * The thumbnails are rendered from `dist/` by the paint layer and nothing else, so they are
 * the library's own answer. Pattern fills (`url(#hatch0)`) are dropped: the pattern carries
 * its own color and the reference does not.
 */
function doctrinalColors(name) {
    const svg = GRAPHIC_THUMBNAIL_SVGS[name] || '';
    // **Pattern definitions are cut out first.** A hatch's own colors live inside a
    // `<pattern>` block in SVG and inside an opaque `CanvasPattern` on OpenLayers, so neither
    // engine can be asked for them — comparing against them reported a CBRN area as missing
    // its yellow when the yellow was in the hatch all along.
    const size = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    const painted = svg
        .replace(/<pattern[\s\S]*?<\/pattern>/g, '')
        .replace(/<defs[\s\S]*?<\/defs>/g, '')
        // **And the thumbnail's own backdrop.** A handful of graphics are drawn on a slate
        // rectangle so a pale fill reads at thumbnail size; it is the sheet, not the symbol,
        // and it made 240900 look as though both engines were missing a doctrinal color.
        // Matched as a rect filling the whole viewBox rather than by its color.
        .replace(new RegExp(`<rect[^>]*width="${size ? size[1] : '\d+'}"[^>]*height="${size ? size[2] : '\d+'}"[^>]*\/>`, 'g'), '');
    const found = [...painted.matchAll(/(?:stroke|fill)="([^"]+)"/g)].map(m => canonical(m[1]));
    return [...new Set(found)].filter(color => !NOT_DOCTRINAL.has(color) && !color.startsWith('url('));
}

/** A quick way to ask what the paint assigns, without launching anything. */
if (process.env.DOCTRINAL_ONLY) {
    NAMES.forEach(name => console.log(name.padEnd(44), doctrinalColors(name).join(' ')));
    process.exit(0);
}

async function run(engine) {
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1400, height: 900}});
    await page.addInitScript(e => localStorage.setItem('tg_mapEngine', e), engine);
    await page.goto('http://localhost:3000/', {waitUntil: 'networkidle'});
    await page.waitForFunction(() => !!window.__tacticalEngine, {timeout: 30000});
    await page.waitForTimeout(3000);

    const out = {};
    for (const name of NAMES) {
        out[name] = await page.evaluate(async ({fc, id, lonLat, target, chrome}) => {
            const e = window.__tacticalEngine;
            const settle = ms => new Promise(r => setTimeout(r, ms));
            let held = 0;
            for (let attempt = 0; attempt < 4 && !held; attempt++) {
                e.clearAll();
                e.restore(fc);
                held = e.snapshot().features.length;
                if (!held) await settle(300 * (attempt + 1));
            }
            if (!held) return {restored: false};

            const mlb = window.__tacticalGraphicsMapLibre;
            if (mlb) {
                mlb.map.jumpTo({center: {lng: lonLat[0], lat: lonLat[1]}});
                mlb.map.jumpTo({zoom: mlb.map.getZoom() + Math.log2(mlb.resolutionOf() / target)});
                await settle(800);
                // The color rides as a feature property; the line and fill layers read it
                // through a `get` expression, so this is the engine's own answer rather than
                // a guess at one. Editor chrome is excluded by layer id.
                /*
                 * **Filtered by layer type, not by name.** Both engines have to be asked about
                 * the same thing — the symbol's own line work and fills — and OpenLayers is
                 * filtered to `role === 'graphic'` below, which already leaves its labels out.
                 * MapLibre draws its text in `tg-symbol`, whose id says nothing about text, so
                 * a name filter let the label color in and reported it as a difference. Every
                 * text and icon layer is of type `symbol`; line work is `line`, `fill` or
                 * `circle`.
                 */
                const layers = mlb.map.getStyle().layers
                    .filter(layer => /^tg-/.test(layer.id)
                        && ['line', 'fill', 'circle'].includes(layer.type)
                        && !/handle|sketch|measure|hint|connector|marker/i.test(layer.id))
                    .map(layer => layer.id);
                const colors = new Set();
                for (const f of mlb.map.queryRenderedFeatures({layers})) {
                    const props = f.properties || {};
                    const c = props.color || props.fill;
                    // The hatch has a layer of its own, and its colors live in an image the
                    // style references rather than in a property — the same blind spot the
                    // thumbnail's `<pattern>` block is. Recorded as a token on both sides.
                    if (/pattern/i.test(f.layer.id)) colors.add('pattern');
                    else if (c && !chrome.includes(String(c))) colors.add(String(c));
                }
                return {colors: [...colors]};
            }

            const map = window.__tacticalGraphics.map;
            map.getView().setCenter(window.__olFromLonLat(lonLat));
            map.getView().setResolution(target);
            map.renderSync();
            await settle(300);
            const colors = new Set();
            const labelColors = new Set();
            map.getLayers().forEach(layer => {
                const source = layer.getSource && layer.getSource();
                const features = source && source.getFeatures ? source.getFeatures() : [];
                features.forEach(f => {
                    const role = f.get('role');
                    if (role !== 'graphic' && role !== 'label') return;
                    const into = role === 'label' ? labelColors : colors;
                    const fn = f.getStyleFunction && f.getStyleFunction();
                    const styles = fn ? fn(f, target) : (f.getStyle && f.getStyle());
                    (Array.isArray(styles) ? styles : [styles]).forEach(st => {
                        if (!st) return;
                        const stroke = st.getStroke && st.getStroke();
                        const fill = st.getFill && st.getFill();
                        const strokeColor = stroke && stroke.getColor && stroke.getColor();
                        const fillColor = fill && fill.getColor && fill.getColor();
                        if (typeof strokeColor === 'string') into.add(strokeColor);
                        if (typeof fillColor === 'string') into.add(fillColor);
                        // A hatch is a `CanvasPattern` here and a `<pattern>` block in the
                        // thumbnails, and neither hands back the colors inside it. Recorded
                        // as a token so the two engines can still be compared on *having* one.
                        else if (fillColor) into.add('pattern');
                    });
                });
            });
            return {colors: [...colors], labelColors: [...labelColors]};
        }, {fc: {type: 'FeatureCollection', tacticalGraphicsVersion: 2, features: [featureFor(name)]}, id: `c-${name}`, lonLat: CENTRE, target: RES, chrome: CHROME});
    }
    await browser.close();
    return out;
}

const ol = await run('openlayers');
const mlb = await run('maplibre');
fs.writeFileSync('tmp/color-sweep.json', JSON.stringify({openlayers: ol, maplibre: mlb}, null, 1));

const GREEN = canonical(getObstacleColor() || '#00ff00');
const buckets = {agree: [], different: [], notGreen: [], missingDoctrinal: [], noInk: [], broken: []};

for (const name of NAMES) {
    const a = ol[name];
    const b = mlb[name];
    if (!a || !b || a.restored === false || b.restored === false) { buckets.broken.push(name); continue; }
    const setOf = row => [...new Set((row.colors || []).map(canonical))].sort();
    const ca = setOf(a);
    /*
     * **Label chrome, subtracted using OpenLayers' own answer for what it is.**
     *
     * That engine keeps a label's halo and text on a `label` feature, so it knows; MapLibre
     * renders the halo as an ordinary fill in `tg-fill` with no property to tell it apart, and
     * the demo's palette is applied in the page, so node cannot name the color either. What is
     * dropped is only a color OpenLayers draws on a label and **nowhere** in the symbol's own
     * line work, so a graphic that genuinely strokes in the halo color is still compared.
     */
    const chrome = new Set((a.labelColors || []).map(canonical).filter(color => !ca.includes(color)));
    const cb = setOf(b).filter(color => !chrome.has(color));

    if (!ca.length && !cb.length) { buckets.noInk.push(`${name}: neither engine reported a color`); continue; }
    if (ca.join(',') !== cb.join(',')) buckets.different.push(`${name}: ol [${ca.join(' ')}] mlb [${cb.join(' ')}]`);
    else buckets.agree.push(name);

    if (drawsAsObstacle(name) && !(ca.includes(GREEN) && cb.includes(GREEN))) {
        buckets.notGreen.push(`${name}: obstacle — ol ${ca.includes(GREEN) ? 'green' : 'NOT green'}, mlb ${cb.includes(GREEN) ? 'green' : 'NOT green'}`);
    }
    const wanted = doctrinalColors(name);
    const missing = wanted.filter(color => !ca.includes(color) || !cb.includes(color));
    if (missing.length) {
        buckets.missingDoctrinal.push(
            `${name}: the paint assigns [${wanted.join(' ')}], missing [${missing.join(' ')}] — ` +
            `ol [${ca.join(' ')}] mlb [${cb.join(' ')}]`,
        );
    }
}

console.log(`\n${NAMES.length} graphics, obstacle green ${GREEN}\n`);
console.log(`  same colors on both engines   ${String(buckets.agree.length).padStart(4)}`);
console.log(`  different colors              ${String(buckets.different.length).padStart(4)}`);
console.log(`  obstacle not drawn green      ${String(buckets.notGreen.length).padStart(4)}`);
console.log(`  a doctrinal color missing     ${String(buckets.missingDoctrinal.length).padStart(4)}`);
console.log(`  neither engine reported ink   ${String(buckets.noInk.length).padStart(4)}`);
console.log(`  could not compare             ${String(buckets.broken.length).padStart(4)}`);
for (const key of ['different', 'notGreen', 'missingDoctrinal', 'noInk', 'broken']) {
    if (!buckets[key].length) continue;
    console.log(`\n--- ${key} ---`);
    buckets[key].forEach(row => console.log('  ' + row));
}
