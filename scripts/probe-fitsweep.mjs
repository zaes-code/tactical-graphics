/**
 * Across the whole sample gallery: does any label render wider than the graphic it
 * belongs to? Reports the worst offenders. Diagnostic.
 */
import {chromium} from 'playwright';
const engine = process.argv[2] ?? 'openlayers';
const b = await chromium.launch();
const p = await b.newPage({viewport: {width: 1500, height: 950}});
await p.goto('http://localhost:3000/', {waitUntil: 'networkidle'});
await p.waitForTimeout(1500);
if (engine === 'maplibre') { await p.getByRole('button', {name: 'MapLibre', exact: true}).click(); await p.waitForTimeout(2500); }
await p.getByRole('button', {name: /draw all samples/i}).click();
await p.waitForTimeout(8000);

for (const dz of [0, 1, 2, 3]) {
    if (dz > 0) {
        await p.evaluate(() => {
            const m = window.__tacticalGraphics?.manager;
            if (m) { const v = m.map.getView(); v.setZoom(v.getZoom() - 1); }
            else { const mm = window.__tacticalGraphicsMapLibre.map; mm.setZoom(mm.getZoom() - 1); }
        });
        await p.waitForTimeout(1200);
    }
    const worst = await p.evaluate(() => {
        const ol = window.__tacticalGraphics?.manager;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const per = {};
        if (ol) {
            const res = ol.map.getView().getResolution();
            for (const f of ol.renderingVectorSource.getFeatures()) {
                const n = f.get('graphicName');
                if (!n || f.get('handle') || f.get('base') || f.get('measure')) continue;
                per[n] = per[n] ?? {shape: 0, text: 0, label: ''};
                const e = f.getGeometry()?.getExtent?.();
                if (e && e.every(Number.isFinite) && e[2] > e[0]) {
                    per[n].shape = Math.max(per[n].shape, (e[2] - e[0]) / res);
                }
                const fn = f.getStyleFunction?.();
                if (!fn) continue;
                let st; try { st = fn(f, res); } catch { continue; }
                for (const s of (Array.isArray(st) ? st : [st])) {
                    const t = s?.getText?.(); const txt = t?.getText?.();
                    if (!txt) continue;
                    const sc = t.getScale?.() ?? 1;
                    const sx = typeof sc === 'number' ? sc : (sc?.[0] ?? 1);
                    ctx.font = t.getFont?.() ?? 'bold 16px sans-serif';
                    for (const line of String(txt).split('\n')) {
                        const w = ctx.measureText(line).width * sx;
                        if (w > per[n].text) { per[n].text = w; per[n].label = line; }
                    }
                }
            }
        } else {
            const h = window.__tacticalGraphicsMapLibre;
            const res = h.resolutionOf();
            for (const g of h.native.graphics) {
                const n = g.name;
                per[n] = per[n] ?? {shape: 0, text: 0, label: ''};
                if (g.graphic?.bounds) per[n].shape = Math.max(per[n].shape, (g.graphic.bounds.maxX - g.graphic.bounds.minX) / res);
            }
            for (const f of (h.map.queryRenderedFeatures({layers: ['tg-symbol']}) ?? [])) {
                const pr = f.properties ?? {};
                const n = pr.tgId ? (h.native.graphics.find(x => x.id === pr.tgId)?.name) : null;
                if (!n || !pr.label || !per[n]) continue;
                ctx.font = `bold ${pr.size ?? 16}px sans-serif`;
                for (const line of String(pr.label).split('\n')) {
                    const w = ctx.measureText(line).width;
                    if (w > per[n].text) { per[n].text = w; per[n].label = line; }
                }
            }
        }
        return Object.entries(per)
            .filter(([, v]) => v.shape > 2 && v.text > 0)
            .map(([k, v]) => ({name: k, ratio: v.text / v.shape, shape: Math.round(v.shape), text: Math.round(v.text), label: v.label}))
            .sort((a, b) => b.ratio - a.ratio)
            .slice(0, 14);
    });
    console.log(`\n=== ${engine}, zoom-out ${dz} — worst label/shape ratios ===`);
    for (const w of worst) {
        console.log(`  ${w.ratio > 1 ? 'OVER' : '    '} ${w.ratio.toFixed(2)}  ${String(w.name).padEnd(32)} text ${w.text}px in ${w.shape}px  "${w.label}"`);
    }
}
await b.close();
