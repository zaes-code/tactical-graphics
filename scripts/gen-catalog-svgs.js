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
/**
 * The tile a thumbnail is composed against. A graphic may be painted into a multiple
 * of it — @see ZOOM_STEPS — and the page scales whatever comes out to its own grid, so
 * these are proportions rather than pixels a viewer ever sees.
 */
const [BASE_TILE_W, BASE_TILE_H] = argOf('--size', '260x170').split('x').map(Number);
const BASE_PAD = 18; // px of breathing room inside the tile

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
    storedOrder,
    getDisplayName,
    GRAPHIC_CATEGORIES,
    isRectangular,
    CORRIDOR_GRAPHICS,
} = lib;

// ── 4326 → 3857 ─────────────────────────────────────────────────────────────
const R = 6378137;
const toMetres = ([lon, lat]) => [(lon * Math.PI) / 180 * R, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * R];
const project = geom => {
    if (!geom) return null;
    if (geom.type === 'GeometryCollection') return {type: 'GeometryCollection', geometries: geom.geometries.map(project)};
    // **An empty array stays empty.** `Array.isArray(c[0])` is false for `[]`, so without
    // this an empty MultiPoint — which is what a graphic with no label anchor emits —
    // became `toMetres([])`, i.e. one position of `[NaN, NaN]`. A paint reading it saw two
    // finite-looking anchors, passed its own "fewer than two" guard, and wrote a label at
    // `x="NaN"`. Both fords shipped that way. The library was never wrong; this is a
    // harness bug, and the harness is the thing nobody checks.
    const walk = c => (c.length === 0 ? [] : Array.isArray(c[0]) ? c.map(walk) : toMetres(c));
    return {type: geom.type, coordinates: walk(geom.coordinates)};
};

/**
 * Headless text measurement.
 *
 * `PaintContext.measureText` is injected precisely so this layer never needs a
 * DOM, and its docs say an approximation is acceptable. This one is better than an
 * approximation: it adds up per-character advance widths taken from the very metric
 * set the browser would use, so a label's box is right to a fraction of a pixel
 * whether it is three bold caps or a 27-character date-time pair.
 *
 * It matters twice over — the paints size their own gaps from it, and the tile's
 * label-collision check believes it. @see CHAR_EM
 */
/**
 * Advance widths for printable ASCII, in em, keyed by weight.
 *
 * **Measured, not guessed.** These came out of a browser's own `canvas.measureText` at
 * `bold 64px sans-serif` and `64px sans-serif`, which on every platform this runs on is
 * the Arial/Helvetica metric set the labels are actually rendered in.
 *
 * A single mean per character does not survive contact with these strings: bold caps
 * average 0.688em and a digit is 0.556em flat, so one figure is 12% wrong on `ROUTE
 * ALPHA` in one direction and 4% wrong on a DTG pair in the other. That was enough to
 * report a collision between labels that never touch, and to miss one that does.
 */
