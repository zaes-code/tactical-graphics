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
 *   npm run gen:catalog                # the zaes.com catalog
 *   npm run gen:thumbnails             # the picker thumbnails that SHIP in the package
 *   node scripts/gen-catalog-svgs.js [--profile catalog|thumbnail]
 *                                     [--out DIR] [--only Name] [--size WxH] [--check]
 *
 * Two profiles, because two consumers ask different questions of the same symbol.
 * @see PROFILE — it is the first thing to read before changing anything below.
 *
 * `--check` regenerates in memory and reports whether the committed output is stale,
 * writing nothing. Run it after touching a paint or adding a graphic.
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

/**
 * **Two consumers, two jobs, one renderer.**
 *
 * `catalog` feeds the page on zaes.com, whose question is "does my symbol look right?".
 * It is read at a few hundred pixels beside a plate, so it fills every amplifier the
 * schema carries — that is the thing being checked. @see AMPLIFIERS
 *
 * `thumbnail` feeds a picker — today the tactical-graphic dropdown in Spearhead UI —
 * whose question is "which one is this?". It is read at a few dozen pixels next to a
 * label that already spells the name out, so text is a smudge that costs the shape its
 * room. The profile answers by drawing shape and dropping most of the words:
 *
 *   • areas  — a free-form bean rather than a rectangle, because a rectangle is a
 *     *different symbol* in this standard (@see isRectangular) and the picker was
 *     showing seventeen real rectangles and ninety-four fake ones. Amplifiers stay,
 *     inset off the boundary. @see LABEL_INSET_PX
 *   • points — the designation alone; the rest is annotation, not identity
 *   • lines  — no text at all. A line's identity is its dashes, ticks and arrowheads
 *
 * The split is by how the operator PLACES the graphic, not by what comes out — the
 * rectangular zones are drawn from an axis and a width, so they arrive here as
 * LineStrings while being every inch areas. @see kindOf
 */
const PROFILE = argOf('--profile', 'catalog');
if (PROFILE !== 'catalog' && PROFILE !== 'thumbnail') {
    console.error(`Unknown --profile "${PROFILE}" — expected "catalog" or "thumbnail".`);
    process.exit(1);
}
const IS_THUMB = PROFILE === 'thumbnail';

const DEFAULT_OUT = IS_THUMB ? path.join('src', 'tacticalgraphics', 'assets') : path.join('..', 'zaes.com', 'img', 'catalog');
const OUT = path.resolve(REPO, argOf('--out', DEFAULT_OUT));
const ONLY = argOf('--only', null);
/** Report whether regenerating would change anything, and write nothing. @see main */
const CHECK = argv.includes('--check');
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

/**
 * **The swept-arc tasks, drawn to the plate's proportions.**
 *
 * Capture, seize, evacuate and recover take four points — centre, radius, arc middle,
 * arrow tip — and the harness's default line base spaces them EVENLY along its run. That
 * makes the radius a third of the whole graphic, so all four came out as a fat circle
 * with a stub hanging off it. The construction was right and the picture was wrong.
 *
 * These ratios are read off the Template column of APP-06 Table 8-A-1, CAPTURE (343000):
 * against the horizontal reach from the circle's centre to the arrowhead, the radius is
 * about 0.17, the arc's middle sits ~0.66 along and below the chord, and the tip lands a
 * full reach right and ~0.71 down. A small circle and a long swept arrow, which is what
 * the standard draws and what the picker needs to be recognisable at 72px.
 *
 * Thumbnail-only, deliberately. The catalog tile has the same stubby arrow and would be
 * improved by the same base, but the catalog's output is pinned — @see PROFILE.
 */
const SWEPT_ARC_TASKS = ['Capture', 'Seize', 'Evacuate', 'Recover'];
function sweptArcBase() {
    const W = D * 2.6;
    const m = Math.cos((LAT * Math.PI) / 180); // @see beanRing — vertical offsets are metres
    const x0 = LON - W * 0.5;
    const y0 = LAT + W * 0.3 * m;
    const at = (rx, ry) => [x0 + W * rx, y0 - W * ry * m];
    return [
        at(0, 0), //          PT.1 — the circle's centre
        at(0.168, -0.055), // PT.2 — its radius, taken up and to the right as the plate has it
        at(0.655, 0.168), //  PT.3 — the middle of the arc
        at(1, 0.714), //      PT.4 — the arrowhead
    ];
}

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

