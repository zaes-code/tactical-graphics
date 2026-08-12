#!/usr/bin/env node
/**
 * Generate one SVG thumbnail per tactical graphic, straight from the library.
 *
 * ## Why this exists
 *
 * The catalog page on zaes.com answers one question — "is my symbol in there,
 * and does it look right?" Hand-drawing 215 symbols would answer it with
 * decorative approximations that drift from the implementation the moment
 * anything changes, which is worse than not answering it at all.
 *
 * So this doesn't draw anything. It asks the library, through the same
 * renderer-agnostic seam MapLibre uses:
 *
 *     renderTacticalGraphic(base)      → GeoJSON in EPSG:4326
 *     project 4326 → 3857              → projected metres
 *     getPaintFunction(name)           → { graphic?, label? }
 *     painter(feature, context)        → Paint[]   ← plain data
 *     emit()                           → SVG
 *
 * `Paint` is already a description of marks — stroke, fill, text, circle, hatch,
 * all sized in screen pixels. Turning that into SVG is a transcription, not a
 * reimplementation, which is the whole point of the symbology layer living in
 * the map-agnostic half. This is effectively a third renderer that happens to
 * be static.
 *
 * ## Usage
 *
 *   npm run build                      # dist/ must be current — this reads it
 *   node scripts/gen-catalog-svgs.js [--out DIR] [--only Name] [--size WxH]
 *
 * Default --out is ../zaes.com/img/catalog, because the site is the only
 * consumer. The script lives here because the library does.
 *
 * ## Two things to know before changing it
 *
 * 1. **Some painters synthesise their shape from the BASE geometry, not the
 *    rendered graphic** — the corridors, and the point-anchored tasks. Feeding
 *    them `render.graphic` throws. `paintsFor` tries the graphic first and falls
 *    back to the base; don't "simplify" that away.
 *
 * 2. **Resolution is solved for, in two passes.** Paint sizes are screen pixels
 *    and geometry is metres, so the scale between them is `resolution`. Pass one
 *    paints at a guess to learn the metre extent; pass two re-paints at the
 *    resolution that makes that extent fill the tile. Screen-sized decorations
 *    legitimately change between the passes — that is the library behaving
 *    correctly, not drift.
 */

const fs = require('fs');
const path = require('path');

// ── Args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (flag, dflt) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const REPO = path.resolve(__dirname, '..');
const OUT = path.resolve(REPO, argOf('--out', path.join('..', 'zaes.com', 'img', 'catalog')));
const ONLY = argOf('--only', null);
const [TILE_W, TILE_H] = argOf('--size', '260x170').split('x').map(Number);
const PAD = 18; // px of breathing room inside the tile

let lib;
try {
    lib = require(path.join(REPO, 'dist', 'cjs', 'index.js'));
} catch (e) {
    console.error('Could not load dist/cjs — run `npm run build` first.\n' + e.message);
    process.exit(1);
}

const {
    TacticalGraphicName,
    listTacticalGraphicNames,
    renderTacticalGraphic,
    getPaintFunction,
    isPaintable,
    baseGeometryFor,
    baseVertexCount,
    getDisplayName,
    GRAPHIC_CATEGORIES,
} = lib;

// ── 4326 → 3857 ─────────────────────────────────────────────────────────────
const R = 6378137;
const toMetres = ([lon, lat]) => [(lon * Math.PI) / 180 * R, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R];
const project = geom => {
    if (!geom) return null;
    if (geom.type === 'GeometryCollection') return {type: 'GeometryCollection', geometries: geom.geometries.map(project)};
    const walk = c => (Array.isArray(c[0]) ? c.map(walk) : toMetres(c));
    return {type: geom.type, coordinates: walk(geom.coordinates)};
};

/**
 * Headless text measurement.
 *
 * `PaintContext.measureText` is injected precisely so this layer never needs a
 * DOM, and its docs say an approximation is acceptable — the marks still come
 * out, the glyph-measured gaps are just less exact. 0.58em per character is a
 * reasonable mean for bold sans-serif caps, which is what these labels are.
 */