const CHAR_EM = {
    bold: [
        0.278, 0.333, 0.474, 0.556, 0.556, 0.889, 0.722, 0.238, 0.333, 0.333, 0.389, 0.584, 0.278,
        0.333, 0.278, 0.278, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556,
        0.333, 0.333, 0.584, 0.584, 0.584, 0.611, 0.975, 0.722, 0.722, 0.722, 0.722, 0.667, 0.611,
        0.778, 0.722, 0.278, 0.556, 0.722, 0.611, 0.833, 0.722, 0.778, 0.667, 0.778, 0.722, 0.667,
        0.611, 0.722, 0.667, 0.944, 0.667, 0.667, 0.611, 0.333, 0.278, 0.333, 0.584, 0.556, 0.333,
        0.556, 0.611, 0.556, 0.611, 0.556, 0.333, 0.611, 0.611, 0.278, 0.278, 0.556, 0.278, 0.889,
        0.611, 0.611, 0.611, 0.611, 0.389, 0.556, 0.333, 0.611, 0.556, 0.778, 0.556, 0.556, 0.5, 0.389,
        0.28, 0.389, 0.584
    ],
    regular: [
        0.278, 0.278, 0.355, 0.556, 0.556, 0.889, 0.667, 0.191, 0.333, 0.333, 0.389, 0.584, 0.278,
        0.333, 0.278, 0.278, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556, 0.556,
        0.278, 0.278, 0.584, 0.584, 0.584, 0.556, 1.015, 0.667, 0.667, 0.722, 0.722, 0.667, 0.611,
        0.778, 0.722, 0.278, 0.5, 0.667, 0.556, 0.833, 0.722, 0.778, 0.667, 0.778, 0.722, 0.667, 0.611,
        0.722, 0.667, 0.944, 0.667, 0.667, 0.611, 0.278, 0.278, 0.278, 0.469, 0.556, 0.333, 0.556,
        0.556, 0.5, 0.556, 0.556, 0.278, 0.556, 0.556, 0.222, 0.222, 0.5, 0.222, 0.833, 0.556, 0.556,
        0.556, 0.556, 0.333, 0.5, 0.278, 0.556, 0.5, 0.722, 0.5, 0.5, 0.5, 0.334, 0.26, 0.334, 0.584
    ],
};
const FALLBACK_EM = 0.6; // anything outside printable ASCII

const measureText = (text, font) => {
    const m = /([0-9.]+)px/.exec(font || '');
    const size = m ? parseFloat(m[1]) : 16;
    const widths = /bold|[6-9]00/.test(font || '') ? CHAR_EM.bold : CHAR_EM.regular;
    let em = 0;
    for (const ch of String(text == null ? '' : text)) {
        const code = ch.charCodeAt(0) - 32;
        em += code >= 0 && code < widths.length ? widths[code] : FALLBACK_EM;
    }
    return em * size;
};

// ── Canned base geometry ────────────────────────────────────────────────────
const LON = -77.0;
const LAT = 38.9;
const D = 0.02;

/**
 * **Presentation overrides — the thumbnail is a portrait, not a screenshot.**
 *
 * One canned base and one full amplifier bag suit most of the 288. The handful below
 * do not, and each for a reason the symbol itself states: a fields-of-fire is a V and
 * its arrowheads point out along the legs, so the apex has to be at the bottom for
 * them to read as pointing up; a ford is two rails a readable distance apart, and the
 * rails come from `width`; a corridor's amplifier block is five stacked lines that
 * bury the corridor it annotates.
 *
 * These change what the CATALOG asks for. None of them changes what the library draws
 * when asked the same question — if a symbol only looks right here, that belongs in
 * the library, not in this table.
 */

/** Fields of fire: generator order is `[end, apex, end]` — @see asVee in graphics/FieldsOfFire.ts. */
const veeBase = () => [
    [LON - D * 1.05, LAT + D * 0.62],
    [LON, LAT - D * 0.72],
    [LON + D * 1.05, LAT + D * 0.62],
];

/** A straight run of `span` degrees, for the symbols whose glyphs need elbow room. */
const straightBase = span => () => [
    [LON - D * span, LAT],
    [LON + D * span, LAT],
];

const SHAPED_BASES = {
    [TacticalGraphicName.FieldsOfFire]: veeBase,
    // The bowtie and the label are both fixed screen sizes sitting ON the line, so a
    // short run packs them into each other however the tile is fitted.
    [TacticalGraphicName.AviationDirectionOfAttack]: straightBase(3.1),
    // A ford reads as a crossing only if its two dashed rails are far enough apart to
    // be two lines. They are offset by width/2, so the run has to stay short.
    [TacticalGraphicName.FordEasy]: straightBase(0.85),
    [TacticalGraphicName.FordDifficult]: straightBase(0.85),
};