/**
 * **Which of the three the operator thinks they are placing.**
 *
 * Derived from the library rather than listed here, because a list of 293 names goes
 * stale the first time one is added and nothing complains.
 *
 * The one thing a caller must not do is read `baseGeometryFor` and stop. It answers
 * "what does the user draw", which agrees with the operator's mental model twice out
 * of three:
 *
 *   • the seventeen rectangular zones are drawn as an AXIS with a width, so their base
 *     is a LineString while the symbol is an area — the thing a line's rules would
 *     strip the designation off, when a rectangular NFA exists to carry one
 *   • the nineteen circular zones are drawn from a CENTRE, so their base is a Point.
 *     Those stay points here on purpose: a picker entry for a circular NFA is a circle
 *     with its designation in it, which is exactly what the point rule gives
 *
 * @returns 'area' | 'point' | 'line'
 */
function kindOf(name) {
    if (isRectangular && isRectangular(name)) return 'area';
    const type = baseGeometryFor ? baseGeometryFor(name) : 'LineString';
    if (type === 'Polygon') return 'area';
    if (type === 'Point') return 'point';
    return 'line';
}

/**
 * **A traced area is a blob, and a rectangle means something else.**
 *
 * The catalog draws every polygon base as a rectangle, which is fine beside a plate —
 * the reader is checking the line work, not the outline. In a picker it is a lie twice
 * over: it makes ninety-four free-form areas look like the seventeen the standard
 * actually defines as rectangular, and it makes them all look like each other.
 *
 * So: a closed radial curve with two low-frequency harmonics. `cos(2θ)` sets the waist
 * that makes it a bean rather than an egg, `sin(3θ)` breaks the remaining symmetry so
 * it reads as traced rather than generated. Both are bounded by the amplifier stack
 * that has to fit *inside* the result — a deeper waist pinches the room it needs and
 * only pushes the ladder out. @see LABEL_INSET_PX
 *
 * **The aspect is written in metres, not degrees.** A first cut asked for 1.4 × 0.92 in
 * degrees and drew a circle: at 38.9°N a degree of latitude is `1/cos(lat)` — about 1.29
 * — more projected metres than a degree of longitude, which ate the whole difference.
 * Everything downstream works in metres, so the latitude term is scaled to match and
 * the ratio below is the one that reaches the tile.
 *
 * Enough vertices to look smooth at any tile size, few enough that the generators
 * which offset or buffer their ring are not handed a thousand-point path.
 */
const BEAN_VERTICES = 48;
const BEAN_ASPECT = 1.45; // width : height, as drawn
function beanRing() {
    const mercator = Math.cos((LAT * Math.PI) / 180);
    const ring = [];
    for (let i = 0; i < BEAN_VERTICES; i++) {
        const t = (i / BEAN_VERTICES) * Math.PI * 2;
        const r = 1 + 0.17 * Math.cos(2 * t) + 0.08 * Math.sin(3 * t);
        ring.push([LON + D * BEAN_ASPECT * r * Math.cos(t), LAT + D * r * Math.sin(t) * mercator]);
    }
    ring.push(ring[0].slice());
    return ring;
}

