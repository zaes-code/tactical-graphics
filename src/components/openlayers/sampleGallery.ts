/**
 * Draws one sample of every proven graphic, tiled across the map, by driving the
 * exact same generator path a hand-draw uses — so a sample renders identically
 * to a real graphic. This makes it a one-click visual regression sweep and a
 * live showcase.
 *
 * Each graphic's controller decides the base geometry it consumes:
 *   - LineGraphicController      → a LineString (2 pts, or `maxPoints`; multi → 3 = 2 segments)
 *   - PolygonGraphicController   → a Polygon (5-sided ring)
 *   - RectangularAreaGraphicController → a Polygon box (4 corners)
 *   - MissionTaskController      → a centre point + radius, via updateGeom()
 *   - SecurityOperationsController → a centre point, via setBaseFeature()
 *
 * A generator that throws (a genuinely broken graphic) is caught and reported,
 * not fatal — the rest of the sweep still renders.
 *
 * ── Layout ──────────────────────────────────────────────────────────────────
 *
 * Samples are grouped under a heading per `TacticalGraphicCategory`, and every
 * sample gets a cell sized to what it actually renders rather than a uniform
 * grid square. That matters because the kinds are no longer the same size:
 * line graphics are drawn LINE_SCALE× longer than area graphics so an arrow's
 * shaft, head and amplifiers are all legible, while polygons, rectangles and
 * circles keep the size they always had.
 *
 * Cells come from a measuring pass (`measureSamples`) that generates each
 * graphic off-map and reads the union extent of its features. Packing those
 * measured boxes is what guarantees no two samples overlap — a fixed grid
 * cannot, because a graphic's rendered extent runs well past the geometry the
 * sweep hands it (arrowheads, corridor rails, offset amplifiers).
 */
import {Feature} from 'ol';
import {LineString, Point, Polygon} from 'ol/geom';
import {Coordinate} from 'ol/coordinate';
import {Extent, createEmpty, extend, isEmpty} from 'ol/extent';
import {Fill, Stroke, Style, Text} from 'ol/style';
import {
    GRAPHIC_CATEGORIES,
    TacticalGraphicCategory,
    TacticalGraphicHostility,
    TacticalGraphicName,
    getDisplayName,
} from '@zaes/tactical-graphics';