/** Amplifiers that put text on the symbol. Dropped wholesale for the corridors. */
const TEXT_AMPLIFIERS = [
    'designation',
    'secondDesignation',
    'countryCode',
    'secondCountryCode',
    'startDate',
    'endDate',
    'eff',
    'weapon',
    'grid',
    'minAltitude',
    'maxAltitude',
    'altitudeDatum',
    'echelon',
];

/**
 * The corridors carry an amplifier block — name, width, both altitudes, both DTGs —
 * anchored above the run. At thumbnail size it is larger than the corridor and covers
 * it, so the catalog draws these without it.
 *
 * What stays is the part that identifies the symbol rather than annotating it: the
 * designator the corridor always carries (`AC`, `MRR`, `SC`, …) and its ACP markers.
 * Dropping those too would leave eight different corridors rendering as one identical
 * picture, which is the failure a catalog exists to prevent.
 *
 * `width` is the awkward one: the block's WIDTH line is derived from it, but so are
 * the rails. So it is dropped from the properties handed to the PAINTERS and kept in
 * the ones handed to the generator. @see paintPropsFor
 *
 * The membership is the library's own `CORRIDOR_GRAPHICS`, not a copy — a list kept
 * here was already missing the safe lane.
 */
const isCorridor = name => CORRIDOR_GRAPHICS.includes(name);

/**
 * A rectangular zone's amplifiers are stacked INSIDE it, so its across dimension is
 * what decides whether they fit. 500 m against a ~4.9 km axis is a slot a tenth as
 * tall as the text it has to hold. This is the catalog choosing a comfortable zone to
 * draw, exactly as an operator would drag one.
 */
const RECTANGLE_WIDTH_M = 2600;

/** A ford's rails are ±width/2 off the base. @see SHAPED_BASES for the matching run. */
const FORD_WIDTH_M = 700;

function makeBase(name) {
    const type = baseGeometryFor ? baseGeometryFor(name) : 'LineString';
    const shaped = SHAPED_BASES[name];
    if (shaped) return {type: 'LineString', coordinates: storedOrder ? storedOrder(name, shaped()) : shaped()};
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
    // **In the order the graphic files its points.** Thirty of them store the arrowhead
    // as point 1, so a left-to-right path aims them back the way they came and the
    // catalog fills with arrows pointing at the previous thumbnail. @see storedOrder
    return {type: 'LineString', coordinates: storedOrder ? storedOrder(name, pts) : pts};
}

/**
 * **Every amplifier the schema carries, filled in.**
 *
 * The catalog used to send a bare `radius` and nothing else, so its thumbnails showed line
 * work and no text — and a plate dense with `T`, `W` and `B` boxes had nothing to be
 * compared against. Filling the whole bag makes each thumbnail show what an operator
 * actually ends up with: the designation, the dates, the echelon, the altitudes, the mine
 * type, all in the layout the symbol puts them in.
 *
 * Two fields are deliberately left out. `hostility` would tint all 283 symbols, and these
 * are being compared against black-and-white plates; `status` would dash them, which is a
 * *different symbol* on the several graphics whose broken line is doctrinal rather than a
 * status. Both would be showing something other than the thing under review.
 */
const AMPLIFIERS = {
    // Geometry inputs.
    radius: 900,
    rotation: 0,
    width: 500,
    decorationSize: undefined,

    // Text amplifiers.
    designation: 'ALPHA',
    secondDesignation: 'BRAVO',
    countryCode: 'USA',
    secondCountryCode: 'CAN',
    startDate: '021200ZJUN26',
    endDate: '021800ZJUN26',
    eff: '021200Z-021800Z',
    weapon: 'M252 81mm',
    grid: '18SUJ2345',
    minAltitude: 500,
    maxAltitude: 2000,
    altitudeDatum: 'AGL',

    // Selectors.
    echelon: 'Battalion/Squadron',
    direction: 'ONE_WAY',
    mineType: 'Antitank Mine',

    // The range fans draw one ring per band and nothing without them.
    rangeFan: {bands: [{range: 12, label: 'MIN'}, {range: 28, altitude: '3000FT AGL'}]},
};