function makeBase(name) {
    const type = baseGeometryFor ? baseGeometryFor(name) : 'LineString';
    const shaped = IS_THUMB && SWEPT_ARC_TASKS.includes(name) ? sweptArcBase : SHAPED_BASES[name];
    if (shaped) return {type: 'LineString', coordinates: storedOrder ? storedOrder(name, shaped()) : shaped()};
    if (type === 'Point') return {type: 'Point', coordinates: [LON, LAT]};
    if (type === 'Polygon') {
        if (IS_THUMB) return {type: 'Polygon', coordinates: [beanRing()]};
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

/**
 * **Two more rungs, for the areas no zoom can rescue.**
 *
 * The ladder's whole mechanism is that a label is a fixed number of screen pixels while
 * the shape is fitted to the tile, so widening the canvas shrinks one against the other.
 * The artillery areas break that assumption: their designation is sized FROM the area,
 * so the ratio is identical at every rung and the text crosses the boundary at 1 and at
 * 4.5 alike. @see ZOOM_PROGRESS, which exists because of the same three symbols.
 *
 * What is left is to say less. Down to the designation, then — for a shape that cannot
 * hold even that — to nothing, which still leaves a correct picture of the symbol with
 * its name spelled out beside it in the picker.
 *
 * Catalog keeps the three rungs it had. There the text IS the subject, and an artillery
 * area whose designation touches its own edge is a true rendering of a real symbol.
 */
const THUMBNAIL_AMPLIFIER_FALLBACKS = AMPLIFIER_FALLBACKS.concat([
    TEXT_AMPLIFIERS.filter(f => f !== 'designation'),
    TEXT_AMPLIFIERS,
]);

/**
 * What the `thumbnail` profile keeps of each kind's text. @see PROFILE, kindOf
 *
 * Only `TEXT_AMPLIFIERS` is filtered. Everything else in the bag is shape rather than
 * words about it, and stays whatever the kind:
 *
 *   • `radius`, `width`, `rotation`, `rangeFan` are geometry inputs
 *   • `direction` and `mineType` select a GLYPH — the route's traffic arrows, the mine
 *     row's symbol. They are the picture, and on a route the arrows are most of what
 *     separates it from a phase line
 *
 * `echelon` is the one that looks like a glyph and is not: it is a text amplifier here,
 * so a line loses it. That is the right side to fall on — its ticks sit ON the line at
 * a fixed screen size and at picker scale they cover the dash pattern underneath.
 */
const THUMBNAIL_TEXT_BY_KIND = {
    area: TEXT_AMPLIFIERS,
    point: ['designation'],
    line: [],
};

/** The bag this graphic is drawn with. @see the presentation overrides above. */
function amplifiersFor(name, drop) {
    const amp = Object.assign({}, AMPLIFIERS);
    for (const field of drop || []) delete amp[field];
    if (isCorridor(name)) for (const field of TEXT_AMPLIFIERS) delete amp[field];
    if (IS_THUMB) {
        const keep = THUMBNAIL_TEXT_BY_KIND[kindOf(name)];
        for (const field of TEXT_AMPLIFIERS) if (!keep.includes(field)) delete amp[field];
    }

    if (isRectangular && isRectangular(name)) amp.width = RECTANGLE_WIDTH_M;
    if (name === TacticalGraphicName.FordEasy || name === TacticalGraphicName.FordDifficult) amp.width = FORD_WIDTH_M;
    return amp;
}

// ── Paint collection ────────────────────────────────────────────────────────
/**
 * @returns `{paints, ring}` — the marks, and the closed boundary they were fitted
 * around in projected metres, or `undefined` for a symbol that has no boundary. The
 * ring is already computed here for the painters that need it; the thumbnail profile's
 * inset check is the second caller. @see labelInsetViolation
 */
function paintsFor(name, resolution, drop) {
    const props = Object.assign({name}, amplifiersFor(name, drop));
    const baseGeom = makeBase(name);
    const render = renderTacticalGraphic({type: 'Feature', geometry: baseGeom, properties: {tacticalGraphic: props}});
    const painters = getPaintFunction(name);
    if (!painters) return {paints: [], ring: undefined};

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

    return {paints: out, ring};
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

/**
 * **How far a label intrudes on the boundary it sits inside.**
 *
 * An area stacks its amplifiers at the centroid, at a size fixed in screen pixels. The
 * shape is fitted to the tile. So whether "021200ZJUN26" clears the outline is decided
 * by the RATIO of the two, and at picker scale the text wins — a designation and a DTG
 * pair ran straight through the boundary on a third of the areas.
 *
 * The fix is the ladder that already exists for label-on-label overlap: painting into a
 * `k`-times canvas leaves the shape filling the frame and makes every label `k` times
 * smaller against it. This function is just the other question to ask of a rung.
 *
 * **Only labels that are actually INSIDE are judged, and "inside" is stricter than it
 * sounds.** Two kinds of text are near an area's boundary without intruding on it:
 *
 *   • the ones anchored OUTSIDE — a designation set above or beside the shape. Ruled
 *     out by the containment test
 *   • the ones anchored ON it, which is the trap. The artillery areas repeat `AMA` /
 *     `PAA` at four points ASTRIDE their own outline, and a position area's `PAA` is
 *     the symbol: that is what the plate draws, so a check that called it an intrusion
 *     would zoom three symbols out to nothing chasing doctrine
 *
 * So a box counts as interior only when its CENTRE clears the ring by more than its own
 * half-height. A centroid-anchored amplifier stack passes that by a mile; a mark sitting
 * on the line has a centre distance near zero and is left alone.
 *
 * @returns 0 when every inner label clears the boundary by `LABEL_INSET_PX`, otherwise
 * the worst shortfall in px — so a caller can prefer the rung that intrudes least.
 */
const LABEL_INSET_PX = 4;
function labelInsetViolation(ringPx, boxes) {
    if (!ringPx || ringPx.length < 4) return 0;
    let worst = 0;
    for (const b of boxes) {
        const cx = (b.x0 + b.x1) / 2;
        const cy = (b.y0 + b.y1) / 2;
        if (!pointInRing(ringPx, cx, cy)) continue;
        if (distanceToRing(ringPx, cx, cy) <= (b.y1 - b.y0) / 2) continue;
        // The corner nearest the boundary decides it, and a corner that has crossed
        // counts as a full inset's worth of shortfall plus how far out it went.
        for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]) {
            const d = distanceToRing(ringPx, x, y);
            const shortfall = pointInRing(ringPx, x, y) ? LABEL_INSET_PX - d : LABEL_INSET_PX + d;
            if (shortfall > worst) worst = shortfall;
        }
    }
    return worst > 0 ? worst : 0;
}

/** Ray casting. The ring may be open or closed; both are handled by the wrap. */
function pointInRing(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** Shortest distance from a point to the ring's edges, sign-free. */
function distanceToRing(ring, x, y) {
    let best = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const dx = xj - xi;
        const dy = yj - yi;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len2));
        const d = Math.hypot(x - (xi + t * dx), y - (yi + t * dy));
        if (d < best) best = d;
    }
    return best;
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
 * The thumbnail profile climbs further, because it asks the ladder a second question.
 * An amplifier stack has to clear the boundary AROUND it rather than just the other
 * label across the tile, and a centred stack in a bean needs more room than two ends of
 * a line need to separate. Sixteen areas were still touching at 2.2 and clear by 4.5.
 *
 * The extra rungs cost nothing on a symbol that never needed them: the ladder returns
 * the first rung that clears, and most areas clear at 1. @see buildSvg
 */