import {getController} from './controllerRegistry';
import {TacticalGraphicHandler} from './openlayersAdapter';
import {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {MissionTaskController} from './controllers/MissionTaskController';
import {SecurityOperationsController} from './controllers/SecurityOperationsController';
import {PolygonGraphicController, RectangularAreaGraphicController} from './controllers/PolygonGraphicController';
import {LineGraphicController} from './controllers/LineGraphicController';
import {PROVEN_GRAPHICS} from './provenGraphics';
import {supportsHostility} from './graphicFieldRegistry';
import {writeGraphicProperties} from './graphicProperties';
import {getColorByHostility} from './openlayerStyles';
import {GraphicLabels} from '../../utils/graphicLinkRegistry';
import ms from 'milsymbol';
import {SecurityOperationSymbolProvider} from './securityOperationSymbol';

/**
 * A different unit symbol in the centre of each security operation.
 *
 * Cover, Guard and Screen otherwise draw the same generic land unit, which makes
 * three graphics that already look alike harder still to tell apart in a
 * catalogue. It also demonstrates the per-graphic provider — the global one is set
 * once for the whole app and cannot, by itself, give two Screens different
 * symbols.
 *
 * **Illustrative, not doctrinal.** These are the MIL-STD-2525E land-unit function
 * IDs for reconnaissance, armoured cavalry and armour, in ascending combat power
 * to match the three tasks; FM 1-02.2 does not prescribe which unit performs
 * which, and a real deployment supplies its own. They were picked by rendering the
 * symbol-set-10 entity range and reading the icons, since milsymbol carries no
 * entity names to look them up by.
 */
const SAMPLE_UNIT_FUNCTION_ID: Partial<Record<TacticalGraphicName, string>> = {
    [TacticalGraphicName.Screen]: '121300', // single diagonal — reconnaissance
    [TacticalGraphicName.Guard]: '121000', // oval with a diagonal — armoured cavalry
    [TacticalGraphicName.Cover]: '120500', // oval — armour
};

/**
 * Bigger than the library's 25px default, because a sample sits in a dense grid
 * where the default reads as a speck.
 *
 * Returned per symbol as `{src, sizePx}` rather than set through
 * `setSecurityOperationSymbolSize`, which is global — the gallery has no business
 * resizing the centre symbol for the rest of the host's application.
 */
const SAMPLE_UNIT_SIZE_PX = 50;

/**
 * Swaps the entity digits of the doctrinal SIDC, positions 11-16.
 *
 * Everything before them — version, context, the *standard identity* the library
 * derived from this graphic's hostility, symbol set — is kept, so a hostile sample
 * still frames as hostile.
 */
function sampleUnitProvider(name: TacticalGraphicName): SecurityOperationSymbolProvider | undefined {
    const functionId = SAMPLE_UNIT_FUNCTION_ID[name];
    if (!functionId) return undefined;
    return ({sidc}) => {
        const unit = sidc.slice(0, 10) + functionId + sidc.slice(16);
        // `size` here is the SVG's internal resolution — 2x for a crisp HiDPI
        // render. `sizePx` is what it actually draws at.
        const svg = new ms.Symbol(unit, {size: SAMPLE_UNIT_SIZE_PX * 2}).asSVG();
        return {
            src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
            sizePx: SAMPLE_UNIT_SIZE_PX,
        };
    };
}

/** EPSG:3857 metres an area graphic (polygon, rectangle, circle) spans from its centre. */
export const HALF = 30_600;
/**
 * How much longer a line graphic is drawn than an area graphic. Arrows, axes and
 * corridors carry their meaning along their length — at parity with the areas
 * they collapse into an unreadable smudge.
 */
export const LINE_SCALE = 3;
export const LINE_HALF = HALF * LINE_SCALE;

/**
 * Spacing, in screen pixels at the resolution the samples are generated at.
 * GAP is the clearance around every sample — the guarantee against touching
 * neighbours; TITLE and HEADING are the bands reserved for a caption and for a
 * category banner.
 */
const GAP_PX = 10;
const TITLE_PX = 18;
// Tall enough for the banner itself plus the two-line caption of the row that
// opens the block — they share this band, banner at the top, caption at the
// bottom, and any less makes them collide.
const HEADING_PX = 36;
const CATEGORY_GAP_PX = 12;

/**
 * The same four, for the nominal pass that picks the generating resolution —
 * expressed as fractions of an area sample so they carry no pixel term. See
 * generatingResolution for why that matters.
 */
const GAP_M = HALF * 0.35;
const TITLE_M = HALF * 0.6;
const HEADING_M = HALF * 0.9;
const CATEGORY_GAP_M = HALF * 0.3;

/** Fraction of the viewport the whole layout should fill. */
const FILL = 0.92;

/**
 * The controls panel floats over the map's left edge (MapControls: left 12,
 * width 300), so the sweep is framed clear of it — otherwise the leftmost
 * column of samples renders underneath the panel and cannot be seen.
 */
const CONTROL_PANEL_PX = 326;
/** Breathing room on the other three sides when framing. */
const VIEW_PADDING_PX = 14;

/** A measured box wider than this is a wrapped or degenerate geometry, not a big graphic. */
const SANE_METRES = 4_000_000;

export interface SampleSweepResult {
    drawn: number;
    failed: {name: TacticalGraphicName; error: string}[];
}

/** A sample's rendered extent, relative to the centre it was generated at. */
interface Box {
    dx0: number;
    dy0: number;
    dx1: number;
    dy1: number;
}

const boxWidth = (b: Box) => b.dx1 - b.dx0;
const boxHeight = (b: Box) => b.dy1 - b.dy0;

/** Where one sample ends up: the centre to generate it at, and its caption anchor. */
interface Placement {
    name: TacticalGraphicName;
    cx: number;
    cy: number;
    titleY: number;
}

interface Heading {
    category: TacticalGraphicCategory;
    x: number;
    y: number;
}

interface Layout {
    placements: Placement[];
    headings: Heading[];
    /** Resolution the samples were measured at — generate at this, or the boxes lie. */
    resolution: number;
    /** Full span of the packed layout, centred on (0, 0). */
    width: number;
    height: number;
}

/**
 * Stamps a hostility on a freshly drawn sample, by the same route the properties
 * dialog uses: through the holder's `setLabel` when it has one — geometry can
 * depend on hostility, as Encirclement's does — and straight onto the features
 * otherwise. `hostilityColor` is what the style functions read.
 *
 * Graphics that do not take the field are left completely untouched: FM 1-02.2
 * gives no amplifier fields to the Chapter 6 tactical mission tasks, so a swept
 * mission task must render exactly as it does with no hostility selected.
 * Exported for the test that pins that down.
 */
export function applyHostility(
    handler: TacticalGraphicHandler,
    name: TacticalGraphicName,
    hostility: TacticalGraphicHostility,
): void {
    if (!supportsHostility(name)) return;

    const labels: GraphicLabels = {label: '', hostility};
    const holder = handler.graphic as {setLabel?: (l: GraphicLabels) => void};
    if (holder.setLabel) holder.setLabel(labels);
    else writeGraphicProperties(handler.getFeatures(), name, labels);

    const color = getColorByHostility(hostility);
    handler.getFeatures().forEach(f => {
        f.set('hostility', hostility);
        f.set('hostilityColor', color);
    });
}

/** Removes every rendered graphic and its controllers. */
export function clearAllGraphics(manager: TacticalGraphicsManager): void {
    manager.renderingVectorSource.clear();
    manager.graphicControllers.length = 0;
    // The controllers are gone, so their zoom subscriptions have to go too. Without
    // this every sweep left its predecessor's listeners re-deriving graphics that
    // were no longer on the map.
    manager.releaseAllGraphics();
}

/**
 * Clears the map, draws a sample of every proven graphic grouped by category,
 * and frames the view around it. Returns which graphics rendered and which threw.
 *
 * `hostility`, when given, is applied to every sample that doctrinally accepts
 * one — which makes the sweep a one-click check of hostility rendering across
 * the whole catalogue. Graphics without the field (the Chapter 6 tactical
 * mission tasks) are skipped rather than coloured, so the sweep shows what a
 * user could actually produce.
 */
export function drawProvenSamples(
    manager: TacticalGraphicsManager,
    hostility?: TacticalGraphicHostility,
): SampleSweepResult {
    clearAllGraphics(manager);

    const source = manager.renderingVectorSource;
    const view = manager.map.getView();
    const [w, h] = manager.map.getSize() ?? [1600, 900];

    const layout = solveLayout(groupByCategory(PROVEN_GRAPHICS), w, h);

    // Frame before drawing, so every handler is constructed at — and stamps —
    // the generating resolution the layout was measured at. Then widen to
    // whatever shows the whole thing. Handlers read the view's resolution when
    // they are built, so the order matters: measure-resolution first, fit second.
    view.setCenter([0, 0]);
    view.setResolution(layout.resolution);

    const failed: SampleSweepResult['failed'] = [];
    let drawn = 0;

    layout.headings.forEach(({category, x, y}) => source.addFeature(headingFeature([x, y], category)));

    layout.placements.forEach(({name, cx, cy, titleY}) => {
        const handler = getController(name, layout.resolution);
        const symbolId = crypto.randomUUID();
        handler.setSymbolId(symbolId);
        if (handler instanceof SecurityOperationsController) {
            handler.setSymbolProvider(sampleUnitProvider(name));
        }
        handler.getFeatures().forEach(f => {
            f.set('graphicName', name);
            f.set('symbolId', symbolId);
        });
        source.addFeatures(handler.getFeatures());

        try {
            applyBaseGeometry(handler, name, cx, cy, symbolId);
            if (hostility) applyHostility(handler, name, hostility);
            manager.graphicControllers.push(handler);
            // The sweep used to skip this, so every sample it drew was pinned in map
            // units and grew and shrank with the zoom — most visibly the security
            // operations, whose whole geometry is a screen-pixel constant times the
            // resolution. Drawing by hand always subscribed; the sweep did not, which
            // is why the same graphic behaved differently depending on how it got
            // onto the map.
            manager.watchResolution(handler);
            source.addFeature(titleFeature([cx, titleY], getDisplayName(name)));
            drawn++;
        } catch (e) {
            // Roll back this graphic's partial features so a thrower leaves no debris.
            handler.getFeatures().forEach(f => {
                if (source.hasFeature(f)) source.removeFeature(f);
            });
            failed.push({name, error: e instanceof Error ? e.message : String(e)});
        }
    });

    // Everything is generated; now show all of it. Padding keeps the layout clear
    // of the controls panel, which floats over the map's left edge and would
    // otherwise swallow a whole column of samples.
    if (layout.width && layout.height) {
        view.fit([-layout.width / 2, -layout.height / 2, layout.width / 2, layout.height / 2], {
            size: manager.map.getSize(),
            padding: [VIEW_PADDING_PX, VIEW_PADDING_PX, VIEW_PADDING_PX, CONTROL_PANEL_PX],
        });
    }

    if (failed.length) {
        // eslint-disable-next-line no-console
        console.warn(`[sample sweep] ${drawn} drawn, ${failed.length} failed:`,
            failed.map(f => `${f.name}: ${f.error}`));
    }
    return {drawn, failed};
}

// ── layout ──────────────────────────────────────────────────────────────────

/** Proven graphics bucketed by category, in category-enum order, each bucket in sweep order. */
export function groupByCategory(names: TacticalGraphicName[]): [TacticalGraphicCategory, TacticalGraphicName[]][] {
    const buckets = new Map<TacticalGraphicCategory, TacticalGraphicName[]>();
    names.forEach(name => {
        const category = GRAPHIC_CATEGORIES[name];
        const bucket = buckets.get(category);
        if (bucket) bucket.push(name);
        else buckets.set(category, [name]);
    });
    return (Object.values(TacticalGraphicCategory) as TacticalGraphicCategory[])
        .filter(c => buckets.has(c))
        .map(c => [c, buckets.get(c)!]);
}

/**
 * Lays the sweep out in two passes, which is what keeps it stable.
 *
 * A sample's extent depends on the resolution it is generated at — decorations
 * are sized in `n * resolution` (`new MovementGraphicBase(name, 20 * res, res)`)
 * — so choosing the resolution *from* the measured extents is a feedback loop.
 * With ~12 rows and 13 headings each costing fixed pixels, that loop's gain
 * exceeds 1 and it runs away: measured boxes grow, the grid grows, the
 * resolution grows, and by the fourth pass samples sit past ±85° latitude where
 * the generators emit wrapped, world-spanning geometry.
 *
 * So the generating resolution comes from a nominal pass that uses only base
 * geometry and metric spacing — no pixel term, hence no feedback. Samples are
 * then measured and packed at exactly that resolution, which is what makes the
 * packing describe what renders. Framing the view is a separate, one-shot
 * decision: `fitResolution` shows the whole layout, and zooming out from the
 * generating resolution shrinks geometry, decorations and zoom-anchored labels
 * together, so nothing is distorted by the difference.
 */
function solveLayout(groups: [TacticalGraphicCategory, TacticalGraphicName[]][], mapW: number, mapH: number): Layout {
    // Only the area the panel does not cover is worth laying out into.
    const w = Math.max(mapW - CONTROL_PANEL_PX - VIEW_PADDING_PX, 200);
    const h = Math.max(mapH - 2 * VIEW_PADDING_PX, 200);
    const resolution = generatingResolution(groups, w, h);

    const boxes = new Map<TacticalGraphicName, Box>();
    groups.forEach(([, names]) => names.forEach(name => {
        const box = measureSample(name, resolution);
        if (box) boxes.set(name, sane(box, name));
    }));

    const packed = packBest(groups, boxes, w / h, {
        gap: GAP_PX * resolution,
        title: TITLE_PX * resolution,
        heading: HEADING_PX * resolution,
        categoryGap: CATEGORY_GAP_PX * resolution,
    });
    if (!packed) return {placements: [], headings: [], resolution, width: 0, height: 0};

    return {...packed.layout, resolution, width: packed.width, height: packed.height};
}

/**
 * The resolution samples are generated at: whatever makes a layout of their base
 * geometry fill the viewport. Uses nominal boxes and metric spacing only, so the
 * answer cannot depend on itself.
 */
function generatingResolution(groups: [TacticalGraphicCategory, TacticalGraphicName[]][], w: number, h: number): number {
    const boxes = new Map<TacticalGraphicName, Box>();
    groups.forEach(([, names]) => names.forEach(name => boxes.set(name, nominalBox(name))));

    const packed = packBest(groups, boxes, w / h, {
        gap: GAP_M,
        title: TITLE_M,
        heading: HEADING_M,
        categoryGap: CATEGORY_GAP_M,
    });
    if (!packed) return HALF / 20;
    return Math.max(packed.width / w, packed.height / h) / FILL;
}

/**
 * The span a graphic's base geometry occupies, before any decoration — enough to
 * size the nominal pass. Line graphics run LINE_SCALE× longer; everything else
 * is drawn inside the area square.
 */
function nominalBox(name: TacticalGraphicName): Box {
    const isLine = getController(name, HALF / 20) instanceof LineGraphicController;
    const halfW = isLine ? LINE_HALF : HALF;
    const halfH = isLine ? LINE_HALF * 0.3 : HALF;
    return {dx0: -halfW, dx1: halfW, dy0: -halfH, dy1: halfH};
}

/**
 * Guards the packer against a graphic whose generator emitted wrapped or
 * degenerate coordinates: one box spanning a quarter of the globe would push
 * every other sample out of the viewport. Falls back to the nominal size and
 * says so, rather than laying out around the garbage.
 */
function sane(box: Box, name: TacticalGraphicName): Box {
    if (boxWidth(box) <= SANE_METRES && boxHeight(box) <= SANE_METRES) return box;
    // eslint-disable-next-line no-console
    console.warn(`[sample sweep] ${name} measured ${Math.round(boxWidth(box) / 1000)}×${Math.round(boxHeight(box) / 1000)}km — using its nominal size`);
    return nominalBox(name);
}

/**
 * Picks the layout that best matches the viewport's shape, over two knobs: the
 * width of a category block, and how many blocks stand side by side.
 *
 * One block per full-width row cannot get wider than the biggest category and
 * cannot get shorter than one row per category — with 13 categories that pins
 * the aspect near 1.1 whatever else changes, and a 1.6-shaped viewport then
 * fits by height and wastes a third of its width. Standing the blocks in
 * columns, newspaper-style, is what lets the aspect reach the window.
 */
function packBest(
    groups: [TacticalGraphicCategory, TacticalGraphicName[]][],
    boxes: Map<TacticalGraphicName, Box>,
    targetAspect: number,
    spacing: Spacing,
): {layout: {placements: Placement[]; headings: Heading[]}; width: number; height: number} | null {
    const widths = Array.from(boxes.values(), b => boxWidth(b) + spacing.gap);
    if (!widths.length) return null;
    const widest = Math.max(...widths);
    const totalWidth = widths.reduce((a, b) => a + b, 0);

    let best = null;
    let bestError = Infinity;
    for (let step = 1; step <= 24; step++) {
        const column = widest + ((totalWidth - widest) * step) / 24 / 3;
        const blocks = groups
            .map(([category, names]) => layoutBlock(category, names.filter(n => boxes.has(n)), boxes, column, spacing))
            .filter((b): b is Block => b !== null);
        if (!blocks.length) continue;

        for (let columns = 1; columns <= 5; columns++) {
            const packed = assembleColumns(blocks, columns, spacing);
            if (!packed.width || !packed.height) continue;
            const error = Math.abs(Math.log((packed.width / packed.height) / targetAspect));
            if (error < bestError) {
                bestError = error;
                best = packed;
            }
        }
    }
    return best;
}

interface Spacing {
    gap: number;
    title: number;
    heading: number;
    categoryGap: number;
}

/** One category's samples, packed into rows, in the block's own top-left coordinates. */
interface Block {
    category: TacticalGraphicCategory;
    cells: {name: TacticalGraphicName; left: number; top: number; box: Box}[];
    width: number;
    height: number;
}

/** Shelf-packs one category's boxes into rows no wider than `column`, under its heading. */
function layoutBlock(
    category: TacticalGraphicCategory,
    names: TacticalGraphicName[],
    boxes: Map<TacticalGraphicName, Box>,
    column: number,
    {gap, title, heading}: Spacing,
): Block | null {
    if (!names.length) return null;

    const cells: Block['cells'] = [];
    let x = 0;
    let y = heading;
    let rowHeight = 0;
    let width = 0;

    names.forEach(name => {
        const box = boxes.get(name)!;
        const cellW = boxWidth(box) + gap;
        const cellH = boxHeight(box) + gap + title;
        if (x > 0 && x + cellW > column) {
            y += rowHeight;
            x = 0;
            rowHeight = 0;
        }
        cells.push({name, left: x, top: y, box});
        x += cellW;
        rowHeight = Math.max(rowHeight, cellH);
        width = Math.max(width, x);
    });

    return {category, cells, width, height: y + rowHeight};
}

/**
 * Stands the category blocks in `columns` columns, each block going to whichever
 * column is currently shortest — which keeps the columns level without
 * reordering the categories. Coordinates come out centred on (0, 0) with y up,
 * ready to hand straight to the generators.
 */
function assembleColumns(
    blocks: Block[],
    columns: number,
    {gap, title, heading, categoryGap}: Spacing,
): {layout: {placements: Placement[]; headings: Heading[]}; width: number; height: number} {
    const columnWidth = Math.max(...blocks.map(b => b.width));
    const heights = new Array(columns).fill(0);
    const placed: {block: Block; left: number; top: number}[] = [];

    blocks.forEach(block => {
        let shortest = 0;
        for (let c = 1; c < columns; c++) if (heights[c] < heights[shortest]) shortest = c;
        placed.push({block, left: shortest * (columnWidth + categoryGap), top: heights[shortest]});
        heights[shortest] += block.height + categoryGap;
    });

    const width = columns * columnWidth + (columns - 1) * categoryGap;
    const height = Math.max(...heights) - categoryGap;
    const originX = -width / 2;
    const originY = height / 2;

    return {
        width,
        height,
        layout: {
            // A cell is [gap/2 | title | box | gap/2]; the box is centred across the
            // cell's width and hangs from its top, so captions never collide with the
            // sample above them.
            placements: placed.flatMap(({block, left, top}) => block.cells.map(({name, left: cl, top: ct, box}) => {
                const cellW = boxWidth(box) + gap;
                const boxLeft = originX + left + cl + (cellW - boxWidth(box)) / 2;
                const boxTop = originY - top - ct - title;
                return {
                    name,
                    cx: boxLeft - box.dx0,
                    cy: boxTop - box.dy1,
                    titleY: boxTop + title * 0.12,
                };
            })),
            headings: placed.map(({block, left, top}) => ({
                category: block.category,
                x: originX + left,
                y: originY - top - heading * 0.06,
            })),
        },
    };
}

/**
 * Generates a sample off-map purely to read its extent. Nothing here is added to
 * a source or to the manager, so the handler is garbage once measured.
 *
 * Returns null for a graphic whose generator throws — the draw pass will hit the
 * same failure and is what reports it.
 */
export function measureSample(name: TacticalGraphicName, resolution: number): Box | null {
    const handler = getController(name, resolution);
    const symbolId = 'measure';
    handler.setSymbolId(symbolId);
    try {
        applyBaseGeometry(handler, name, 0, 0, symbolId);
    } catch {
        return null;
    }

    const extent: Extent = createEmpty();
    handler.getFeatures().forEach(f => {
        const geometry = f.getGeometry();
        if (geometry) extend(extent, geometry.getExtent());
    });
    if (isEmpty(extent)) return null;

    // A security operation's centre symbol is a Point with an Icon style, and a
    // point has no extent — so the measured box counted the arms and the labels and
    // nothing at all for the symbol between them. Cells came out too small and the
    // caption landed on top of the symbol: invisible while the symbol was the
    // library's 25px default, obvious at the size the sweep asks for.
    //
    // The multiplier is empirical, and has to be. Two things stop it being derived:
    //
    //   - The symbol is screen-fixed — an `Icon` is sized in pixels — while the
    //     cell is map-fixed. `drawProvenSamples` frames the finished layout with a
    //     fit, which lands on a coarser resolution than the one the boxes were
    //     measured at, so every map-unit reservation shrinks in pixels while the
    //     symbol does not.
    //   - Growing the boxes reflows the packer, which moves that fit again.
    //     Clearance is not monotonic in this number: ×2, ×2.5 and ×3 measured
    //     3.7px, 1.9px and 7.5px of clear space respectively.
    //
    // ×3.5 of the symbol's half-width measures 13px, enough headroom that a reflow
    // cannot eat it. Re-measure if the symbol size or the layout constants change.
    if (handler instanceof SecurityOperationsController) {
        const half = SAMPLE_UNIT_SIZE_PX * 1.75 * resolution;
        extend(extent, [-half, -half, half, half]);
    }

    return {dx0: extent[0], dy0: extent[1], dx1: extent[2], dy1: extent[3]};
}

/** Feeds a handler the base geometry its controller expects, centred on (cx, cy). */
export function applyBaseGeometry(
    handler: TacticalGraphicHandler,
    name: TacticalGraphicName,
    cx: number,
    cy: number,
    symbolId: string,
): void {
    if (handler instanceof MissionTaskController) {
        handler.graphic.updateGeom({size: HALF, center: [cx, cy], rotation: 0});
    } else if (handler instanceof SecurityOperationsController) {
        handler.setBaseFeature(pointFeature([cx, cy], symbolId, name));
    } else if (handler instanceof PolygonGraphicController) {
        const ring = handler instanceof RectangularAreaGraphicController ? rectRing(cx, cy) : pentagonRing(cx, cy);
        handler.setBaseFeature(polygonFeature(ring, symbolId, name));
    } else if (handler instanceof LineGraphicController) {
        const pts = handler.maxPoints ?? 3; // multi-segment → 3 points (2 segments)
        handler.setBaseFeature(lineFeature(lineCoords(cx, cy, pts), symbolId, name));
    } else {
        throw new Error('unclassified controller');
    }
}

// ── geometry synthesis ──────────────────────────────────────────────────────

/**
 * Line vertices centred on (cx, cy): 2 points → 1 segment; 3+ → a shallow
 * 2-segment V. Drawn at LINE_HALF, not HALF — see LINE_SCALE.
 */
function lineCoords(cx: number, cy: number, pts: number): Coordinate[] {
    if (pts <= 2) return [[cx - LINE_HALF, cy], [cx + LINE_HALF, cy]];
    return [
        [cx - LINE_HALF, cy + LINE_HALF * 0.2],
        [cx, cy - LINE_HALF * 0.2],
        [cx + LINE_HALF, cy + LINE_HALF * 0.2],
    ];
}

/** Closed 5-sided ring (point-up pentagon) inscribed in the cell. */
function pentagonRing(cx: number, cy: number): Coordinate[] {
    const ring: Coordinate[] = [];
    for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
        ring.push([cx + HALF * Math.cos(a), cy + HALF * Math.sin(a)]);
    }
    ring.push(ring[0]);
    return ring;
}

