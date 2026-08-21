/**
 * # Does every graphic *edit* the same on both engines?
 *
 * Both engines store the same portable description — `properties.tacticalGraphic` plus a
 * base geometry — so the honest comparison is not pixels but that description: give each
 * engine the identical starting snapshot and the identical gesture, and the numbers that
 * come out should match.
 *
 * The gestures are driven through `beginGesture`, with the pointer placed at a computed
 * multiple of the distance from the graphic's own anchor, and the view pinned to the same
 * centre and resolution on both engines first — without that, the two fit the gallery to
 * different zooms and every identical pixel drag is a different ground distance.
 *
 * ## What this measures well, and what it does not
 *
 * **Trust the structural rows**: a property one engine writes and the other does not, a
 * differing vertex count, a gesture allowed on one and refused on the other. Those are
 * real and each one has found a defect.
 *
 * **Do not trust the `moved N vs M` rows on their own.** They report how far the
 * centroid travelled, and for a graphic whose pivot is its *first vertex* — every line —
 * that number is wildly sensitive to where the drag started: the two engines' selection
 * boxes differ by a pixel or two, and a nearly-radial nudge about a distant pivot turns
 * that into a large angular difference. Three linear targets reported "0.000 vs 3.949"
 * and, driven with a deliberate swing instead, produced geometry agreeing to 0.1%.
 *
 * Confirm any movement-only row with a direct A/B before believing it.
 *
 * Usage: node scripts/probe-parity.mjs [limit]      ONLY=Name,Name to narrow
 */
import {chromium} from 'playwright';

const URL = process.env.APP_URL ?? 'http://localhost:3000/';
const LIMIT = Number(process.argv[2] ?? 0);

/** Rounded so floating-point noise between two renderers is not reported as drift. */
const round = (v, dp = 4) => (typeof v === 'number' && isFinite(v) ? Number(v.toFixed(dp)) : v);