const THUMBNAIL_ZOOM_STEPS = [1, 1.3, 1.7, 2.2, 2.9, 3.6, 4.5];

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
    const steps = IS_THUMB ? THUMBNAIL_ZOOM_STEPS : ZOOM_STEPS;
    for (const drop of IS_THUMB ? THUMBNAIL_AMPLIFIER_FALLBACKS : AMPLIFIER_FALLBACKS) {
        for (const k of zoomable ? steps : [1]) {
            const attempt = buildAt(name, k, drop);
            if (!attempt) continue;
            if (process.env.TG_DEBUG) console.error(`  ${name} k=${k} drop=[${drop}] overlap=${attempt.overlap.toFixed(3)} inset=${attempt.inset.toFixed(2)}`);
            // Two failures with one budget. They are not comparable in their own units —
            // an overlap is a share, an intrusion is pixels — so the rung is scored on
            // the share, and an intrusion is folded in as one: any amount of it is a
            // failure, and a rung that clears both is taken immediately.
            const cost = attempt.overlap + (attempt.inset > 0 ? 1 : 0);
            if (cost === 0) return attempt;
            if (!best || cost < best.cost * ZOOM_PROGRESS) best = Object.assign({cost}, attempt);
        }
    }
    return best;
}

function buildAt(name, zoom, drop) {
    const TILE_W = Math.round(BASE_TILE_W * zoom);
    const TILE_H = Math.round(BASE_TILE_H * zoom);
    const PAD = BASE_PAD * zoom;
    // Pass 1 — learn the metre extent at a guessed resolution.
    let paints = paintsFor(name, 4, drop).paints;
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
    const second = paintsFor(name, resolution, drop);
    paints = second.paints;
    ext = extentOf(paints) || ext;

    const w = (ext.maxX - ext.minX) / resolution;
    const h = (ext.maxY - ext.minY) / resolution;
    const offX = PAD + (usableW - w) / 2;
    const offY = PAD + (usableH - h) / 2;
    // Y flips: projected north is up, SVG y grows downward.
    const toPx = ([mx, my]) => [offX + (mx - ext.minX) / resolution, offY + (ext.maxY - my) / resolution];

    const {body, defs, bounds, textBoxes} = emitPaints(paints, toPx);
    if (!body.length) return null;

    // Measured in the pre-wrap px space, alongside the overlap check and for the same
    // reason: the wrap below is a uniform scale, so it moves the label and the boundary
    // together and cannot turn a clearance into an intrusion.
    const inset = IS_THUMB && kindOf(name) === 'area' ? labelInsetViolation(second.ring && second.ring.map(toPx), textBoxes) : 0;

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
    return {svg, overlap: textOverlap(textBoxes), inset};
}