const measureText = (text, font) => {
    const m = /([0-9.]+)px/.exec(font || '');
    const size = m ? parseFloat(m[1]) : 16;
    return String(text == null ? '' : text).length * size * 0.58;
};

// ── Canned base geometry ────────────────────────────────────────────────────
const LON = -77.0;
const LAT = 38.9;
const D = 0.02;

function makeBase(name) {
    const type = baseGeometryFor ? baseGeometryFor(name) : 'LineString';
    if (type === 'Point') return {type: 'Point', coordinates: [LON, LAT]};
    if (type === 'Polygon') {
        const w = D * 1.35;
        const h = D * 0.9;
        return {
            type: 'Polygon',
            coordinates: [[[LON - w, LAT - h], [LON + w, LAT - h], [LON + w, LAT + h], [LON - w, LAT + h], [LON - w, LAT - h]]],
        };
    }
    const n = Math.max(2, (baseVertexCount && baseVertexCount(name)) || 2);
    const pts = [];
    // A gentle arc rather than a straight run — it shows that the arrows and
    // corridors actually bend, which a straight line hides.
    for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        pts.push([LON - D * 1.4 + 2.8 * D * t, LAT - D * 0.55 + Math.sin(t * Math.PI) * D * 0.75]);
    }
    return {type: 'LineString', coordinates: pts};
}

const AMPLIFIERS = {radius: 900, rotation: 0, width: 500, rangeFan: undefined, decorationSize: undefined};

// ── Paint collection ────────────────────────────────────────────────────────
function paintsFor(name, resolution) {
    const props = Object.assign({name}, AMPLIFIERS);
    const baseGeom = makeBase(name);
    const render = renderTacticalGraphic({type: 'Feature', geometry: baseGeom, properties: {tacticalGraphic: props}});
    const painters = getPaintFunction(name);
    if (!painters) return [];

    const ctx = {resolution, measureText};
    const projectedBase = project(baseGeom);
    const out = [];

    const run = (fn, geom) => {
        if (!fn || !geom) return null;
        try {
            const r = fn({geometry: geom, properties: props, graphicSize: AMPLIFIERS.radius}, ctx);
            return Array.isArray(r) ? r : [];
        } catch (e) {
            return null;
        }
    };

    // Graphic marks: try the rendered shape, fall back to the base. See header note 1.
    let g = run(painters.graphic, project(render.graphic && render.graphic.geometry));
    if (g === null || g.length === 0) {
        const viaBase = run(painters.graphic, projectedBase);
        if (viaBase && viaBase.length) g = viaBase;
    }
    if (g) out.push(...g);

    let l = run(painters.label, project(render.labels && render.labels.geometry));
    if (l === null || l.length === 0) {
        const viaBase = run(painters.label, projectedBase);
        if (viaBase && viaBase.length) l = viaBase;
    }
    if (l) out.push(...l);

    return out;
}

// ── Geometry helpers ────────────────────────────────────────────────────────
function eachPosition(geom, fn) {
    if (!geom) return;
    const walk = c => {
        if (typeof c[0] === 'number') fn(c);
        else c.forEach(walk);
    };
    walk(geom.coordinates);
}

function extentOf(paints) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of paints) {
        eachPosition(p.geometry, ([x, y]) => {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        });
    }
    if (!isFinite(minX)) return null;
    return {minX, minY, maxX, maxY};
}

// ── SVG emission ────────────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n2 = v => (Math.round(v * 100) / 100).toString();

function fontSizeOf(font) {
    const m = /([0-9.]+)px/.exec(font || '');
    return m ? parseFloat(m[1]) : 16;
}
function fontFamilyOf(font) {
    const m = /[0-9.]+px\s+(.+)$/.exec(font || '');
    return m ? m[1] : 'sans-serif';
}
const isBold = font => /bold|[6-9]00/.test(font || '');
const isItalic = font => /italic/.test(font || '');