/** Closed rectangle ring (4 corners) inscribed in the cell. */
function rectRing(cx: number, cy: number): Coordinate[] {
    const hy = HALF * 0.68;
    return [
        [cx - HALF, cy - hy],
        [cx + HALF, cy - hy],
        [cx + HALF, cy + hy],
        [cx - HALF, cy + hy],
        [cx - HALF, cy - hy],
    ];
}

// ── feature builders ────────────────────────────────────────────────────────

function stamp<T extends Feature>(f: T, symbolId: string, name: TacticalGraphicName): T {
    f.set('symbolId', symbolId);
    f.set('graphicName', name);
    return f;
}

const lineFeature = (coords: Coordinate[], id: string, name: TacticalGraphicName) =>
    stamp(new Feature(new LineString(coords)), id, name);

const polygonFeature = (ring: Coordinate[], id: string, name: TacticalGraphicName) =>
    stamp(new Feature(new Polygon([ring])), id, name);

const pointFeature = (coord: Coordinate, id: string, name: TacticalGraphicName) =>
    stamp(new Feature(new Point(coord)), id, name);

/**
 * Word-wraps a caption onto short lines so it stays within its cell instead of
 * bleeding into neighbours. Truncates to `maxLines` with an ellipsis.
 */
function wrapLabel(text: string, maxChars = 14, maxLines = 2): string {
    const lines: string[] = [];
    let cur = '';
    for (const word of text.split(' ')) {
        if (!cur) cur = word;
        else if ((cur + ' ' + word).length <= maxChars) cur += ' ' + word;
        else { lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) return lines.slice(0, maxLines).join('\n') + '…';
    return lines.join('\n');
}

/**
 * A non-interactive caption above each sample so you can tell which is which.
 * Wrapped and bottom-anchored at the top of the cell so multi-line names grow
 * up into the gap between rows rather than over the graphic or its neighbours.
 */
function titleFeature(coord: Coordinate, text: string): Feature {
    const f = new Feature(new Point(coord));
    f.set('sampleTitle', true);
    f.setStyle(new Style({
        text: new Text({
            text: wrapLabel(text),
            font: '9px sans-serif',
            textBaseline: 'bottom',
            fill: new Fill({color: '#555'}),
            stroke: new Stroke({color: 'rgba(255,255,255,0.9)', width: 3}),
            overflow: true,
        }),
    }));
    return f;
}

/** The banner that opens each category block, left-aligned above its first row. */
function headingFeature(coord: Coordinate, category: TacticalGraphicCategory): Feature {
    const f = new Feature(new Point(coord));
    f.set('sampleTitle', true);
    f.setStyle(new Style({
        text: new Text({
            text: category.toUpperCase(),
            font: 'bold 13px sans-serif',
            textAlign: 'left',
            textBaseline: 'top',
            fill: new Fill({color: '#1b5e20'}),
            stroke: new Stroke({color: 'rgba(255,255,255,0.9)', width: 4}),
            overflow: true,
        }),
    }));
    return f;
}