// ── Main ────────────────────────────────────────────────────────────────────
if (!CHECK) fs.mkdirSync(OUT, {recursive: true});

const names = listTacticalGraphicNames().filter(n => !ONLY || n === ONLY);
const manifest = [];
const skipped = [];
/** Graphics whose labels still touch at the widest canvas the ladder offers. */
const collided = [];
/** Thumbnail profile: areas whose amplifiers still cross the boundary at 4.5. */
const intruded = [];
/** name → svg, in generation order. The thumbnail profile's whole output. @see writeModule */
const svgs = new Map();

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
        if (built && built.inset) intruded.push(name);
    } catch (e) {
        skipped.push([name, e.message.slice(0, 80)]);
        continue;
    }
    if (!svg) {
        skipped.push([name, 'no marks']);
        continue;
    }
    const file = `${name}.svg`;
    svgs.set(name, svg);
    if (!IS_THUMB && !CHECK) fs.writeFileSync(path.join(OUT, file), svg, 'utf8');
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
else if (!IS_THUMB && !CHECK) fs.writeFileSync(path.join(OUT, 'catalog.json'), JSON.stringify(manifest, null, 1), 'utf8');

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
if (!ONLY && !IS_THUMB && !CHECK) fs.writeFileSync(
    path.join(OUT, 'catalog.js'),
    '/* GENERATED by scripts/gen-catalog-svgs.js — do not edit. */\n' + 'window.TG_CATALOG = ' + JSON.stringify(manifest) + ';\n',
    'utf8',
);

// ── The thumbnail profile's output ──────────────────────────────────────────
/**
 * **One TypeScript module, not 293 files.**
 *
 * The thumbnails ship inside the npm package, so they have to survive being imported
 * by a consumer's bundler. A directory of `.svg` files does not: `import x from
 * '@zaes/tactical-graphics/thumbnails/Foo.svg'` needs a loader `tsc` cannot provide,
 * and picking one by name at run time needs a `require.context` that is webpack's alone.
 * This is the same rule the route-direction arrows already live under — @see
 * `assets/routeDirectionIcons.ts`, and the "No bundler-only imports" note in CLAUDE.md.
 *
 * The module is deliberately NOT re-exported from `index.ts`. It is reachable only
 * through the `./thumbnails` subpath, so the half-megabyte of markup lands solely on a
 * consumer that asked for pictures — someone importing the geometry never pays for it.
 */
const THUMB_MODULE = 'graphicThumbnails.ts';

/**
 * A single-quoted TS string literal, because SVG attributes are double-quoted.
 * `JSON.stringify` would escape every one of them — about 15% of the file spent on
 * backslashes, and a diff nobody can read.
 */
const tsString = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