async function runEngine(engine) {
    const browser = await chromium.launch();
    const page = await browser.newPage({viewport: {width: 1500, height: 950}});
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await page.goto(URL, {waitUntil: 'networkidle'});
    await page.waitForTimeout(1500);
    if (engine === 'maplibre') {
        await page.getByRole('button', {name: 'MapLibre', exact: true}).click();
        await page.waitForTimeout(2500);
    }

    // The gallery's own bases: one per graphic, identical on both engines by construction.
    await page.getByRole('button', {name: /draw samples/i}).click();
    await page.waitForTimeout(9000);
    const all = await page.evaluate(() => window.__tacticalEngine.snapshot());
    await page.evaluate(() => window.__tacticalEngine.clearAll());
    await page.waitForTimeout(400);

    let names = all.features.map(f => f.properties.tacticalGraphic.name);
    if (process.env.ONLY) {
        const wanted = process.env.ONLY.split(',');
        names = names.filter(n => wanted.includes(n));
    }
    const results = {};

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const one = {type: 'FeatureCollection', features: [all.features.find(f => f.properties.tacticalGraphic.name === name)]};
        const r = await page.evaluate(async ({snapshot}) => {
            const e = window.__tacticalEngine;
            const wait = ms => new Promise(res => setTimeout(res, ms));

            /*
             * **Pin the viewport before measuring.** The two engines fit the gallery to
             * different zooms (44 528 m/px against 39 842), so an identical pixel drag is
             * a different ground distance on each and every translate looks like drift.
             * Centre on the graphic at a fixed resolution and the comparison is real.
             *
             * Resolution is exponential in zoom on both, so one log2 correction lands
             * exactly rather than iterating.
             */
            const setView = (centre, targetRes) => {
                const ol = window.__tacticalGraphics?.manager;
                if (ol) {
                    const v = ol.map.getView();
                    v.setCenter(window.__olFromLonLat(centre));
                    v.setResolution(targetRes);
                    return;
                }
                const h = window.__tacticalGraphicsMapLibre;
                h.map.jumpTo({center: centre, zoom: h.map.getZoom() + Math.log2(h.resolutionOf() / targetRes)});
            };

            e.setInteractionMode('view');
            e.clearAll();
            e.restore(snapshot);
            await wait(90);
            /*
             * A real walk, not a regex over the JSON. `-?\d+\.?\d*` splits a coordinate
             * written in scientific notation — `1.23e-7` yields "1.23" and "7" — and the
             * stray 7 became a latitude of 7 degrees in the wrong slot, which is what
             * made MapLibre's `jumpTo` throw and took the whole sweep down with it.
             */
            const walkPositions = (node, into) => {
                if (!Array.isArray(node)) return into;
                if (typeof node[0] === 'number') { into.push(node); return into; }
                for (const child of node) walkPositions(child, into);
                return into;
            };
            const positions0 = walkPositions(snapshot.features[0].geometry.coordinates, []);
            const flat0 = {length: positions0.length * 2};
            let sx = 0, sy = 0;
            for (const [px, py] of positions0) { sx += px; sy += py; }
            /*
             * Clamped and checked: one graphic's snapshot produced a latitude outside
             * +-90 and MapLibre's `jumpTo` threw, which took the whole sweep down. A
             * probe that dies on graphic 40 reports nothing about graphics 41-273.
             */
            const centre = [sx / (flat0.length / 2), sy / (flat0.length / 2)];
            if (!isFinite(centre[0]) || !isFinite(centre[1])) return {error: 'no usable centroid'};
            centre[1] = Math.max(-85, Math.min(85, centre[1]));
            centre[0] = Math.max(-179, Math.min(179, centre[0]));
            setView(centre, 6000);
            await wait(220);
            e.setInteractionMode('edit');

            const id = e.snapshot().features[0]?.properties?.symbolId
                ?? (window.__tacticalGraphicsMapLibre?.native?.graphics?.[0]?.id);
            e.select(id ?? null);
            await wait(60);
            if (!e.getSelection()) return {error: 'not selected'};

            const box = e.selectionBox();
            const gestures = e.selectionGestures();
            if (!box) return {error: 'no selection box'};

            const host = document.querySelector('.map-container').getBoundingClientRect();
            const readout = () => {
                const f = e.snapshot().features[0];
                if (!f) return null;
                const t = {...f.properties.tacticalGraphic};
                delete t.name;
                const walk = (node, into) => {
                    if (!Array.isArray(node)) return into;
                    if (typeof node[0] === 'number') { into.push(node); return into; }
                    for (const child of node) walk(child, into);
                    return into;
                };
                const positions = walk(f.geometry.coordinates, []);
                const n = positions.length;
                let cx = 0, cy = 0;
                for (const [px, py] of positions) { cx += px; cy += py; }
                return {props: t, centroid: n ? [cx / n, cy / n] : null, vertices: n};
            };

            /** One gesture, from the box's own corner, to a multiple of its start distance. */
            const drive = async (kind, ratio, sidewaysPx) => {
                const before = readout();
                const startX = box.x + box.width, startY = box.y + box.height;
                const anchorX = box.x + box.width / 2, anchorY = box.y + box.height / 2;
                const vx = startX - anchorX, vy = startY - anchorY;
                const ok = e.beginGesture(kind, new PointerEvent('pointerdown', {
                    clientX: host.left + startX, clientY: host.top + startY, bubbles: true,
                }));
                if (!ok) return {refused: true};
                for (const t of [1, ratio]) {
                    window.dispatchEvent(new PointerEvent('pointermove', {
                        clientX: host.left + anchorX + vx * t + (sidewaysPx ?? 0),
                        clientY: host.top + anchorY + vy * t,
                        bubbles: true,
                    }));
                }
                window.dispatchEvent(new PointerEvent('pointerup', {bubbles: true}));
                await wait(40);
                const after = readout();
                return {before, after};
            };

            const out = {gestures, box: {w: Math.round(box.width), h: Math.round(box.height)}};
            out.resize = gestures?.resize ? await drive('resize', 1.5) : {refused: true};
            e.clearAll(); e.restore(snapshot); await wait(80);
            setView(centre, 6000); await wait(180);
            e.select(e.snapshot().features[0]?.properties?.symbolId
                ?? window.__tacticalGraphicsMapLibre?.native?.graphics?.[0]?.id ?? null);
            await wait(50);
            out.rotate = gestures?.rotate ? await drive('rotate', 1, 120) : {refused: true};
            e.clearAll(); e.restore(snapshot); await wait(80);
            setView(centre, 6000); await wait(180);
            e.select(e.snapshot().features[0]?.properties?.symbolId
                ?? window.__tacticalGraphicsMapLibre?.native?.graphics?.[0]?.id ?? null);
            await wait(50);
            out.translate = gestures?.translate ? await drive('translate', 1, 90) : {refused: true};
            return out;
        }, {snapshot: one}).catch(err => ({error: `threw: ${String(err).slice(0, 90)}`}));
        results[name] = r;
        if (LIMIT && i + 1 >= LIMIT) break;
    }

    await browser.close();
    return {results, errors};
}