/**
 * The bag handed to the PAINTERS, which is not always the bag the geometry was built
 * from. A corridor needs `width` to have rails and does not need it read back out as a
 * line of text over them.
 */
function paintPropsFor(name, props) {
    if (!isCorridor(name)) return props;
    const painted = Object.assign({}, props);
    delete painted.width;
    return painted;
}

/**
 * When a symbol's text will not fit a thumbnail at any canvas, this is the order it is
 * given up in.
 *
 * A date-time pair is 27 characters — wider than the tile — and the lines carry one at
 * BOTH ends, so eleven of them cannot be drawn to scale with the pair intact. Zooming
 * far enough to separate them shrinks the symbol to a sixth of the tile and the text to
 * a smudge, which answers the collision and loses the thing the catalog is for.
 *
 * So the end date goes first, then the pair, and the designation — the amplifier that
 * says which symbol this is — is never dropped.
 */
const AMPLIFIER_FALLBACKS = [[], ['endDate'], ['endDate', 'startDate', 'eff']];

/** The bag this graphic is drawn with. @see the presentation overrides above. */
function amplifiersFor(name, drop) {
    const amp = Object.assign({}, AMPLIFIERS);
    for (const field of drop || []) delete amp[field];
    if (isCorridor(name)) for (const field of TEXT_AMPLIFIERS) delete amp[field];

    if (isRectangular && isRectangular(name)) amp.width = RECTANGLE_WIDTH_M;
    if (name === TacticalGraphicName.FordEasy || name === TacticalGraphicName.FordDifficult) amp.width = FORD_WIDTH_M;
    return amp;
}