function thumbnailModule() {
    const entries = [...svgs.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, svg]) => `    ${name}: ${tsString(svg.trim())},`)
        .join('\n');
    return (
        `/**\n` +
        ` * GENERATED by \`npm run gen:thumbnails\` — do not edit by hand.\n` +
        ` *\n` +
        ` * One small SVG per graphic, for a picker that has to show what the user is about\n` +
        ` * to add. Drawn by the library's own paint layer, so a symbol and its thumbnail\n` +
        ` * cannot disagree. @see scripts/gen-catalog-svgs.js, and its PROFILE note for why\n` +
        ` * these carry so much less text than the catalog tiles on zaes.com.\n` +
        ` *\n` +
        ` * Reachable as \`@zaes/tactical-graphics/thumbnails\`; not part of the root barrel.\n` +
        ` */\n` +
        `import type {TacticalGraphicName} from '../core/type';\n\n` +
        `/** The viewBox every thumbnail is composed against, before its own zoom multiple. */\n` +
        `export const GRAPHIC_THUMBNAIL_ASPECT = ${n2(BASE_TILE_W / BASE_TILE_H)};\n\n` +
        `/** Raw SVG markup, keyed by graphic name. @see getGraphicThumbnailUrl for an \`<img src>\`. */\n` +
        `export const GRAPHIC_THUMBNAIL_SVGS: Partial<Record<TacticalGraphicName, string>> = {\n${entries}\n};\n\n` +
        `/** The markup for one graphic, or \`undefined\` for a name nothing paints. */\n` +
        `export function getGraphicThumbnailSvg(name: TacticalGraphicName | string): string | undefined {\n` +
        `    return GRAPHIC_THUMBNAIL_SVGS[name as TacticalGraphicName];\n` +
        `}\n\n` +
        `const urlCache = new Map<string, string>();\n\n` +
        `/**\n` +
        ` * The same thumbnail as a \`data:\` URI, ready for \`<img src>\`.\n` +
        ` *\n` +
        ` * Percent-encoded rather than base64 — it is a third smaller and stays readable in\n` +
        ` * devtools. Built on first ask and cached, so a picker that renders the same option\n` +
        ` * on every keystroke encodes each one once.\n` +
        ` */\n` +
        `export function getGraphicThumbnailUrl(name: TacticalGraphicName | string): string | undefined {\n` +
        `    const cached = urlCache.get(name as string);\n` +
        `    if (cached) return cached;\n` +
        `    const svg = getGraphicThumbnailSvg(name);\n` +
        `    if (!svg) return undefined;\n` +
        `    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);\n` +
        `    urlCache.set(name as string, url);\n` +
        `    return url;\n` +
        `}\n`
    );
}

let stale = false;
if (IS_THUMB) {
    // `--only` rebuilds one tile to look at, and the module is written from whatever this
    // run drew — so writing it would drop the other 292. The same trap the manifest note
    // above describes, one directory over.
    if (ONLY) {
        console.log(svgs.get(ONLY) || '(nothing drawn)');
        console.log('module    : left alone (--only draws one tile, it does not regenerate the module)');
    } else {
        const target = path.join(OUT, THUMB_MODULE);
        const next = thumbnailModule();
        const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        stale = current !== next;
        if (CHECK) console.log(`module    : ${stale ? 'STALE — run `npm run gen:thumbnails`' : 'up to date'}`);
        else if (stale) {
            fs.writeFileSync(target, next, 'utf8');
            console.log(`module    : written (${(Buffer.byteLength(next) / 1024).toFixed(0)} KB)`);
        } else console.log('module    : unchanged');
    }
}

console.log(`profile   : ${PROFILE}`);
console.log(`out       : ${OUT}`);
console.log(`generated : ${manifest.length}`);
console.log(`skipped   : ${skipped.length}`);
for (const s of skipped.slice(0, 30)) console.log(`   - ${s[0]} => ${s[1]}`);
console.log(`labels still touching : ${collided.length}`);
for (const n of collided) console.log(`   - ${n}`);
if (IS_THUMB) {
    console.log(`labels still crossing a boundary : ${intruded.length}`);
    for (const n of intruded) console.log(`   - ${n}`);
}

if (CHECK && stale) process.exit(1);