const ol = await runEngine('openlayers');
const mlb = await runEngine('maplibre');

const names = Object.keys(ol.results);
const diffs = [];
const keyGaps = new Set();
for (const name of names) {
    const a = ol.results[name], b = mlb.results[name];
    if (!b) { diffs.push([name, 'missing on maplibre']); continue; }
    if (a.error || b.error) {
        if (a.error !== b.error) diffs.push([name, `ol:${a.error ?? 'ok'} mlb:${b.error ?? 'ok'}`]);
        continue;
    }
    const notes = [];
    for (const k of ['translate', 'rotate', 'resize']) {
        const ga = a.gestures?.[k], gb = b.gestures?.[k];
        if (ga !== gb) notes.push(`${k} allowed ${ga}/${gb}`);
        const ra = a[k], rb = b[k];
        if (!!ra?.refused !== !!rb?.refused) notes.push(`${k} refused ${!!ra?.refused}/${!!rb?.refused}`);
        if (ra?.after && rb?.after) {
            const ka = new Set([...Object.keys(ra.after.props), ...Object.keys(rb.after.props)]);
            for (const key of ka) {
                const va = round(ra.after.props[key]), vb = round(rb.after.props[key]);
                // A key one engine stamps and the other omits is a *persistence* gap, not
                // an editing one, and reporting both together buries the second. @see keyGaps
                if (va === undefined || vb === undefined) { keyGaps.add(`${key}: ol=${va} mlb=${vb}`); continue; }
                if (typeof va === 'number' && typeof vb === 'number') {
                    const rel = Math.abs(va - vb) / Math.max(1e-9, Math.abs(va), Math.abs(vb));
                    if (rel > 0.05) notes.push(`${k}.${key} ${va} vs ${vb}`);
                } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
                    notes.push(`${k}.${key} ${JSON.stringify(va)} vs ${JSON.stringify(vb)}`);
                }
            }
            const moved = (r) => r.before?.centroid && r.after?.centroid
                ? Math.hypot(r.after.centroid[0] - r.before.centroid[0], r.after.centroid[1] - r.before.centroid[1]) : null;
            const ma = moved(ra), mb = moved(rb);
            if (ma !== null && mb !== null) {
                const rel = Math.abs(ma - mb) / Math.max(1e-6, ma, mb);
                if (rel > 0.08) notes.push(`${k} moved ${ma.toFixed(3)} vs ${mb.toFixed(3)} deg`);
            }
            if (ra.after.vertices !== rb.after.vertices) notes.push(`${k} vertices ${ra.after.vertices}/${rb.after.vertices}`);
        }
    }
    if (notes.length) diffs.push([name, notes.join('; ')]);
}

console.log(`compared ${names.length} graphics`);
console.log(`OL page errors: ${ol.errors.length}, MapLibre page errors: ${mlb.errors.length}`);
if (ol.errors.length) console.log('  ol:', ol.errors.slice(0, 3).join(' | '));
if (mlb.errors.length) console.log('  mlb:', mlb.errors.slice(0, 3).join(' | '));
console.log(`\n${diffs.length} graphics differ:\n`);
for (const [n, d] of diffs) console.log(`  ${String(n).padEnd(36)} ${d}`);