function strokeAttrs(s) {
    const a = [`stroke="${esc(s.color)}"`, `stroke-width="${n2(s.widthPx)}"`];
    if (s.dashPx && s.dashPx.length) a.push(`stroke-dasharray="${s.dashPx.map(n2).join(' ')}"`);
    a.push(`stroke-linecap="${s.cap || 'round'}"`);
    a.push(`stroke-linejoin="${s.join || 'round'}"`);
    return a.join(' ');
}

function emitPaints(paints, toPx) {
    const body = [];
    const defs = [];
    let patternSeq = 0;

    /**
     * Bounds of the emitted marks in px space.
     *
     * Geometry alone is not enough. End-anchored labels sit *outside* the line
     * they annotate — PhaseLine's "PL" lands at x=-17 on a 0..260 box — so a
     * tile fitted to geometry clips the very amplifier the catalog exists to
     * show. Dots and stroke weight overhang for the same reason, just less.
     */
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const grow = (x0, y0, x1, y1) => {
        if (x0 < bx0) bx0 = x0;
        if (y0 < by0) by0 = y0;
        if (x1 > bx1) bx1 = x1;
        if (y1 > by1) by1 = y1;
    };
    const growPoint = (x, y, pad) => grow(x - pad, y - pad, x + pad, y + pad);

    const ringsToPath = rings =>
        rings
            .map(ring => ring.map((pos, i) => `${i ? 'L' : 'M'}${toPx(pos).map(n2).join(' ')}`).join('') + 'Z')
            .join(' ');
    const lineToPath = line => line.map((pos, i) => `${i ? 'L' : 'M'}${toPx(pos).map(n2).join(' ')}`).join('');

    for (const p of paints) {
        const g = p.geometry;
        if (!g) continue;

        // Every mark's own geometry contributes, padded by half its stroke.
        const halfStroke = p.stroke ? p.stroke.widthPx / 2 : 0;
        eachPosition(g, pos => {
            const [x, y] = toPx(pos);
            growPoint(x, y, halfStroke);
        });

        // ── Fills (closed geometry only) ──
        if (p.fill && (g.type === 'Polygon' || g.type === 'MultiPolygon')) {
            let fillRef = esc(p.fill.color);
            if (p.fill.pattern && p.fill.pattern.kind === 'diagonal') {
                const id = `hatch${patternSeq++}`;
                const sz = Math.max(3, p.fill.pattern.sizePx);
                defs.push(
                    `<pattern id="${id}" width="${n2(sz)}" height="${n2(sz)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
                        `<line x1="0" y1="0" x2="0" y2="${n2(sz)}" stroke="${esc(p.fill.pattern.color)}" stroke-width="${n2(p.fill.pattern.lineWidthPx)}"/>` +
                        `</pattern>`,
                );
                fillRef = `url(#${id})`;
            }
            const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
            for (const rings of polys) body.push(`<path d="${ringsToPath(rings)}" fill="${fillRef}" fill-rule="evenodd"/>`);
        }

        // ── Strokes ──
        if (p.stroke) {
            const sa = strokeAttrs(p.stroke);
            if (g.type === 'LineString') body.push(`<path d="${lineToPath(g.coordinates)}" fill="none" ${sa}/>`);
            else if (g.type === 'MultiLineString') for (const l of g.coordinates) body.push(`<path d="${lineToPath(l)}" fill="none" ${sa}/>`);
            else if (g.type === 'Polygon') body.push(`<path d="${ringsToPath(g.coordinates)}" fill="none" ${sa}/>`);
            else if (g.type === 'MultiPolygon') for (const rings of g.coordinates) body.push(`<path d="${ringsToPath(rings)}" fill="none" ${sa}/>`);
        }

        // ── Dots ──
        if (p.circle) {
            const pts = g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : [];
            for (const pos of pts) {
                const [cx, cy] = toPx(pos);
                growPoint(cx, cy, p.circle.radiusPx + (p.circle.stroke ? p.circle.stroke.widthPx / 2 : 0));
                const a = [`cx="${n2(cx)}"`, `cy="${n2(cy)}"`, `r="${n2(p.circle.radiusPx)}"`];
                a.push(`fill="${p.circle.fill ? esc(p.circle.fill.color) : 'none'}"`);
                if (p.circle.stroke) a.push(strokeAttrs(p.circle.stroke));
                body.push(`<circle ${a.join(' ')}/>`);
            }
        }

        // ── Text ──
        if (p.text && p.text.text) {
            const pts = g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : [g.coordinates && g.coordinates[0]];
            for (const pos of pts) {
                if (!pos || typeof pos[0] !== 'number') continue;
                const [x, y] = toPx(pos);
                const scale = p.text.scale == null ? 1 : p.text.scale;
                const size = fontSizeOf(p.text.font) * scale;
                const anchor = p.text.align === 'left' ? 'start' : p.text.align === 'right' ? 'end' : 'middle';
                const baseline =
                    p.text.baseline === 'top' || p.text.baseline === 'hanging'
                        ? 'hanging'
                        : p.text.baseline === 'bottom' || p.text.baseline === 'alphabetic'
                          ? 'alphabetic'
                          : 'central';
                const dx = p.text.offsetXPx || 0;
                const dy = p.text.offsetYPx || 0;
                const rot = p.text.rotation ? (p.text.rotation * 180) / Math.PI : 0;
                const a = [
                    `x="${n2(x + dx)}"`,
                    `y="${n2(y + dy)}"`,
                    `font-family="${esc(fontFamilyOf(p.text.font))}"`,
                    `font-size="${n2(size)}"`,
                    `text-anchor="${anchor}"`,
                    `dominant-baseline="${baseline}"`,
                    `fill="${esc(p.text.fill)}"`,
                ];
                if (isBold(p.text.font)) a.push('font-weight="bold"');
                if (isItalic(p.text.font)) a.push('font-style="italic"');
                if (rot) a.push(`transform="rotate(${n2(rot)} ${n2(x + dx)} ${n2(y + dy)})"`);
                if (p.text.halo) {
                    a.push(`stroke="${esc(p.text.halo.color)}"`, `stroke-width="${n2(p.text.halo.widthPx)}"`, 'paint-order="stroke"', 'stroke-linejoin="round"');
                }
                const lines = String(p.text.text).split('\n');
                const widest = Math.max(...lines.map(ln => measureText(ln, p.text.font))) * scale;
                const tall = size * (lines.length === 1 ? 1 : 1.15 * lines.length);
                const tx = x + dx;
                const ty = y + dy;
                if (rot) {
                    // Rotated: bound by the diagonal rather than modelling the box.
                    growPoint(tx, ty, Math.hypot(widest, tall) / 2);
                } else {
                    const left = anchor === 'start' ? tx : anchor === 'end' ? tx - widest : tx - widest / 2;
                    const top = baseline === 'hanging' ? ty : baseline === 'alphabetic' ? ty - tall : ty - tall / 2;
                    grow(left, top, left + widest, top + tall);
                }
                if (lines.length === 1) {
                    body.push(`<text ${a.join(' ')}>${esc(p.text.text)}</text>`);
                } else {
                    const spans = lines
                        .map((ln, i) => `<tspan x="${n2(x + dx)}" dy="${i === 0 ? 0 : n2(size * 1.15)}">${esc(ln)}</tspan>`)
                        .join('');
                    body.push(`<text ${a.join(' ')}>${spans}</text>`);
                }
            }
        }
    }

    const bounds = isFinite(bx0) ? {x0: bx0, y0: by0, x1: bx1, y1: by1} : null;
    return {body, defs, bounds};
}

// ── One graphic ─────────────────────────────────────────────────────────────
function buildSvg(name) {
    // Pass 1 — learn the metre extent at a guessed resolution.
    let paints = paintsFor(name, 4);
    let ext = extentOf(paints);
    if (!ext) return null;

    const spanX = Math.max(ext.maxX - ext.minX, 1);
    const spanY = Math.max(ext.maxY - ext.minY, 1);
    const usableW = TILE_W - PAD * 2;
    const usableH = TILE_H - PAD * 2;
    let resolution = Math.max(spanX / usableW, spanY / usableH);
    if (!isFinite(resolution) || resolution <= 0) resolution = 4;

    // Pass 2 — repaint at the solved resolution so screen-sized decorations are
    // correct for the size they will actually be shown at.
    paints = paintsFor(name, resolution);
    ext = extentOf(paints) || ext;

    const w = (ext.maxX - ext.minX) / resolution;
    const h = (ext.maxY - ext.minY) / resolution;
    const offX = PAD + (usableW - w) / 2;
    const offY = PAD + (usableH - h) / 2;
    // Y flips: projected north is up, SVG y grows downward.
    const toPx = ([mx, my]) => [offX + (mx - ext.minX) / resolution, offY + (ext.maxY - my) / resolution];

    const {body, defs, bounds} = emitPaints(paints, toPx);
    if (!body.length) return null;

    // Fit the *emitted* extent — labels and dots included — into the tile.
    // Everything is already in px, so this is one wrapping transform rather
    // than another solve. Shrink only: never magnify a small symbol into a
    // blurry giant, and never let a stroke weight grow past what the library
    // asked for.
    let wrapOpen = '';
    let wrapClose = '';
    if (bounds) {
        const bw = Math.max(bounds.x1 - bounds.x0, 1);
        const bh = Math.max(bounds.y1 - bounds.y0, 1);
        const s = Math.min(usableW / bw, usableH / bh, 1);
        const tx = PAD + (usableW - bw * s) / 2 - bounds.x0 * s;
        const ty = PAD + (usableH - bh * s) / 2 - bounds.y0 * s;
        wrapOpen = `<g transform="translate(${n2(tx)} ${n2(ty)}) scale(${n2(s)})">`;
        wrapClose = '</g>';
    }

    const title = getDisplayName ? getDisplayName(name) : name;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE_W} ${TILE_H}" width="${TILE_W}" height="${TILE_H}" role="img" aria-label="${esc(title)}">` +
        `<title>${esc(title)}</title>` +
        (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
        wrapOpen +
        body.join('') +
        wrapClose +
        `</svg>\n`
    );
}

// ── Main ────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, {recursive: true});

const names = listTacticalGraphicNames().filter(n => !ONLY || n === ONLY);
const manifest = [];
const skipped = [];

for (const name of names) {
    if (!isPaintable(name)) {
        skipped.push([name, 'not paintable']);
        continue;
    }
    let svg = null;
    try {
        svg = buildSvg(name);
    } catch (e) {
        skipped.push([name, e.message.slice(0, 80)]);
        continue;
    }
    if (!svg) {
        skipped.push([name, 'no marks']);
        continue;
    }
    const file = `${name}.svg`;
    fs.writeFileSync(path.join(OUT, file), svg, 'utf8');
    manifest.push({
        name,
        display: getDisplayName ? getDisplayName(name) : name,
        category: (GRAPHIC_CATEGORIES && GRAPHIC_CATEGORIES[name]) || 'Uncategorised',
        base: baseGeometryFor ? baseGeometryFor(name) : 'LineString',
        file,
    });
}

manifest.sort((a, b) => a.display.localeCompare(b.display));
fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(manifest, null, 1), 'utf8');

/**
 * The same manifest as a classic script.
 *
 * The catalog page loads THIS, not the .json. `fetch()` is blocked against a
 * `file://` origin, so a page that fetches its own data works when served and
 * shows an error the moment anyone opens the .html directly to preview it — and
 * previewing a static site by opening the file is the normal thing to do here,
 * since this repo has no dev server. A `<script src>` has no such restriction.
 *
 * The .json stays because it is the useful artefact for anything else that wants
 * the list.
 */
fs.writeFileSync(
    path.join(OUT, 'catalog.js'),
    '/* GENERATED by scripts/gen-catalog-svgs.js — do not edit. */\n' + 'window.TG_CATALOG = ' + JSON.stringify(manifest) + ';\n',
    'utf8',
);

console.log(`out       : ${OUT}`);
console.log(`generated : ${manifest.length}`);
console.log(`skipped   : ${skipped.length}`);
for (const s of skipped.slice(0, 30)) console.log(`   - ${s[0]} => ${s[1]}`);