// ── Paint collection ────────────────────────────────────────────────────────
function paintsFor(name, resolution, drop) {
    const props = Object.assign({name}, amplifiersFor(name, drop));
    const baseGeom = makeBase(name);
    const render = renderTacticalGraphic({type: 'Feature', geometry: baseGeom, properties: {tacticalGraphic: props}});
    const painters = getPaintFunction(name);
    if (!painters) return [];

    const paintProps = paintPropsFor(name, props);
    const ctx = {resolution, measureText};
    const projectedBase = project(baseGeom);
    const out = [];

    // The area painters that set a glyph *inside* a shape need to know the shape: the
    // CBRN triangle, the airfield's runways, the PsyOps loudspeaker and the mine row all
    // ask `fitSymbolScale` how much room there is, and the artillery areas and the
    // radiation contour cut their boundary at a bearing from its centre. Both read
    // `ring` / `bounds`, which live on the feature rather than in its geometry because
    // the mark rides the *label* point while the shape is the polygon.
    //
    // Without them `fitSymbolScale` returns 1 and the break painters return nothing, so
    // those thumbnails came out as a bare outline or a glyph the size of the world.
    // The ring is the *drawn shape*, which is the base for an area the user traced and the
    // rendered graphic for one built from a centre and a radius — the circular variants
    // take a Point base, so reading only the base leaves them with no shape at all and a
    // glyph fitted to nothing.
    const projectedGraphic = project(render.graphic && render.graphic.geometry);
    const ringOf = geom => {
        if (!geom) return undefined;
        if (geom.type === 'Polygon') return geom.coordinates[0];
        if (geom.type === 'MultiLineString') return geom.coordinates[0];
        if (geom.type === 'LineString' && geom.coordinates.length > 3) return geom.coordinates;
        return undefined;
    };
    const ring = ringOf(projectedBase) || ringOf(projectedGraphic);
    const bounds = ring && ring.length
        ? {
            minX: Math.min(...ring.map(p => p[0])),
            minY: Math.min(...ring.map(p => p[1])),
            maxX: Math.max(...ring.map(p => p[0])),
            maxY: Math.max(...ring.map(p => p[1])),
        }
        : undefined;

    const run = (fn, geom) => {
        if (!fn || !geom) return null;
        try {
            const r = fn({geometry: geom, properties: paintProps, graphicSize: props.radius, ring, bounds}, ctx);
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

    // **An empty anchor set is an answer, not a miss.** The fallback below exists for
    // painters that synthesise their text from the base; a generator that returns zero
    // label anchors is saying this symbol carries no text, and both fords do. Falling
    // back for them drew an ALPHA and a DTG pair straight across the rails — text the
    // app never draws, invented by the harness.
    const labelGeom = project(render.labels && render.labels.geometry);
    const declaresNoLabels = !!labelGeom && labelGeom.coordinates.length === 0;
    let l = run(painters.label, labelGeom);
    if ((l === null || l.length === 0) && !declaresNoLabels) {
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
    /** Every emitted label's box, for the collision check in buildSvg. */
    const textBoxes = [];
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
                    const r = Math.hypot(widest, tall) / 2;
                    growPoint(tx, ty, r);
                    textBoxes.push({x0: tx - r, y0: ty - r, x1: tx + r, y1: ty + r});
                } else {
                    const left = anchor === 'start' ? tx : anchor === 'end' ? tx - widest : tx - widest / 2;
                    const top = baseline === 'hanging' ? ty : baseline === 'alphabetic' ? ty - tall : ty - tall / 2;
                    grow(left, top, left + widest, top + tall);
                    textBoxes.push({x0: left, y0: top, x1: left + widest, y1: top + tall});
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
    return {body, defs, bounds, textBoxes};
}

/**
 * How badly do two labels sit on top of each other?
 *
 * Returns the worst overlap as a share of the smaller label's area — 0 when nothing
 * touches. A share rather than a pixel count because the widths being compared are
 * estimates: this harness measures text arithmetically (@see measureText), so a box is
 * a few percent wrong either way and a pixel rule turns that error into a verdict.
 *
 * Measured in the pre-wrap px space, which is safe because the wrap is a uniform scale.
 */
const TEXT_OVERLAP_SHARE = 0.08;
function textOverlap(boxes) {
    let worst = 0;
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
            const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
            if (w <= 0 || h <= 0) continue;
            const smaller = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
            if (smaller <= 0) continue;
            const share = (w * h) / smaller;
            if (share > worst) worst = share;
        }
    }
    return worst > TEXT_OVERLAP_SHARE ? worst : 0;
}

// ── One graphic ─────────────────────────────────────────────────────────────
/**
 * **Zooming out is how two labels stop overlapping.**
 *
 * A label is a fixed number of screen pixels; the symbol is fitted to the tile. So the
 * ratio between the two — not the tile size, and not the zoom the symbol was drawn at —
 * decides whether "MSR ALPHA" at one end runs into "MSR ALPHA" at the other. Painting
 * into a canvas `k` times the tile and letting the page scale the result back down
 * leaves the geometry filling the frame and makes every label `k` times smaller
 * against it.
 *
 * Everything but the point-anchored symbols, which are already right and are left
 * alone. The ladder stops at the first size that clears, so a symbol pays only for the
 * room it actually needs and a thumbnail that never collides is never touched.
 *
 * **It also stops as soon as a step fails to help.** Some labels are sized from the
 * graphic rather than from the screen — an artillery area's designation grows with the
 * area — so for those the overlap is identical at every canvas. Zooming on regardless
 * shrinks a perfectly good symbol to a sixth of the tile chasing a gap that cannot
 * close, which is what it did to both artillery areas.
 */
const ZOOM_STEPS = [1, 1.3, 1.7, 2.2];

/**
 * A wider canvas has to cut the overlap to this share of the best seen so far before it
 * is worth the room it costs. Ties keep the smallest canvas, which is what leaves a
 * symbol whose labels scale WITH it — an artillery area's designation does — at its
 * natural size instead of shrinking it chasing a gap that cannot close.
 */
const ZOOM_PROGRESS = 0.95;

function buildSvg(name) {
    const zoomable = (baseGeometryFor ? baseGeometryFor(name) : 'LineString') !== 'Point';
    // The whole ladder is walked rather than stopped at the first setback: the overlap
    // is NOT monotonic in the canvas. A label anchored to the zoom grows as the canvas
    // widens and only stops once its scale clamps, so several symbols get worse at 1.3
    // and clear completely at 3.5. Stopping early left two dozen of them overlapping.
    let best = null;
    for (const drop of AMPLIFIER_FALLBACKS) {
        for (const k of zoomable ? ZOOM_STEPS : [1]) {
            const attempt = buildAt(name, k, drop);
            if (!attempt) continue;
            if (process.env.TG_DEBUG) console.error(`  ${name} k=${k} drop=[${drop}] overlap=${attempt.overlap.toFixed(3)}`);
            if (attempt.overlap === 0) return attempt;
            if (!best || attempt.overlap < best.overlap * ZOOM_PROGRESS) best = attempt;
        }
    }
    return best;
}

function buildAt(name, zoom, drop) {
    const TILE_W = Math.round(BASE_TILE_W * zoom);
    const TILE_H = Math.round(BASE_TILE_H * zoom);
    const PAD = BASE_PAD * zoom;
    // Pass 1 — learn the metre extent at a guessed resolution.
    let paints = paintsFor(name, 4, drop);
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
    paints = paintsFor(name, resolution, drop);
    ext = extentOf(paints) || ext;

    const w = (ext.maxX - ext.minX) / resolution;
    const h = (ext.maxY - ext.minY) / resolution;
    const offX = PAD + (usableW - w) / 2;
    const offY = PAD + (usableH - h) / 2;
    // Y flips: projected north is up, SVG y grows downward.
    const toPx = ([mx, my]) => [offX + (mx - ext.minX) / resolution, offY + (ext.maxY - my) / resolution];

    const {body, defs, bounds, textBoxes} = emitPaints(paints, toPx);
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
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE_W} ${TILE_H}" width="${TILE_W}" height="${TILE_H}" role="img" aria-label="${esc(title)}">` +
        `<title>${esc(title)}</title>` +
        (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
        wrapOpen +
        body.join('') +
        wrapClose +
        `</svg>\n`;
    return {svg, overlap: textOverlap(textBoxes)};
}

// ── Main ────────────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, {recursive: true});

const names = listTacticalGraphicNames().filter(n => !ONLY || n === ONLY);
const manifest = [];
const skipped = [];
/** Graphics whose labels still touch at the widest canvas the ladder offers. */
const collided = [];

for (const name of names) {
    if (!isPaintable(name)) {
        skipped.push([name, 'not paintable']);
        continue;
    }
    let svg = null;
    try {
        const built = buildSvg(name);
        svg = built && built.svg;
        if (built && built.overlap) collided.push(name);
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

/*
 * **`--only` regenerates a tile, not the catalog.**
 *
 * The manifest is built from whatever this run drew, so `--only Airfield` rewrote
 * `catalog.json` and `catalog.js` with a single entry — and the page reads `catalog.js`, so
 * the site would have listed one graphic out of 291. `--only` is the obvious way to check a
 * thumbnail after changing its paint, which is exactly when it did the most damage. Caught
 * because the site's `git status` was read afterwards, and not by anything here.
 */
if (ONLY) console.log('manifest    : left alone (--only regenerates tiles, not the catalog)');
else fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(manifest, null, 1), 'utf8');

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
if (!ONLY) fs.writeFileSync(
    path.join(OUT, 'catalog.js'),
    '/* GENERATED by scripts/gen-catalog-svgs.js — do not edit. */\n' + 'window.TG_CATALOG = ' + JSON.stringify(manifest) + ';\n',
    'utf8',
);

console.log(`out       : ${OUT}`);
console.log(`generated : ${manifest.length}`);
console.log(`skipped   : ${skipped.length}`);
for (const s of skipped.slice(0, 30)) console.log(`   - ${s[0]} => ${s[1]}`);
console.log(`labels still touching : ${collided.length}`);
for (const n of collided) console.log(`   - ${n}`);
