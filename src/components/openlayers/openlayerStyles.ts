import {Map, View} from 'ol';
import TileLayer from 'ol/layer/Tile';
import Feature, {FeatureLike} from 'ol/Feature';
import {Fill, Stroke, Style, Text} from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import {Circle, Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon} from 'ol/geom';
import RenderFeature from 'ol/render/Feature';
import {Coordinate} from 'ol/coordinate';
import {defaults, ScaleLine} from 'ol/control';
import {StyleFunction} from 'ol/style/Style';
import {geometryService} from '@zaes/tactical-graphics';
import {
    getLabel,
    RouteDirection,
    TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicName,
    TacticalGraphicStatus,
} from '@zaes/tactical-graphics';
import {GraphicLabels} from '../../utils/graphicLinkRegistry';
import {assignRole, readGraphicLabels} from './graphicProperties';
import {svgToOpenLayersGeometry} from '../../utils/svgToGeoJson';
import {Position} from 'geojson';
import {
    BASE_FONT_SIZE_PX,
    DEFAULT_PALETTE,
    getDefaultLabelSize,
    getDefaultLineColorOverride,
    getDefaultLineWidth,
    getDrawMarkerColorOverride,
    getDrawMarkerOutlineColorOverride,
    getHandleColorOverride,
    getHostilityColorOverride,
    getInertHandleColorOverride,
    getLabelFillColorOverride,
    getLabelHaloColorOverride,
} from '@zaes/tactical-graphics';
import {OSM} from 'ol/source';
import {isEmpty} from '../../utils/isEmpty';

/**
 * Scratch canvas for measuring text, created on first use rather than at module
 * load. This module is published as `@zaes/tactical-graphics/openlayers`, and a
 * top-level `document.createElement` makes it unimportable anywhere without a
 * DOM — a Next.js server render, a Node script, a jest suite in the `node`
 * environment. Every caller runs inside a StyleFunction, which by then has a
 * document; the fallback only matters if one is ever called without one, and
 * returning 0 widths beats throwing during import.
 */
let textMeasureCtx: CanvasRenderingContext2D | null = null;
const NO_MEASURE: Pick<CanvasRenderingContext2D, 'font' | 'measureText'> = {
    font: '',
    measureText: () => ({width: 0}) as TextMetrics,
};

function measureCtx(): Pick<CanvasRenderingContext2D, 'font' | 'measureText'> {
    if (textMeasureCtx) return textMeasureCtx;
    if (typeof document === 'undefined') return NO_MEASURE;
    textMeasureCtx = document.createElement('canvas').getContext('2d');
    return textMeasureCtx ?? NO_MEASURE;
}

const centerCoordinates = [0, 0];
const TEXT_RESOLUTION_FALLBACK = 3000; // used as fallback when drawingResolution is not stored
export const fontStyle = `bold ${BASE_FONT_SIZE_PX}px sans-serif`;

/**
 * Stroke width (in screen pixels) for every graphic's lines: phase-lines,
 * area outlines, arrows, and custom-rendered graphics all use this width.
 * Backed by the live config — call it fresh from inside a style function
 * rather than caching the result, the same rule as `getDefaultLabelSize()`.
 */
export const LINE_WIDTH = (): number => getDefaultLineWidth();

/** Text-halo stroke width — independent of LINE_WIDTH by design. */
const HALO_WIDTH = 4;

/** Screen-pixel gap between an obstacle line's teeth and the nearest edge of its label. */
const OBSTACLE_LABEL_GAP_PX = 8;

/**
 * ## One palette, and where a host changes it
 *
 * Every accessor below is the same two lines: the host's override if there is one,
 * otherwise the value from `DEFAULT_PALETTE`. The defaults live in the config module
 * rather than as literals here so that "what does this library look like unconfigured"
 * has exactly one answer, and so a host composing its own set can start from it —
 * `{...DEFAULT_PALETTE, ...myColours}`.
 *
 * A host that wants different line work on a dark basemap supplies it through
 * `configureTacticalGraphics`. The library has no mode of its own to consult: only the
 * host knows what its basemap looks like and which state it is in, so a library-side
 * second palette could only guess. `ai/decisions.md` has the history — there was once a
 * dark set, and it was the measured output of a CSS filter rather than anything anyone
 * designed.
 */

/**
 * ## Reading a graphic's affiliation
 *
 * **The amplifier bag first, the loose feature key second.** `writeGraphicProperties`
 * — the documented way to set amplifiers, and the only way the library itself sets them
 * — writes `properties.tacticalGraphic` and nothing else. The `hostility` /
 * `hostilityColor` keys are stamped by three paths in the *demo* (the properties dialog,
 * the sample sweep, and the basemap re-colour in `OpenLayers.tsx`), so a style function
 * that reads only those keys is correct only while a human is driving this app.
 *
 * Two things it was wrong for, both silent:
 *
 * - **Restore.** `restoreTacticalGraphics` rebuilds a graphic from its saved
 *   `tacticalGraphic` bag and sets no loose key, so every saved hostile graphic came
 *   back in the neutral default. Nothing throws; the map is just wrong, and only for
 *   graphics that have been round-tripped.
 * - **Consumers.** The README tells a host to call
 *   `writeGraphicProperties(features, name, {hostility: 'Hostile/Faker'})` and says the
 *   strokes turn red. They did not.
 *
 * The key is kept as a fallback rather than deleted: the demo paths above still set it,
 * and a host may be colouring features by some route of its own.
 */
export function readHostility(feature: FeatureLike): TacticalGraphicHostility {
    return readGraphicLabels(feature).hostility
        ?? feature.get('hostility')
        ?? TacticalGraphicHostility.unknown;
}

/**
 * The line colour for a feature: an explicit `hostilityColor` override if something set
 * one, otherwise the affiliation's colour. `getColorByHostility` already resolves
 * `unknown` to the default line colour, so this covers the unaffiliated case too.
 */
export function readHostilityColor(feature: FeatureLike): string {
    return feature.get('hostilityColor') || getColorByHostility(readHostility(feature));
}

/** Default stroke/fill colour for graphics with no specific hostility colour. */
export function getDefaultLineColor(): string {
    return getDefaultLineColorOverride() ?? DEFAULT_PALETTE.defaultLineColor;
}

/** Text label fill colour. Follows the default line colour unless overridden on its own. */
export function getLabelFillColor(): string {
    return getLabelFillColorOverride() ?? getDefaultLineColor();
}

/** Text label halo (outline) colour — contrast against the map background. */
export function getLabelHaloColor(): string {
    return getLabelHaloColorOverride() ?? DEFAULT_PALETTE.labelHaloColor;
}

/**
 * ## Editor chrome
 *
 * The affordances a user edits a graphic with — handle dots, the inert centre, the draw
 * marker. Not part of any symbol: they say "you can drag this", and that meaning must
 * not shift with a graphic's affiliation. Tinting handles by hostility made a hostile
 * graphic's handles the same red as its own strokes, so they stopped reading as handles
 * at all.
 */

/** Draggable handle dots. Renderers apply their own opacity on top. */
export function getHandleColor(): string {
    return getHandleColorOverride() ?? DEFAULT_PALETTE.handleColor;
}

/** Handle dots that exist but cannot be dragged in the current mode. */
export function getInertHandleColor(): string {
    return getInertHandleColorOverride() ?? DEFAULT_PALETTE.inertHandleColor;
}

/** The marker and sketch line shown while a graphic is being drawn. */
export function getDrawMarkerColor(): string {
    return getDrawMarkerColorOverride() ?? DEFAULT_PALETTE.drawMarkerColor;
}

/** That marker's outline. */
export function getDrawMarkerOutlineColor(): string {
    return getDrawMarkerOutlineColorOverride() ?? DEFAULT_PALETTE.drawMarkerOutlineColor;
}

/** Radius in px of the dot under the cursor while drawing. */
const DRAW_MARKER_RADIUS = 6;
const DRAW_MARKER_OUTLINE_WIDTH = 1.5;

/**
 * The dot drawn at the cursor while a graphic is being placed.
 *
 * Built fresh on each call rather than cached, so a host changing `drawMarkerColor`
 * mid-session sees it on the next frame — the same reason `getHaloStroke` is a function.
 */
export function drawMarkerStyle(): Style {
    return new Style({
        image: new CircleStyle({
            radius: DRAW_MARKER_RADIUS,
            fill: new Fill({color: getDrawMarkerColor()}),
            stroke: new Stroke({color: getDrawMarkerOutlineColor(), width: DRAW_MARKER_OUTLINE_WIDTH}),
        }),
    });
}

/**
 * The draw-time style for **every** graphic — the manager installs it on the `Draw`
 * interaction for any controller that does not supply a `drawStyleFunc` of its own.
 *
 * Before this existed only `MissionTaskController` styled its draw, so the draw-marker
 * colours reached point-anchored graphics and nothing else: every line, polygon and area
 * fell through to OpenLayers' built-in editing style, which is hardcoded and ignores the
 * config entirely. A host could set `drawMarkerColor` and watch it apply to a handful of
 * graphics.
 *
 * OpenLayers renders a draw in two features — the sketch geometry, and a separate Point
 * for the cursor. Both arrive here, which is why the `Point` branch is the marker and
 * everything else is the sketch line. The sketch is dashed and drawn over an outline in
 * the marker's outline colour, so it stays legible over both the basemap and any graphic
 * already on the map.
 */
export function defaultDrawStyleFunc(): StyleFunction {
    return (feature) => {
        if (feature.getGeometry()?.getType() === 'Point') return drawMarkerStyle();
        return [
            new Style({
                stroke: new Stroke({
                    color: getDrawMarkerOutlineColor(),
                    width: LINE_WIDTH() + 2,
                }),
            }),
            new Style({
                stroke: new Stroke({
                    color: getDrawMarkerColor(),
                    width: LINE_WIDTH(),
                    lineDash: [10, 8],
                }),
            }),
        ];
    };
}

/**
 * Halo used for the label background.
 *
 * A function, not a `const`. As a module-level const the halo colour was frozen at
 * import and could never follow a later change — harmless while it was always white,
 * a silent bug the moment a host overrode it. Cached so the ~75 call sites don't
 * allocate a `Stroke` per style call.
 *
 * Keyed on the resolved colour rather than on the mode: the halo now comes from the
 * config, which a host may change at any time, so the mode flag is no longer a
 * complete cache key. In practice a host uses one or two halo colours, so the cache
 * stays tiny. (A plain record, not a `Map` — `Map` is OpenLayers' in this module.)
 */
const haloStrokeCache: Record<string, Stroke> = {};

export function getHaloStroke(): Stroke {
    const color = getLabelHaloColor();
    return haloStrokeCache[color] ??= new Stroke({color, width: HALO_WIDTH});
}

/**
 * Readability clamp on the zoom multiplier of `featureLabelScale`. Same range as
 * `getLineLabelScale`: without the cap a graphic drawn from high altitude grows its
 * label without bound as the user zooms in past the drawing zoom; without the floor
 * the label shrinks to nothing zoomed out.
 */
const MIN_LABEL_ZOOM_MULTIPLIER = 0.3;
const MAX_LABEL_ZOOM_MULTIPLIER = 1.5;

function labelZoomMultiplier(drawRes: number | undefined, resolution: number): number {
    const zoom = drawRes && drawRes > 0 ? drawRes / resolution : Math.sqrt(TEXT_RESOLUTION_FALLBACK / resolution);
    return Math.min(MAX_LABEL_ZOOM_MULTIPLIER, Math.max(MIN_LABEL_ZOOM_MULTIPLIER, zoom));
}

/**
 * Ceiling shared by every *size-proportional* label scale — the block family's
 * `featureGraphicLabelScale` and the ratio-locked mission tasks'
 * `ratioLockedLabelScale`.
 *
 * Both formulas track the graphic's rendered size with nothing stopping them, so
 * a large or zoomed-in graphic grew a letter of unbounded height: a Breach drawn
 * 400 px wide rendered its "B" at ~90 px. The zoom-anchored scales never did
 * that — `featureLabelScale` and `getLineLabelScale` both stop at 1.5× the
 * configured label size, which is why "EX", "DIS" and the Lines labels stay
 * readable-but-sane at every altitude.
 *
 * This is that same ceiling, so a size-proportional label tops out exactly where
 * a zoom-anchored one does. It is a multiple of the *configured* label size, not
 * an absolute pixel count, so raising `labelSize` in the config raises the cap
 * with it. Note the families that share it also share the 24 px font literal, so
 * "1.5" means 36 px of glyph for them and 24 px for anything on `fontStyle`.
 */
export function maxGraphicLabelScale(): number {
    return (getDefaultLabelSize() / BASE_FONT_SIZE_PX) * MAX_LABEL_ZOOM_MULTIPLIER;
}

/**
 * Unified label scale for all graphics.
 * - Uses drawingResolution stored on the feature (set at creation time) to anchor the
 *   label size: at drawing zoom the text is exactly defaultLabelSize px; when zoomed
 *   out (higher resolution) the label shrinks proportionally.
 * - Falls back to a sqrt curve when drawingResolution is not available.
 * - Either way the zoom multiplier is clamped to [0.3, 1.5] of defaultLabelSize so the
 *   label stays readable at every altitude instead of tracking the world scale forever.
 */
export function featureLabelScale(feature: FeatureLike, resolution: number): number {
    const drawRes = feature.get('drawingResolution') as number | undefined;
    const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
    return sizeFactor * labelZoomMultiplier(drawRes, resolution);
}

/**
 * Label scale proportional to the graphic's perpendicular size on screen.
 * Falls back to `featureLabelScale` for features that do not stamp `graphicSize`.
 *
 * Formula: `scale = sizeFactor × K × (graphicSizePx / BASE_FONT_SIZE_PX)`.
 * - `graphicSizePx = graphicSize / resolution`, so the label grows with both
 *   user resize (graphicSize map units) and zoom-in (resolution shrinks).
 * - `K` keeps the rendered label well under the graphic's perpendicular extent.
 * - The result is capped at `maxGraphicLabelScale()` so the growth stops where a
 *   zoom-anchored label's does; past that the letter only gets smaller relative
 *   to the graphic, never larger on screen.
 */
const GRAPHIC_LABEL_FRACTION = 0.5;
export function featureGraphicLabelScale(feature: FeatureLike, resolution: number): number {
    const graphicSize = feature.get('graphicSize') as number | undefined;
    if (graphicSize && graphicSize > 0) {
        const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        const graphicSizePx = graphicSize / resolution;
        return Math.min(maxGraphicLabelScale(), sizeFactor * GRAPHIC_LABEL_FRACTION * graphicSizePx / BASE_FONT_SIZE_PX);
    }
    return featureLabelScale(feature, resolution);
}

/**
 * Whether to add the OpenStreetMap basemap layers. On everywhere, including the
 * hosted demo; set `REACT_APP_BASEMAP=off` at build time to leave them out.
 *
 * `new OSM()` points at tile.openstreetmap.org, so the OSM Foundation's Tile
 * Usage Policy applies: it permits *modest* use, and requires that the
 * attribution stay visible. A niche library demo is modest use — but if traffic
 * ever stops being modest, that is the moment to move to a provider rather than
 * lean harder on donated tiles. The escape hatch is this flag plus a swap of the
 * `source` below; `decisions.md` lists the alternatives that were compared.
 *
 * The dark/light toggle in `OpenLayers.tsx` bails out when the layers are
 * absent, so the off path needs nothing else.
 */
const BASEMAP_ENABLED = process.env.REACT_APP_BASEMAP !== 'off';

const createBasemapLayers = () => BASEMAP_ENABLED ? [
    new TileLayer({
        properties: {name: 'darkBaseMap'},
        source: new OSM({wrapX: false}),
        visible: true,
    }),
    new TileLayer({
        properties: {name: 'lightBaseMap'},
        source: new OSM({wrapX: false}),
        className: '-',
        visible: false,
    }),
] : [];

export const createMap = (target: HTMLElement) => {
    let controls = defaults({zoom: false}).extend([
        new ScaleLine({
            units: 'metric',
        }),
    ]);
    return new Map({
        controls: controls,
        target: target,
        layers: [
            ...createBasemapLayers(),
        ],
        view: new View({
            center: centerCoordinates,
            zoom: 4,
            extent: [                // ← This is the key
                -20037508.34, -20037508.34,   // left, bottom  (approx. full world in Web Mercator)
                20037508.34, 20037508.34,    // right, top
            ],
        }),
    });
};

export const modifyStyle = (color: string) => {
    return new Style({
        fill: undefined,
        stroke: new Stroke({
            color: color,
            width: LINE_WIDTH(),
            lineDash: [4, 4],
        }),
    });
};

function setOpacity(rgba: string, opacity: number): string {
    return rgba.replace(/rgba?\(([^)]+)\)/, (_, values) => {
        const parts = values.split(',').map((v: string) => v.trim());
        parts[3] = opacity.toString(); // replace or add alpha value
        return `rgba(${parts.join(', ')})`;
    });
}

// used as the underlying geometry for each tactical graphic. Users can update this with the Modify interaction.
export const createBaseFeature = () => {
    let feature = new Feature();
    feature.setStyle((feature) => {
        let isHidden = feature.get('hidden');

        if (isHidden) return new Style({});
        return modifyStyle(setOpacity(readHostilityColor(feature), .35));
    });

    feature.set('base', true);
    feature.set('hidden', true);
    return assignRole(feature, 'base');
};

/**
 * Base feature for a point-anchored graphic — the centre it is generated around.
 *
 * Two things it must get right, and a plain `new Feature()` gets neither:
 *
 * - **A style function.** A feature with no style falls through to OpenLayers' own
 *   default, which paints a dot — and that default cannot consult `hidden`, so the
 *   centre showed in every mode. `createBaseFeature`'s style returns an empty `Style`
 *   while hidden, which is what makes the flag mean anything.
 * - **`base` cleared.** That flag means "has vertices the Modify interaction may drag".
 *   A point-anchored graphic has none — it is reshaped by rotate / resize / translate —
 *   so leaving it set would put a draggable vertex on the centre. Same reasoning as
 *   `mobileDefense` in `controllerRegistry.ts`. `role` still marks it as the base.
 */
export const createCenterBaseFeature = (): Feature<Point> => {
    const feature = createBaseFeature() as Feature<Point>;
    feature.setGeometry(new Point([]));
    feature.set('base', false);
    return feature;
};

/**
 * Draw order within the single rendering layer.
 *
 * Everything shares one `VectorLayer`, so without an explicit `zIndex` features
 * paint in source order — which is the order the holders happened to be added
 * in. That let a label's background plate, or a graphic's own fill, cover the
 * handle you were trying to grab: the range-fan band labels sat on their rim
 * handles, and a large centred label ("BDZ", and the crossed mission tasks'
 * letters) hid the centre dot.
 *
 * **Handles are editor chrome and always paint last.** A handle you cannot see
 * is a handle you cannot use, and hit-testing follows draw order too, so
 * lifting them also makes `forEachFeatureAtPixel` reach them first.
 */
export const HANDLE_Z_INDEX = 1000;

// used for adding markers to a tactical graphics to let a user know where they can drag the graphic to modify
export const createHandleFeature = () => {
    let feature = new Feature();

    feature.setStyle((feature) => {
        let isHidden = feature.get('hidden');

        if (isHidden) return new Style({});

        // Always red, never the hostility colour. A handle is a piece of editor
        // chrome, not part of the symbol: it says "you can drag this", and that
        // meaning must not change with the graphic's affiliation. Tinting them
        // also made a hostile graphic's handles the same red as its own strokes,
        // so they stopped reading as handles at all. Grey stays reserved for
        // `createInertHandleFeature` — see it for why the colours must not blur.
        return new Style({
            zIndex: HANDLE_Z_INDEX,
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({
                    color: setOpacity(getHandleColor(), .8),
                }),
            }),
        });
    });
    feature.set('handle', true);
    feature.set('hidden', true);

    return assignRole(feature, 'handle');
};

// used to adjust the width of graphics such as Movement graphics (adjusting the road size)
export const createOffsetHandleFeature = () => {
    let feature = createHandleFeature();
    feature.set('offsetHandler', true);
    return feature;
};

/**
 * The centre dot on a point-anchored graphic.
 *
 * **Grey means "you cannot drag this right now", and it has to stay honest.** The
 * centre is refused as a drag origin for resize (the scale ratio divides by
 * distance-to-centre, which is ~0 there) and for rotate (a point on the axis carries
 * no angle) — but it *is* the natural grab point for a move, so
 * `TacticalGraphicsManager.handleDownEvent` accepts it in translate mode. This style
 * follows that: red like every other live handle while a move is possible, grey
 * otherwise. A grey dot that silently accepted a drag would teach the colour to mean
 * nothing, which is the trap this comment used to warn about when the centre was
 * genuinely never draggable.
 *
 * Deliberately ignores hostility either way: a hostile graphic's line work is red, and
 * editor chrome has to stay readable as chrome.
 */
export const createInertHandleFeature = () => {
    let feature = new Feature();

    feature.setStyle((feature) => {
        if (feature.get('hidden')) return new Style({});
        const grabbable = feature.get('grabbable');
        return new Style({
            zIndex: HANDLE_Z_INDEX,
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({
                    color: grabbable
                        ? setOpacity(getHandleColor(), .8)
                        : getInertHandleColor(),
                }),
            }),
        });
    });
    // `handle` so it hides and shows with the rest of the handle set.
    feature.set('handle', true);
    feature.set('hidden', true);
    feature.set('inert', true);

    return assignRole(feature, 'handle');
};

/**
 * The default style for a graphic feature — used by every holder that does not
 * install a dedicated style function of its own.
 *
 * **Reads the hostility off the feature.** It used to hardcode
 * `getDefaultLineColor()`, which meant changing a graphic's hostility recoloured
 * nothing for anything on this style: all the circle graphics (base defense
 * zone, the circular kill boxes and fire areas), bridge, and every other
 * movement graphic without a bespoke style. Only the graphics with their own
 * style function ever honoured it.
 *
 * `hostilityColor` is what the properties dialog stamps; `hostility` is the raw
 * enum, kept as a fallback for features coloured by some other path.
 *
 * **Stroke only, no fill.** There used to be a translucent blue fill here, left over
 * from a selection highlight that never tracked selection — it painted every
 * default-styled area graphic all the time, which is not what FM 1-02.2 draws and not
 * what any of the graphics with a bespoke style do.
 */
export const createFeature = () => {
    let feature = new Feature();

    feature.setStyle((feature) => {
        const color = readHostilityColor(feature);
        return new Style({
            stroke: new Stroke({
                color,
                width: LINE_WIDTH(),
            }),
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({
                    color: setOpacity(getHandleColor(), .8),
                }),
            }),
        });
    });

    return assignRole(feature, 'graphic');
};

/**
 * Renders the AM (width) amplifier. The value is stored as bare metres — the
 * dialog's Width input accepts digits only — so the unit and the thousands
 * separators are presentation, added here. Anything non-numeric (free text
 * typed before this was a number, or an imported value) is shown verbatim.
 */
function formatWidthAmplifier(value: string): string {
    const metres = Number(value);
    return value.trim() !== '' && Number.isFinite(metres) ? `${metres.toLocaleString('en-US')} M` : value;
}

/** Assumed circle radius when the real one is unknown. */
const ACP_FALLBACK_RADIUS_PX = 12 * 0.95;
/** Share of the circle's diameter the label may span. */
const ACP_TEXT_FRACTION = 0.8;
const PADDING = 4;

/**
 * Scale for an "ACP n" label.
 *
 * Two competing sizes, and the larger wins:
 *
 * - the **floor** — fitted to a fixed assumed circle and capped at the
 *   zoom-anchored scale. This is what the label used to do unconditionally, and
 *   it keeps a narrow corridor labelled instead of letting the text collapse to
 *   nothing when its circle is only a few pixels across.
 * - the **grown** size — fitted to the circle's real rendered radius and capped
 *   at the size-proportional scale, so a wide corridor gets a big label.
 *
 * Pass `circleRadiusPx` / `proportionalScale` only when the feature stamps
 * `graphicSize`; without them the floor applies alone, i.e. the old behaviour.
 */
function getAcpLabelScale(
    text: string,
    font: string,
    zoomScale: number,
    circleRadiusPx?: number,
    proportionalScale?: number,
): number {
    const textWidthAt1 = getTextWidth(text, font, 1);
    const floor = Math.min(zoomScale, (ACP_FALLBACK_RADIUS_PX * zoomScale * 2.5 - PADDING) / textWidthAt1);

    if (circleRadiusPx === undefined || proportionalScale === undefined) return floor;

    const circleMaxWidth = Math.max(0, circleRadiusPx * 2 * ACP_TEXT_FRACTION - PADDING);
    return Math.max(floor, Math.min(proportionalScale, circleMaxWidth / textWidthAt1));
}

export function airCoordinatingCorridorStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => airCoordinatingCorridorStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function airCoordinatingCorridorStyleFromLabels(name: TacticalGraphicName, graphicLabel: GraphicLabels): StyleFunction {
    return (feature, resolution) => {
        const geometry = feature.getGeometry() as MultiPoint;
        const styles: Style[] = [];
        const coords = geometry.getCoordinates();
        const label = getFullLabel(name, graphicLabel.label ?? '');
        const baseScale = featureLabelScale(feature, resolution);

        // The ACP labels track the circle rather than the zoom. `graphicSize` is
        // the corridor radius in map units, so dividing by the resolution gives
        // the circle's rendered pixel radius; `featureGraphicLabelScale` grows
        // the text from the same number, and the fit below keeps it inside.
        const graphicSize = feature.get('graphicSize') as number | undefined;
        const circleRadiusPx = graphicSize && graphicSize > 0 ? graphicSize / resolution : undefined;
        const acpScale = featureGraphicLabelScale(feature, resolution);

        // 🟡 Pull hostility color dynamically
        const color = readHostilityColor(feature);

        // ── Properties info block (above the graphic, upper-left) ──────────────
        const infoLines: string[] = [];
        const corridorName = graphicLabel.label?.trim();
        if (corridorName)               infoLines.push(`NAME:       ${corridorName}`);
        if (graphicLabel.width)         infoLines.push(`WIDTH:      ${formatWidthAmplifier(graphicLabel.width)}`);
        if (graphicLabel.minAltitude)   infoLines.push(`MIN ALT:    ${graphicLabel.minAltitude}`);
        if (graphicLabel.maxAltitude)   infoLines.push(`MAX ALT:    ${graphicLabel.maxAltitude}`);
        if (graphicLabel.startDate)     infoLines.push(`DTG START:  ${graphicLabel.startDate}`);
        if (graphicLabel.endDate)       infoLines.push(`DTG END:    ${graphicLabel.endDate}`);

        if (infoLines.length > 0) {
            // Anchor at the NW corner of the ACP bounding box (minX, maxY)
            let minX = Infinity, maxY = -Infinity;
            for (const [x, y] of coords) {
                if (x < minX) minX = x;
                if (y > maxY) maxY = y;
            }
            // Scale the pixel gap with baseScale so clearance stays proportional
            // to both the text size and the corridor circles at every zoom level.
            styles.push(new Style({
                geometry: new Point([minX, maxY]),
                text: new Text({
                    text: infoLines.join('\n'),
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    textAlign: 'left',
                    textBaseline: 'bottom',
                    offsetY: -60 * baseScale,
                    scale: baseScale,
                }),
            }));
        }

        for (let i = 0; i < coords.length - 1; i++) {

            const labelText = `ACP ${i + 1}`;
            const fittedScale = getAcpLabelScale(labelText, fontStyle, baseScale, circleRadiusPx, acpScale);

            const [x0, y0] = coords[i];
            const [x1, y1] = coords[i + 1];
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            styles.push(new Style({
                geometry: new Point([(x0 + x1) / 2, (y0 + y1) / 2]),
                text: new Text({
                    text: label,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: featureLabelScale(feature, resolution),
                }),
            }));
            styles.push(
                new Style({
                    geometry: new Point(coords[i]),
                    stroke: new Stroke({
                        color,
                        width: LINE_WIDTH(),
                    }),
                    text: new Text({
                        text: labelText,
                        font: fontStyle,
                        // Black, not `color`. FM 1-02.2 colours the *lines* of a
                        // control measure by standard identity — the circle
                        // stroke above — while text amplifiers stay black. See
                        // table 5-3's enemy boundary in colour: red line, black
                        // T/AS and B labels.
                        fill: new Fill({color: getLabelFillColor()}),
                        scale: fittedScale,
                        stroke: getHaloStroke(),
                        textAlign: 'center',
                        textBaseline: 'middle',
                    }),
                }),
            );
        }
        // add the last node in the corridor
        const fittedScale = getAcpLabelScale(`ACP ${coords.length}`, fontStyle, baseScale, circleRadiusPx, acpScale);
        styles.push(
            new Style({
                geometry: new Point(coords[coords.length - 1]),
                stroke: new Stroke({
                    color,
                    width: LINE_WIDTH(),
                }),
                text: new Text({
                    text: `ACP ${coords.length}`,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    scale: fittedScale,
                    stroke: getHaloStroke(),
                    textAlign: 'center',
                    textBaseline: 'middle',
                }),
            }),
        );
        return styles;
    };
}

export const airCorridorCircleStyleFunc = (feature: FeatureLike) => {
    const geometry = feature.getGeometry();
    const color = readHostilityColor(feature);
    const styles: Style[] = [];

    if (geometry instanceof GeometryCollection) {
        geometry.getGeometries().forEach(geom => {
            if (geom instanceof Circle || geom instanceof Polygon) {
                styles.push(
                    new Style({
                        geometry: geom,
                        stroke: new Stroke({color, width: LINE_WIDTH()}),
                        fill: undefined,
                    }),
                );
            } else if (geom instanceof MultiLineString) {
                styles.push(
                    new Style({
                        geometry: geom,
                        stroke: new Stroke({
                            color: color,
                            width: LINE_WIDTH(),
                        }),
                        fill: undefined,
                    }),
                );
            }
        });
    }
    return styles;
};

function createRotatedLabel(start: Coordinate, stop: Coordinate, labelPoint: Coordinate, resolution: number, label: string, scaleMultiplier = 1, feature?: FeatureLike): Style {
    const [x1, y1] = start;
    const [x2, y2] = stop;

    // Segment angle
    const dx = x2 - x1;
    const dy = y2 - y1;
    let rotation = -Math.atan2(dy, dx);

    // Keep text upright
    if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
        rotation += Math.PI;
    }

    const scale = feature
        ? featureLabelScale(feature, resolution) * scaleMultiplier
        : (getDefaultLabelSize() / BASE_FONT_SIZE_PX) * labelZoomMultiplier(undefined, resolution) * scaleMultiplier;

    return new Style({
        geometry: new Point(labelPoint), // dummy point
        text: new Text({
            text: label,
            font: fontStyle,
            fill: new Fill({color: getLabelFillColor()}),
            rotation: rotation,
            textAlign: 'center',
            textBaseline: 'middle',
            scale,
            stroke: getHaloStroke(),
        }),
    });
}

function createRotatedLabelAtMidpoint(start: Coordinate, stop: Coordinate, resolution: number, label: string, scaleMultiplier = 1, feature?: FeatureLike): Style {
    const [midX, midY] = geometryService.getMidpoint(start, stop);
    return createRotatedLabel(start, stop, [midX, midY], resolution, label, scaleMultiplier, feature);
}

export const phaseLineStyle = (feature: FeatureLike, resolution: number, labelText: string) => {
    let featureGeometry = feature.getGeometry();
    const coords = (featureGeometry as LineString).getCoordinates();
    if (coords.length < 2) return []; // need at least 2 pts

    const hostilityColor = readHostilityColor(feature);
    // Test the affiliation, not the colour string. `hostilityColor` is a colour resolved
    // at stamp time, so once the palette became mode-dependent a string compare would
    // both miss a feature stamped in the other mode and be one refactor away from
    // matching some unrelated red.
    if (readHostility(feature) === TacticalGraphicHostility.hostileFaker) {
        labelText = `ENY ${labelText}`;
    }

    /* ---------- end‑points & direction vectors ---------- */
    const start = coords[0];
    const startNext = coords[1];
    const end = coords[coords.length - 1];
    const endPrev = coords[coords.length - 2];

    function vecAngle(p: number[], q: number[]) {
        return Math.atan2(q[1] - p[1], q[0] - p[0]); // map‑space angle (CCW+)
    }

    const aStart = vecAngle(start, startNext);
    const aEnd = vecAngle(endPrev, end);

    /* ---------- convert to screen rotation (CW+) ---------- */
    function toScreen(angle: number) {
        let rot = -angle; // flip y‑axis
        // keep text upright
        if (rot > Math.PI / 2 || rot < -Math.PI / 2) rot += Math.PI;
        return rot;
    }

    const rotStart = toScreen(aStart);
    const rotEnd = toScreen(aEnd);

    /* ---------- stroke ---------- */
    const lineStroke = new Stroke({
        color: hostilityColor,
        width: LINE_WIDTH(),
        lineCap: 'butt',
        lineJoin: 'round',
    });

    /* ---------- label builders ---------- */
    const scale = featureLabelScale(feature, resolution);
    const GAP_PX = 8;
    const textWidth = getTextWidth(labelText, fontStyle, scale);

    // Determine which screen-x side is "outside" each endpoint.
    // offsetX is in screen pixels and is NOT rotated with the text, so we must check
    // the actual x-component of each segment to avoid placing the label through the line
    // when the "keep upright" flip makes the rotation appear the same for both directions.
    const startOutsideRight = (start[0] - startNext[0]) >= 0;
    const endOutsideRight   = (end[0]   - endPrev[0])   >= 0;

    return [
        new Style({stroke: lineStroke}),

        // START LABEL — sits outside the start endpoint along the line direction
        new Style({
            geometry: new Point(start),
            text: new Text({
                text: labelText,
                font: fontStyle,
                rotation: rotStart,
                textAlign: 'left',
                textBaseline: 'middle',
                offsetX: startOutsideRight ? GAP_PX : -GAP_PX - textWidth,
                stroke: getHaloStroke(),
                fill: new Fill({color: getLabelFillColor()}),
                scale: scale,
            }),
        }),

        // END LABEL — sits outside the end endpoint along the line direction
        new Style({
            geometry: new Point(end),
            text: new Text({
                text: labelText,
                font: fontStyle,
                rotation: rotEnd,
                rotateWithView: false,
                textAlign: 'right',
                textBaseline: 'middle',
                offsetX: endOutsideRight ? GAP_PX + textWidth : -GAP_PX,
                stroke: getHaloStroke(),
                fill: new Fill({color: getLabelFillColor()}),
                scale: scale,
            }),
        }),
    ];
};

/**
 * Feature-reading wrapper over {@link phaseLineStyle}, which takes an
 * already-formatted label string. Every graphic routed through
 * `phaseLineStyle` shares this entry point.
 */
export function phaseLineStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (feature, resolution) =>
        phaseLineStyle(feature, resolution, getFullLabel(name, readGraphicLabels(feature).label ?? ''));
}

export function bridgeGraphicStyleFunc(): StyleFunction {
    return (f, resolution) => bridgeGraphicStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function bridgeGraphicStyleFromLabels(graphicLabels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();
        let styles: Style[] = [];
        const [x1, y1] = coords[0];
        const [x2, y2] = coords[1];

        const dx = x2 - x1;
        const dy = y2 - y1;
        let rotation = -Math.atan2(dy, dx);

        // Keep main label upright.
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }

        const labelScale = featureLabelScale(f, resolution);

        // Main label — at bridge midpoint (coords[0]), along the bridge axis.
        styles.push(new Style({
            geometry: new Point(coords[0]),
            text: new Text({
                text: graphicLabels.label ?? '',
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                textAlign: 'center',
                textBaseline: 'middle',
                rotation,
                scale: labelScale,
                stroke: getHaloStroke(),
            }),
        }));

        // Date label — coords[1] is pre-placed by generateLabels beyond the bridge end
        // along the bridge axis.  Always render horizontal (rotation: 0).
        // Use directional textAlign so the text extends AWAY from the bridge rather
        // than being centered back over it.
        const dateText = getDateLabel(graphicLabels);
        if (dateText) {
            // Bridge is "more horizontal" when |dx| >= |dy|.
            // For horizontal bridges coords[1] is to the side of the end — align text
            // so it starts/ends at coords[1] and runs away from the bridge.
            // For vertical bridges coords[1] is above/below the end — center is fine
            // because the horizontal text doesn't extend back along the bridge axis.
            const dateTextAlign: CanvasTextAlign =
                Math.abs(dx) >= Math.abs(dy)
                    ? (dx > 0 ? 'left' : 'right')
                    : 'center';

            // push date label further away from bridge along its axis
            const len = Math.hypot(dx, dy);
            const ux = dx / len;
            const uy = dy / len;

            // distance in pixels → convert to map units
            const EXTRA_GAP_PX = 12; // 👈 increase this to move further away
            const extraGapMap = EXTRA_GAP_PX * resolution;

            const dateCoord: Coordinate = [
                coords[1][0] + ux * extraGapMap,
                coords[1][1] + uy * extraGapMap,
            ];

            styles.push(new Style({
                geometry: new Point(dateCoord),
                text: new Text({
                    text: dateText,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    textAlign: dateTextAlign,
                    textBaseline: 'middle',
                    rotation: 0,
                    scale: labelScale,
                    stroke: getHaloStroke(),
                }),
            }));
        }

        return styles;
    };
}

/** Screen-px clear space between the passage lane's fishtail and its DTG. */
const PASSAGE_LANE_LABEL_GAP_PX = 8;

export function passageLaneGraphicStyle(): StyleFunction {
    return (f, resolution) => passageLaneGraphicStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function passageLaneGraphicStyleFromLabels(graphicLabels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates()[1];
        let styles: Style[] = [];
        const [x1, y1] = coords[0];
        const [x2, y2] = coords[1];

        // Segment angle
        const dx = x2 - x1;
        const dy = y2 - y1;
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }

        // Zoom-anchored and clamped, exactly as Bridge sizes its DTG. The span-
        // proportional formula this replaced tied the glyph to the width of the
        // lane, so a lane drawn a few hundred metres wider rendered text several
        // times the height of every other mobility label.
        const scale = featureLabelScale(f, resolution);

        // The DTG sits clear of the whole symbol, so it has to start behind the
        // fishtail — not behind the centre line, which is where a flat offset off
        // `coords[0]` put it. Sub-line [2] is the tail: `[hook, start, hook]`,
        // both hooks swept back from the start point, so measuring how far they
        // reach along the line is the only way to know what to clear. A constant
        // cannot: the hooks are `size * 20` metres, so their screen reach changes
        // with zoom while a pixel offset does not.
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const tail = geom.getCoordinates()[2] ?? [];
        let tailReachPx = 0;
        for (const p of [tail[0], tail[2]]) {
            if (!p) continue;
            const alongPx = ((p[0] - x1) * ux + (p[1] - y1) * uy) / resolution;
            tailReachPx = Math.max(tailReachPx, -alongPx);   // negative = behind the start
        }
        // Text is rendered turned 90°, so half its *height* is what overhangs
        // toward the symbol; `BASE_FONT_SIZE_PX` is the height `fontStyle` declares.
        const clearancePx = tailReachPx + PASSAGE_LANE_LABEL_GAP_PX + (BASE_FONT_SIZE_PX / 2) * scale;
        const labelCoord: Coordinate = [x1 - ux * clearancePx * resolution, y1 - uy * clearancePx * resolution];

        // The DTG reads across the lane, so it needs its *own* upright pass: the
        // one above keeps `rotation` upright, and adding a quarter turn to an
        // already-normalised angle pushes it straight back out of range. Drawn
        // north-to-south the lane landed the label on π — upside down.
        //
        // **Wrap before comparing.** The pass above corrects by *adding* π, so a
        // south-west lane leaves `rotation` at 7π/4 — the same direction as −π/4
        // and drawn identically, but numerically far outside any range test. A
        // bare `if (θ > π/2)` on that reads it as needing a flip and turns an
        // upright label over, which is exactly the fault being fixed here.
        // `atan2(sin, cos)` folds any angle back into (−π, π] first.
        //
        // Correcting by ±π keeps the label perpendicular to the lane, so it only
        // ever flips end-for-end about its own centre. That matters twice over:
        // the anchor does not move, and the clearance above stays valid, because
        // it is still the glyph's *height* that overhangs toward the symbol.
        const acrossLane = rotation + Math.PI / 2;
        let labelRotation = Math.atan2(Math.sin(acrossLane), Math.cos(acrossLane));
        if (labelRotation > Math.PI / 2) labelRotation -= Math.PI;
        else if (labelRotation <= -Math.PI / 2) labelRotation += Math.PI;

        styles.push(new Style({
            geometry: new Point(labelCoord),
            text: new Text({
                text: getDateLabel(graphicLabels),
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                textAlign: 'center',
                textBaseline: 'middle',
                rotation: labelRotation,
                scale,
                stroke: getHaloStroke(),
            }),
        }));
        const hostility = readHostility(f);
        const outlineStyle = new Style({
            geometry: geom,
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
        });
        styles.push(outlineStyle);
        return styles;
    };
}

/**
 * Graphic StyleFunction for the Infiltration line feature.
 * Recomputes the gap around the "IN" label on every render using the live
 * resolution, keeping the gap constant in screen pixels regardless of zoom.
 *
 * NOTE: OL geometry is in EPSG:3857 (projected metres), so gap math must use
 * plain Euclidean vectors — NOT turf/GeometryService geographic helpers.
 */
export function infiltrationGraphicStyleFunc(): StyleFunction {
    return (feature, resolution) => {
        const lineStroke = new Stroke({color: readHostilityColor(feature), width: LINE_WIDTH()});
        const geom = feature.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates();
        if (!coords || coords.length < 2) return [];

        const lineCoords = coords[0];   // base line (EPSG:3857)
        const arrowCoords = coords[1];  // arrowhead [leftWing, tip, rightWing]

        // Label center is at 25% of the first segment (matches generateLabels logic).
        const [x0, y0] = lineCoords[0];
        const [x1, y1] = lineCoords[1];
        const lcx = x0 + (x1 - x0) * 0.25;
        const lcy = y0 + (y1 - y0) * 0.25;

        // Unit vector along the segment.
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return [];
        const ux = dx / len;
        const uy = dy / len;

        // Gap proportional to arrowhead wing-to-wing span + 5px fixed (like Penetration).
        const [awx0, awy0] = arrowCoords[0]; // leftWing
        const [awx1, awy1] = arrowCoords[2]; // rightWing
        const ww = Math.sqrt((awx1 - awx0) ** 2 + (awy1 - awy0) ** 2);
        const gapHalf = ww * 0.35 + 5 * resolution;
        const gapStart: Coordinate = [lcx - ux * gapHalf, lcy - uy * gapHalf];
        const gapEnd: Coordinate = [lcx + ux * gapHalf, lcy + uy * gapHalf];

        return [
            new Style({geometry: new LineString([lineCoords[0], gapStart]), stroke: lineStroke}),
            new Style({geometry: new LineString([gapEnd, ...lineCoords.slice(1)]), stroke: lineStroke}),
            new Style({geometry: new LineString(arrowCoords), stroke: lineStroke}),
        ];
    };
}

/**
 * Graphic StyleFunction for the Envelopment line feature.
 * Renders: straight part with zoom-invariant gap around "E" label, arc, open arrowhead.
 */
// MobileDefense: multi-line-string geometry where triangle rings (closed 4-point
// sub-arrays) are rendered as filled polygons and every other sub-array is a
// stroked line (arcs, arrow shaft, arrow head).
export function mobileDefenseGraphicStyleFunc(): StyleFunction {
    return (feature) => {
        const color = readHostilityColor(feature);
        const lineStroke = new Stroke({color, width: LINE_WIDTH()});
        const fill = new Fill({color});
        const geom = feature.getGeometry() as MultiLineString;
        if (!geom) return [];
        const coords = geom.getCoordinates();
        const styles: Style[] = [];
        for (const ring of coords) {
            if (ring.length === 4
                && ring[0][0] === ring[ring.length - 1][0]
                && ring[0][1] === ring[ring.length - 1][1]) {
                styles.push(new Style({geometry: new Polygon([ring]), fill, stroke: lineStroke}));
            } else {
                styles.push(new Style({geometry: new LineString(ring), stroke: lineStroke}));
            }
        }
        return styles;
    };
}

export function envelopmentGraphicStyleFunc(): StyleFunction {
    return (feature, resolution) => {
        const lineStroke = new Stroke({color: readHostilityColor(feature), width: LINE_WIDTH()});
        const geom = feature.getGeometry() as MultiLineString;
        if (!geom) return [];
        const coords = geom.getCoordinates();
        if (!coords || coords.length < 3) return [];

        const lineCoords = coords[0];  // straight part
        const arcCoords = coords[1];  // semicircular arc
        const arrowCoords = coords[2]; // open arrowhead

        // Gap around "E" label at 25% of first segment — same logic as Infiltration.
        const [x0, y0] = lineCoords[0];
        const [x1, y1] = lineCoords[1];
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);

        // Degenerate straight part (during drawing with only 2 base points) — render arc + arrow only.
        if (len === 0) {
            return [
                new Style({geometry: new LineString(arcCoords), stroke: lineStroke}),
                new Style({geometry: new LineString(arrowCoords), stroke: lineStroke}),
            ];
        }

        const lcx = x0 + (x1 - x0) * 0.25;
        const lcy = y0 + (y1 - y0) * 0.25;
        const ux = dx / len, uy = dy / len;
        // Gap proportional to arrowhead wing-to-wing span + 5px fixed (same as Infiltration).
        const [awx0, awy0] = arrowCoords[0]; // leftWing
        const [awx1, awy1] = arrowCoords[2]; // rightWing
        const ww = Math.sqrt((awx1 - awx0) ** 2 + (awy1 - awy0) ** 2);
        const gapHalf = ww * 0.35 + 5 * resolution;
        const gapStart: Coordinate = [lcx - ux * gapHalf, lcy - uy * gapHalf];
        const gapEnd: Coordinate = [lcx + ux * gapHalf, lcy + uy * gapHalf];

        return [
            new Style({geometry: new LineString([lineCoords[0], gapStart]), stroke: lineStroke}),
            new Style({geometry: new LineString([gapEnd, ...lineCoords.slice(1)]), stroke: lineStroke}),
            new Style({geometry: new LineString(arcCoords), stroke: lineStroke}),
            new Style({geometry: new LineString(arrowCoords), stroke: lineStroke}),
        ];
    };
}

/**
 * Render a label whose font size tracks the graphic's size in screen pixels.
 * coords[0]→coords[1] defines both the label position (midpoint) and the span
 * used to derive scale — so the label stays proportional at every zoom level.
 * Font is declared at 24px; scale = (spanPx * 0.7) / 24.
 */
function graphicProportionalLabel(c0: Coordinate, c1: Coordinate, resolution: number, text: string, textAlign: CanvasTextAlign = 'center'): Style {
    const [x0, y0] = c0;
    const [x1, y1] = c1;
    const dx = x1 - x0, dy = y1 - y0;
    const spanPx = Math.sqrt(dx * dx + dy * dy) / resolution;
    const scale = (spanPx * 0.7) / 24;
    let rotation = -Math.atan2(dy, dx);
    if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
    return new Style({
        geometry: new Point([(x0 + x1) / 2, (y0 + y1) / 2]),
        text: new Text({
            text,
            font: fontStyle,
            fill: new Fill({color: getLabelFillColor()}),
            rotation,
            textAlign,
            textBaseline: 'middle',
            scale,
        }),
    });
}

/**
 * Compute a label scale locked to a segment's screen-pixel span.
 * Mirrors graphicProportionalLabel: font declared at 24px, scale = (spanPx × 0.7) / 24.
 * As you zoom in the segment grows on screen → label grows with it.
 */
function segmentProportionalScale(dx: number, dy: number, resolution: number): number {
    const spanPx = Math.sqrt(dx * dx + dy * dy) / resolution;
    return (spanPx * 0.7) / 24;
}

/**
 * Create a single feature with a style function
 * that draws labels at each segment midpoint with rotation.
 */
export function movementGraphicPathStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => movementGraphicPathStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function movementGraphicPathStyleFromLabels(name: TacticalGraphicName, label: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        // Infiltration always shows "IN" near the tail — user label is ignored.
        if (name === TacticalGraphicName.Infiltration) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            return [new Style({
                geometry: new Point([(x0 + x1) / 2, (y0 + y1) / 2]),
                text: new Text({
                    text: 'IN',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // Envelopment always shows "E" near the tail — user label is ignored.
        if (name === TacticalGraphicName.Envelopment) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            return [new Style({
                geometry: new Point([(x0 + x1) / 2, (y0 + y1) / 2]),
                text: new Text({
                    text: 'E',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // MobileDefense always shows "MD" at the p0 vertex — the tail of the
        // ellipse, in the gap the two arcs leave open on that side — horizontal
        // regardless of the graphic's rotation. Doctrinally the amplifier sits at
        // the start of the graphic, not in its middle. User label is ignored.
        if (name === TacticalGraphicName.MobileDefense) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 1) return [];
            const [x0, y0] = coords[0];
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text: 'MD',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation: 0,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // TurningMovement always shows "T" starting at the arrowhead base — user label is ignored.
        if (name === TacticalGraphicName.TurningMovement) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            //const spanPx = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) / resolution;
            //const scale = featureLabelScale(f, resolution);//(spanPx * 0.7) / 24;
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text: 'T',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation,
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // FrontalAttack always shows "A" starting at the arrowhead base — user label is ignored.
        if (name === TacticalGraphicName.FrontalAttack) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            // const spanPx = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) / resolution;
            // const scale = (spanPx * 0.7) / 24;
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text: 'A',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation,
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // AviationAxisOfAdvance: name + DTG on one line at the start of the arrow.
        if (name === TacticalGraphicName.AviationAxisOfAdvance) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            const dx = x1 - x0, dy = y1 - y0;
            let rotation = -Math.atan2(dy, dx);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            const dateLabel = getDateLabel(label);
            const parts: string[] = [];
            if (label.label) parts.push(label.label);
            if (dateLabel) parts.push(dateLabel);
            const text = parts.join('     ') || '';
            if (!text) return [];
            const spanPx = Math.sqrt(dx * dx + dy * dy) / resolution;
            const scale = (spanPx * 0.7) / BASE_FONT_SIZE_PX;
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation,
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale,
                }),
            })];
        }
        if (name === TacticalGraphicName.AttackHelicopterAxisOfAdvance) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 4) return [];
            const styles: Style[] = [];

            // coords[0..1]: text label span; coords[2]: twist center; coords[3]: direction point
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            const [cx, cy] = coords[2];
            const [dx3, dy3] = coords[3];

            // ── Text label (same as AviationAxisOfAdvance) ─────────────
            const tdx = x1 - x0, tdy = y1 - y0;
            let textRotation = -Math.atan2(tdy, tdx);
            if (textRotation > Math.PI / 2 || textRotation < -Math.PI / 2) textRotation += Math.PI;
            const dateLabel = getDateLabel(label);
            const parts: string[] = [];
            if (label.label) parts.push(label.label);
            if (dateLabel) parts.push(dateLabel);
            const text = parts.join('     ') || '';
            if (text) {
                const spanPx = Math.sqrt(tdx * tdx + tdy * tdy) / resolution;
                const textScale = (spanPx * 0.7) / BASE_FONT_SIZE_PX;
                styles.push(new Style({
                    geometry: new Point([x0, y0]),
                    text: new Text({
                        text,
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: getHaloStroke(),
                        rotation: textRotation,
                        textAlign: 'left',
                        textBaseline: 'middle',
                        scale: textScale,
                    }),
                }));
            }

            // ── Attack helicopter symbol at twist point ────────────────
            // Arrow direction: from direction point (coords[3]) toward twist center (coords[2])
            const heading = Math.atan2(cy - dy3, cx - dx3);
            // Symbol half-size: use the text label span as reference (= arrow radius in map units)
            const s = Math.sqrt(tdx * tdx + tdy * tdy) * 0.5;

            const color = (f as Feature).get?.('hostilityColor') || getDefaultLineColor();
            const symbolStroke = new Stroke({ color, width: LINE_WIDTH() });
            const symbolFill = new Fill({ color });

            // Helper: offset from center by angle and distance
            const off = (angle: number, dist: number): Coordinate =>
                [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist];

            // Line parallel to arrowhead base (perpendicular to arrow heading),
            // with arrowhead pointing in whichever perpendicular direction is "up" on screen.
            // Pick the perpendicular that has a positive Y component (north = up in EPSG:3857).
            let perpAngle = heading + Math.PI / 2;
            if (Math.sin(perpAngle) < 0) perpAngle += Math.PI;

            const stalkHalf = s * 1.0;
            const lineTop = off(perpAngle, stalkHalf);
            const lineBottom = off(perpAngle + Math.PI, stalkHalf);
            const stalkLine = new LineString([lineBottom, lineTop]);
            styles.push(new Style({ geometry: stalkLine, stroke: symbolStroke }));

            // Small horizontal base at the bottom of the stalk (perpendicular to stalk = along heading)
            const baseHalfWidth = s * 0.3;
            const baseLeft: Coordinate = [
                lineBottom[0] + Math.cos(heading) * baseHalfWidth,
                lineBottom[1] + Math.sin(heading) * baseHalfWidth,
            ];
            const baseRight: Coordinate = [
                lineBottom[0] - Math.cos(heading) * baseHalfWidth,
                lineBottom[1] - Math.sin(heading) * baseHalfWidth,
            ];
            const baseLine = new LineString([baseLeft, baseRight]);
            styles.push(new Style({ geometry: baseLine, stroke: symbolStroke }));

            // Arrowhead (filled triangle) at top of the stalk
            const arrowLen = s * 0.4;
            const arrowHalfWidth = s * 0.2;
            const arrowTip = off(perpAngle, stalkHalf + arrowLen);
            // Arrowhead base wings are perpendicular to perpAngle (i.e. along the heading)
            const arrowLeft: Coordinate = [
                lineTop[0] + Math.cos(heading) * arrowHalfWidth,
                lineTop[1] + Math.sin(heading) * arrowHalfWidth,
            ];
            const arrowRight: Coordinate = [
                lineTop[0] - Math.cos(heading) * arrowHalfWidth,
                lineTop[1] - Math.sin(heading) * arrowHalfWidth,
            ];
            const arrowHead = new Polygon([[arrowTip, arrowLeft, arrowRight, arrowTip]]);
            styles.push(new Style({ geometry: arrowHead, fill: symbolFill, stroke: symbolStroke }));

            return styles;
        }
        // Main/Supporting axis of advance: single "name DTG" label on the
        // centerline, right-aligned just behind the arrowhead. Span (coords[0],
        // coords[1]) runs along the last base segment with coords[1] sitting at
        // the arrow tip anchor; we draw text anchored at coords[1] minus a
        // small clearance, extending backward, rotated with the line. Scale
        // tracks the arrow's radius span so text stays inside the channel.
        if (name === TacticalGraphicName.MainAxisOfAdvance ||
            name === TacticalGraphicName.MainAxisOfAdvanceFeint ||
            name === TacticalGraphicName.SupportingAxisOfAdvance ||
            name === TacticalGraphicName.InfiltrationLane) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [c0, c1] = coords;
            const dx = c1[0] - c0[0], dy = c1[1] - c0[1];
            const segLenMap = Math.hypot(dx, dy);
            if (segLenMap === 0) return [];
            const ux = dx / segLenMap, uy = dy / segLenMap;

            const dateLabel = getDateLabel(label);
            const parts: string[] = [];
            if (label.label) parts.push(label.label);
            if (dateLabel) parts.push(dateLabel);
            const text = parts.join('     ');
            if (!text) return [];

            const rotation = getRotation(c0, c1);
            const arrowGoesRight = c1[0] >= c0[0];
            // InfiltrationLane label sits centered on the middle of the
            // center-most segment; axis-of-advance labels sit right-aligned
            // just behind the arrowhead.
            const centerLabel = name === TacticalGraphicName.InfiltrationLane;
            const textAlign: CanvasTextAlign = centerLabel
                ? 'center'
                : (arrowGoesRight ? 'right' : 'left');

            const CLEARANCE_PX = 10;
            const clearanceMap = CLEARANCE_PX * resolution;
            const anchor: Coordinate = centerLabel
                ? [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2]
                : [c1[0] - ux * clearanceMap, c1[1] - uy * clearanceMap];

            const spanPx = segLenMap / resolution;
            const scale = (spanPx * 0.7) / BASE_FONT_SIZE_PX;

            return [new Style({
                geometry: new Point(anchor),
                text: new Text({
                    text,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation,
                    textAlign,
                    textBaseline: 'middle',
                    scale,
                }),
            })];
        }
        // Counterattack: "CATK" left of segment midpoint, user name right — both on the
        // last body segment (before the arrowhead). Bypasses movementGraphicStyles.
        if (name === TacticalGraphicName.Counterattack) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            const catkText = label.label ? `CATK ${label.label}` : 'CATK';
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text: catkText,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation,
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        return movementGraphicStyles(label, f, resolution);
    };
}

function movementGraphicStyles(label: GraphicLabels, f: FeatureLike, resolution: number) {
    let primaryLabel = label.label ?? '';
    let dateLabel = getDateLabel(label);
    const geom = f.getGeometry() as MultiPoint;
    if (!geom) return [];
    const coords = geom.getCoordinates();
    if (!coords || coords.length < 2) return [];

    const styles: Style[] = [];
    styles.push(graphicProportionalLabel(coords[0], coords[1], resolution, primaryLabel));

    if (!!dateLabel) {
        // Shift one span-width along line direction for date label offset
        const [x0, y0] = coords[0];
        const [x1, y1] = coords[1];
        const dx = x1 - x0, dy = y1 - y0;
        const dc0: Coordinate = [x0 + dx, y0 + dy];
        const dc1: Coordinate = [x1 + dx, y1 + dy];
        styles.push(graphicProportionalLabel(dc0, dc1, resolution, dateLabel));
    }

    return styles;
}

/**
 * Downward nudge, in screen pixels per unit of label scale, that puts a capital
 * letter's *ink* on the line rather than its em box. @see clearStyleFunc
 */
const OPTICAL_CENTRE_PX_PER_SCALE = 2.2;

export function clearStyleFunc(textLabel: string, t1: number = 0.6): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates();

        let midLine = coords[4];

        const styles: Style[] = [];
        const hostility = readHostility(f);

        const outlineSegments: Coordinate[][] = [];

        let midSegmentIndex = 4;

        for (let i = 0; i < coords.length; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push(coords[i]);
            }
        }

        // t1 is the fractional position along the mid line where the label
        // sits (0 = start, 1 = end). Defaults to 0.6 for Clear; Disrupt passes
        // 0.5 so the D label centers on the middle line.
        const p1 = midLine[0];
        const p2 = midLine[1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        if (!textLabel) {
            // The table 5-19 obstacle effect carries no letter. GAP_PX below is
            // a flat constant rather than a measured label width, so an empty
            // label still cuts a 20px hole in the prong. Push the segment whole.
            outlineSegments.push([p1, p2]);
        } else {
            // 4) carve a central gap in that opening side
            const GAP_PX = 10; // px gap on each side of the dot
            const gapMap = GAP_PX * resolution; // map-unit gap
            const gapRatio = gapMap / segLen;

            const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
            const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];

            // keep the two side pieces of that segment
            outlineSegments.push([p1, gapA], [gapB, p2]);

            // 5) compute the center of the gap for the dot
            const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];
            let rotation = -Math.atan2(dy, dx);

            // Keep text upright
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
                rotation += Math.PI;
            }
            // Normalize to [-π, π)
            if (rotation > Math.PI) rotation -= 2 * Math.PI;
            // 6) build styles for the echelon in the middle
            const labelScale = featureGraphicLabelScale(f, resolution);
            const textStyle = new Style({
                geometry: new Point(midGap),
                text: new Text({
                    text: textLabel,
                    font: 'bold 24px sans-serif',
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    // `textBaseline: 'middle'` centres the font's *em box* on the
                    // anchor, not the capital's ink, so the letter renders high and
                    // the line looks as if it passes below centre. Measured on the
                    // rendered glyph, the error is 2.2 px per unit of label scale
                    // (2.5 px at scale 1.03, 5.5 px at 2.44) — a font-metric
                    // artefact, hence proportional. OL applies `offsetY` in raw
                    // screen pixels and does **not** multiply it by `scale`, so the
                    // scale has to be applied here.
                    offsetY: OPTICAL_CENTRE_PX_PER_SCALE * labelScale,
                    scale: labelScale,
                    stroke: getHaloStroke(),
                }),
            });
            styles.push(textStyle);
        }

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
        });
        // Base layers
        styles.push(outlineStyle);
        return styles;
    };
}

function getRotation(start: Coordinate, end: Coordinate) {
    const dx = end[0] - start[0],
        dy = end[1] - start[1];
    let rotation = -Math.atan2(dy, dx);

    // Keep text upright
    if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
        rotation += Math.PI;
    }
    // Normalize to [-π, π)
    if (rotation > Math.PI) rotation -= 2 * Math.PI;
    return rotation;
}

/**
 * Offset `anchor` perpendicular to line `a→b`, always toward the "above" (north) side
 * regardless of which direction the line was drawn. Safe to call for both label-above
 * and label-below needs: use offsetBelow for the opposite side.
 */
function offsetAbove(anchor: Coordinate, a: Coordinate, b: Coordinate, resolution: number, offsetPx: number): Coordinate {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return anchor;
    // CCW perpendicular unit vector
    let nx = -dy / len;
    let ny = dx / len;
    // Normalize so the perpendicular always points "above" (north = positive y in EPSG:3857).
    // Without this, drawing right-to-left produces ny < 0 and labels appear below the line.
    if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
    const offsetMap = offsetPx * Math.abs(resolution);
    return [anchor[0] + nx * offsetMap, anchor[1] + ny * offsetMap];
}

/** Mirror of offsetAbove — offsets `anchor` to the "below" (south) side of line `a→b`. */
function offsetBelow(anchor: Coordinate, a: Coordinate, b: Coordinate, resolution: number, offsetPx: number): Coordinate {
    const [x, y] = offsetAbove(anchor, a, b, resolution, offsetPx);
    return [2 * anchor[0] - x, 2 * anchor[1] - y];
}

function offsetCoordinatesUp(start: Coordinate, next: Coordinate, resolution: number, offsetPx: number = 15): Coordinate {
    const dx = next[0] - start[0],
        dy = next[1] - start[1];

    // Offset in map units
    const offsetMap = offsetPx * resolution;
    // Perpendicular unit vector
    const len = Math.hypot(dx, dy);

    const nx = -dy / len;
    const ny = dx / len;
    // Clamp to small angles so vertical lines stay horizontal
    return [start[0] + nx * offsetMap, start[1] + ny * offsetMap];
}

/**
 * ## Route / MSR / ASR traffic-direction block (FM 1-02.2 Table 5-17)
 *
 * The plates stack three things above the route line, in this order going up:
 * the line itself, then the traffic arrow(s), then the identifier. Each variant
 * has its own arrow figure:
 *
 * - **one-way** — a single arrow.
 * - **two-way** — two arrows on separate rows, the upper pointing forward and
 *   the lower pointing back.
 * - **alternating** — one row reading `←— ALT —→`: the word sits *between* two
 *   outward-pointing arrows, not beside them.
 * - **general** — no arrow at all, identifier only.
 *
 * Everything below is screen-pixel geometry multiplied by `resolution` once, so
 * the block keeps its proportions at every zoom. It is drawn rather than blitted
 * from the 24 px `routeDirectionIcons` sprites, which could not carry the ALT
 * text and rendered a fixed size no matter how big the label beside them grew.
 * (Those constants stay exported — they are published API.)
 *
 * The arrow span tracks the measured identifier width, which is what makes the
 * figure read as one unit the way the plates do.
 *
 * Every constant below is a screen-pixel figure **at label scale 1**, i.e.
 * against a 16 px `fontStyle` glyph — the whole block is multiplied by the
 * identifier's own scale so the figure and the word it belongs to grow
 * together. The ratios are read off the plate: arrowhead ≈ 0.6 of the
 * identifier's cap height, the line-to-arrow gap ≈ 1.2 of it, and the
 * arrow-to-identifier gap ≈ 1.0.
 */

/**
 * Traffic arrows are decoration on the route, so they draw thinner than it.
 *
 * Half the route's width rather than a fixed 2px, because the route's width is a host
 * setting now (`lineWidth`, 1–8). A pinned 2 kept the intended look only at the default
 * 4 — at `lineWidth: 1` the "thinner" decoration came out *thicker* than the line it
 * decorates. Floors at 1 so it never vanishes, which also stops it from crossing over.
 */
const routeArrowWidth = (): number => Math.max(1, LINE_WIDTH() / 2);
/** Centreline of the arrow row nearest the route. */
const ROUTE_ARROW_BASE_PX = 14;
/** Row-to-row pitch for the two-way pair. */
const ROUTE_ARROW_ROW_PITCH_PX = 12;
const ROUTE_ARROW_HEAD_LEN_PX = 10;
const ROUTE_ARROW_HEAD_HALF_PX = 5;
/** Clear space either side of the ALT word before its arrows start. */
const ROUTE_ALT_GAP_PX = 5;
/**
 * Shortest an alternating arm may be, head included. The plate draws each arm at
 * roughly two-thirds the width of the word between them, so a bare `ROUTE` — the
 * narrowest identifier there is — still gets an arm that reads as an arrow
 * rather than a head with a stub behind it.
 */
const ROUTE_ALT_ARM_PX = 26;
/** Shortest a traffic arrow may get when the identifier is short or empty. */
const ROUTE_ARROW_MIN_SPAN_PX = 56;

/**
 * One end of the route: the identifier, plus the traffic-direction figure for
 * everything except {@link RouteDirection.GENERAL}.
 *
 * `anchor` is the line endpoint; `a`→`b` is the segment whose bearing orients
 * the block. Offsets go through `offsetAbove` / `offsetBelow` so the block lands
 * on the same side of the line whichever way the user drew it.
 *
 * The whole block renders in the label colour — see the note on `color` below.
 */
function routeEndStyles(
    resolution: number,
    label: string,
    direction: RouteDirection,
    atStart: boolean,
    anchor: Coordinate,
    a: Coordinate,
    b: Coordinate,
    labelScale: number,
): Style[] {
    const styles: Style[] = [];
    // The traffic arrows are part of the amplifier block, not the control
    // measure's line work, so they take the label colour and stay black on a
    // hostile route — the same call `ALT` and the identifier make. Only the
    // route line itself answers to `getColorByHostility`.
    const color = getLabelFillColor();
    const rotation = getRotation(a, b);
    // getRotation returns -atan2(dy, dx) flipped to keep text upright, so
    // negating it recovers the along-line unit vector in the same, upright
    // direction the text reads.
    const ux = Math.cos(-rotation);
    const uy = Math.sin(-rotation);

    /**
     * How far along the line the whole block is pushed off `anchor`, in screen px.
     * Set once the block's width is known; the figure is built symmetrically about
     * zero and then slid inward by half its width so it sits **over** the route
     * instead of straddling its end. Zero for GENERAL, which has no figure and
     * keeps the endpoint-anchored identifier every other line graphic uses.
     */
    let shiftPx = 0;
    /** Point `alongPx` screen px along the line from the row centred `upPx` above it. */
    const at = (upPx: number, alongPx: number): Coordinate => {
        const [cx, cy] = offsetAbove(anchor, a, b, resolution, upPx);
        const d = (alongPx + shiftPx) * resolution;
        return [cx + ux * d, cy + uy * d];
    };

    const s = labelScale;
    const headLenPx = ROUTE_ARROW_HEAD_LEN_PX * s;
    const headHalfPx = ROUTE_ARROW_HEAD_HALF_PX * s;

    /** Shaft `fromPx`→`toPx` on row `rowPx`, with the solid head always at `toPx`. */
    const arrow = (rowPx: number, fromPx: number, toPx: number) => {
        const base = at(rowPx, toPx + (fromPx > toPx ? headLenPx : -headLenPx));
        styles.push(new Style({
            geometry: new LineString([at(rowPx, fromPx), at(rowPx, toPx)]),
            stroke: new Stroke({color, width: routeArrowWidth()}),
        }));
        const tip = at(rowPx, toPx);
        const left = offsetAbove(base, a, b, resolution, headHalfPx);
        const right = offsetBelow(base, a, b, resolution, headHalfPx);
        styles.push(new Style({
            // Ring closed explicitly — an open ring renders inconsistently.
            geometry: new Polygon([[tip, left, right, tip]]),
            fill: new Fill({color}),
        }));
    };

    const rows = direction === RouteDirection.TWO_WAY ? 2 : direction === RouteDirection.GENERAL ? 0 : 1;
    const row = (i: number) => (ROUTE_ARROW_BASE_PX + i * ROUTE_ARROW_ROW_PITCH_PX) * s;

    if (rows > 0) {
        const labelWidthPx = getTextWidth(label, fontStyle, s);
        const altWidthPx = direction === RouteDirection.ALTERNATING ? getTextWidth('ALT', fontStyle, s) : 0;
        // An alternating row has to hold ALT plus a full arrow on each side, so
        // its floor is that content — never the label, which may be shorter.
        const minSpanPx = altWidthPx > 0
            ? altWidthPx + 2 * (ROUTE_ALT_GAP_PX + ROUTE_ALT_ARM_PX) * s
            : ROUTE_ARROW_MIN_SPAN_PX * s;
        const halfPx = Math.max(labelWidthPx, minSpanPx) / 2;

        // Slide the block off the endpoint and onto the route. `ux`/`uy` point
        // the way the text reads, which is inward at one end of the line and
        // outward at the other, so the direction has to be taken from the
        // segment rather than assumed.
        const inward: Coordinate = atStart ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]];
        shiftPx = (inward[0] * ux + inward[1] * uy >= 0 ? 1 : -1) * halfPx;

        if (direction === RouteDirection.ONE_WAY) {
            arrow(row(0), -halfPx, halfPx);
        } else if (direction === RouteDirection.TWO_WAY) {
            arrow(row(0), halfPx, -halfPx);   // lower row points back
            arrow(row(1), -halfPx, halfPx);   // upper row points forward
        } else {
            // Both arms point away from the word, so each shaft runs outward.
            const innerPx = altWidthPx / 2 + ROUTE_ALT_GAP_PX * s;
            arrow(row(0), innerPx, halfPx);
            arrow(row(0), -innerPx, -halfPx);
            styles.push(new Style({
                geometry: new Point(at(row(0), 0)),
                text: new Text({
                    text: 'ALT',
                    font: fontStyle,
                    // A text amplifier, so it stays in the label colour even when
                    // the route's line work has gone red for a hostile identity.
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: s,
                    stroke: getHaloStroke(),
                }),
            }));
        }
    }

    // Identifier clears the top arrow row; with no arrows it falls back to the
    // plain 8 px every other line graphic uses.
    const labelOffsetPx = rows > 0
        ? row(rows - 1) + headHalfPx + 11 * s
        : 8;
    // Each endpoint is judged on its own segment — a route can start left-to-right
    // and have its last leg turn back, so one shared flag would flip the wrong one.
    const goesRight = b[0] >= a[0];
    const endAlign: CanvasTextAlign = atStart
        ? (goesRight ? 'left' : 'right')
        : (goesRight ? 'right' : 'left');
    styles.push(new Style({
        // Through `at`, so the identifier rides the same inward shift as the
        // figure it caps and the two stay registered with each other.
        geometry: new Point(at(labelOffsetPx, 0)),
        text: new Text({
            text: label,
            font: fontStyle,
            fill: new Fill({color: getLabelFillColor()}),
            rotation,
            // Centre the identifier over the arrow figure it caps; with no arrows
            // there is nothing to centre on, so run it inward off the endpoint.
            textAlign: rows > 0 ? 'center' : endAlign,
            textBaseline: 'bottom',
            scale: labelScale,
            stroke: getHaloStroke(),
        }),
    }));

    return styles;
}

export function routeControlMeasureStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => routeControlMeasureStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function routeControlMeasureStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const label = getFullLabel(name, labels.label ?? '');
    const direction = labels.direction ?? RouteDirection.GENERAL;
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();
        if (!coords || coords.length < 2) return [];

        const hostility = readHostility(f);
        const color = getColorByHostility(hostility);
        const labelScale = featureLabelScale(f, resolution);

        const start = coords[0];
        const afterStart = coords[1];
        const end = coords[coords.length - 1];
        const beforeEnd = coords[coords.length - 2];

        const styles: Style[] = [
            ...routeEndStyles(resolution, label, direction, true, start, start, afterStart, labelScale),
            ...routeEndStyles(resolution, label, direction, false, end, beforeEnd, end, labelScale),
        ];

        // The route line is the only line work here, so it is the only thing that
        // carries the hostility colour and the only thing that goes dashed when
        // planned or suspected. The amplifier block above it stays black.
        styles.push(new Style({
            geometry: geom,
            stroke: new Stroke({color, width: LINE_WIDTH(), lineDash: dashStyle(labels)}),
        }));

        return styles;
    };
}

function getDefaultLineStyles(f: FeatureLike, resolution: number, identifierLabel: string, startDateLabel: string, endDateLabel: string) {
    const geom = f.getGeometry() as MultiPoint;
    const coords = geom.getCoordinates();

    const hostility = readHostility(f);
    const styles: Style[] = [];

    const start = coords[0];
    const afterStart = coords[1];

    const end = coords[coords.length - 1];
    const beforeEnd = coords[coords.length - 2];

    let startLabelCoordinate = offsetAbove(start, start, afterStart, resolution, 8);
    let startDateLabelCoordinate = offsetBelow(start, start, afterStart, resolution, 8);
    let endLabelCoordinate = offsetAbove(end, beforeEnd, end, resolution, 8);
    let endDateLabelCoordinate = offsetBelow(end, beforeEnd, end, resolution, 8);

    let startRotation = getRotation(start, afterStart);
    let endRotation = getRotation(end, beforeEnd);

    // After "keep upright" normalization, rotation is always ~0 for horizontal lines,
    // so textAlign refers to screen-left/right regardless of drawing direction.
    // Each endpoint is evaluated independently — the first and last segments can go
    // different directions (e.g. L-to-R overall but last segment turns back R-to-L).
    const startGoesRight = afterStart[0] >= start[0];
    const endGoesRight   = end[0] >= beforeEnd[0];
    const startAlign: CanvasTextAlign = startGoesRight ? 'left' : 'right';
    const endAlign: CanvasTextAlign   = endGoesRight   ? 'right' : 'left';
    const startScale = featureLabelScale(f, resolution);
    const endScale = featureLabelScale(f, resolution);

    styles.push(new Style(
        {
            geometry: new Point(startLabelCoordinate), // dummy point
            text: new Text({
                text: identifierLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: startRotation,
                textAlign: startAlign,
                textBaseline: 'bottom',
                scale: startScale,
                stroke: getHaloStroke(),
            }),
        },
    ));
    styles.push(new Style(
        {
            geometry: new Point(endLabelCoordinate),
            text: new Text({
                text: identifierLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: endRotation,
                textAlign: endAlign,
                textBaseline: 'bottom',
                scale: endScale,
                stroke: getHaloStroke(),
            }),
        },
    ));

    let dateLabel = (!isEmpty(startDateLabel) && !isEmpty(endDateLabel) ? `${startDateLabel} - ${endDateLabel}` : '');
    styles.push(new Style(
        {
            geometry: new Point(startDateLabelCoordinate), // dummy point
            text: new Text({
                text: dateLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: startRotation,
                textAlign: startAlign,
                textBaseline: 'top',
                scale: startScale,
                stroke: getHaloStroke(),
            }),
        },
    ));
    styles.push(new Style(
        {
            geometry: new Point(endDateLabelCoordinate),
            text: new Text({
                text: dateLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: endRotation,
                textAlign: endAlign,
                textBaseline: 'top',
                scale: endScale,
                stroke: getHaloStroke(),
            }),
        },
    ));
    const outlineStyle = new Style({
        geometry: geom,
        stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
    });
    styles.push(outlineStyle);

    return styles;
}

export function defaultLineStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => defaultLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function defaultLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    let identifierLabel = getFullLabel(name, labels.label);
    let startDate = labels.startDate || '';
    let endDate = labels.endDate || '';

    return (f, resolution) => {
        const styles = getDefaultLineStyles(f, resolution, identifierLabel, startDate, endDate);
        if (labels.status && labels.status === TacticalGraphicStatus.planned) {
            // Override the line stroke to always be dashed
            styles.forEach(s => {
                const stroke = s.getStroke?.();
                if (stroke) stroke.setLineDash([12, 8]);
            });
        }
        return styles;
    };
}

/**
 * Linear target shape used by LinearTarget, LinearSmokeTarget, and
 * FinalProtectiveFire: a stretchable horizontal line with two perpendicular
 * end-caps (an "H" lying on its side). The name label sits above the center;
 * `belowLines` are stacked vertically below the center with single-line
 * spacing (LinearSmokeTarget passes ['SMOKE']; FPF passes ['FPF', secondId,
 * weapon]).
 *
 * Drawn from a 2-point base line; the two ends carry the perpendicular caps
 * and the user stretches the middle by dragging an endpoint.
 */
function buildLinearTargetStyles(
    f: FeatureLike,
    resolution: number,
    nameLabel: string,
    belowLines: string[],
    labels: GraphicLabels,
): Style[] {
    const geom = f.getGeometry() as LineString;
    if (!geom) return [];
    const coords = geom.getCoordinates();
    if (!coords || coords.length < 2) return [];

    const start = coords[0];
    const end = coords[coords.length - 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return [];

    const ux = dx / len;
    const uy = dy / len;
    // CCW perpendicular unit vector
    const px = -uy;
    const py = ux;

    const drawRes = (f.get('drawingResolution') as number | undefined) ?? resolution;
    const BAR_HALF_PX = 14;
    const barHalfMap = BAR_HALF_PX * drawRes;

    const startTop:    Coordinate = [start[0] + px * barHalfMap, start[1] + py * barHalfMap];
    const startBottom: Coordinate = [start[0] - px * barHalfMap, start[1] - py * barHalfMap];
    const endTop:      Coordinate = [end[0]   + px * barHalfMap, end[1]   + py * barHalfMap];
    const endBottom:   Coordinate = [end[0]   - px * barHalfMap, end[1]   - py * barHalfMap];

    const center: Coordinate = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

    const hostility = readHostility(f);
    const color = getColorByHostility(hostility);

    const styles: Style[] = [];

    styles.push(new Style({
        geometry: new MultiLineString([
            [start, end],
            [startTop, startBottom],
            [endTop, endBottom],
        ]),
        stroke: new Stroke({
            color,
            width: LINE_WIDTH(),
            lineDash: dashStyle(labels),
        }),
    }));

    const rotation = getRotation(start, end);
    const labelScale = featureLabelScale(f, resolution);
    const LABEL_GAP_PX = 8;
    // textBaseline:'bottom' (used by the name label above) reserves descender
    // space below the baseline, so a name with no descenders floats farther
    // from the line than the anchor would suggest. The labels below use
    // textBaseline:'top' which sits right at the anchor with no equivalent
    // reserved space, so push the first below-line down by the same amount
    // to match the visual gap above the line. Scales with text scale.
    const DESCENDER_COMPENSATE_PX = 4;
    // Vertical spacing between stacked below-line labels (FPF / secondId /
    // weapon for FinalProtectiveFire). Drop this for tighter stacking, raise
    // it for more breathing room. Scales with text scale at render time.
    const LINE_HEIGHT_PX = 20;

    if (nameLabel) {
        const labelAnchor = offsetAbove(center, start, end, resolution, LABEL_GAP_PX);
        styles.push(new Style({
            geometry: new Point(labelAnchor),
            text: new Text({
                text: nameLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign: 'center',
                textBaseline: 'bottom',
                scale: labelScale,
                stroke: getHaloStroke(),
            }),
        }));
    }

    for (let i = 0; i < belowLines.length; i++) {
        const text = belowLines[i];
        if (!text) continue;
        const offsetPx =
            LABEL_GAP_PX +
            DESCENDER_COMPENSATE_PX * labelScale +
            i * LINE_HEIGHT_PX * labelScale;
        const anchor = offsetBelow(center, start, end, resolution, offsetPx);
        styles.push(new Style({
            geometry: new Point(anchor),
            text: new Text({
                text,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign: 'center',
                textBaseline: 'top',
                scale: labelScale,
                stroke: getHaloStroke(),
            }),
        }));
    }

    return styles;
}

export function linearTargetStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => linearTargetStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function linearTargetStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const nameLabel = getFullLabel(name, labels.label ?? '');
        return buildLinearTargetStyles(f, resolution, nameLabel, [], labels);
    };
}

export function linearSmokeTargetStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => linearSmokeTargetStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function linearSmokeTargetStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const nameLabel = getFullLabel(name, labels.label ?? '');
        return buildLinearTargetStyles(f, resolution, nameLabel, ['SMOKE'], labels);
    };
}

export function finalProtectiveFireStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => finalProtectiveFireStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function finalProtectiveFireStyleFromLabels(_name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const nameLabel = labels.label ?? '';
        const secondId = labels.secondId ?? '';
        const weapon = labels.weapon ?? '';
        const belowLines = ['FPF', secondId, weapon].filter(s => s.length > 0);
        return buildLinearTargetStyles(f, resolution, nameLabel, belowLines, labels);
    };
}

/** ProbableLineOfDeployment is always dashed (present and anticipated). */
export function probableLineOfDeploymentStyleFunc(): StyleFunction {
    return (f, resolution) => probableLineOfDeploymentStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function probableLineOfDeploymentStyleFromLabels(labels: GraphicLabels): StyleFunction {
    const identifierLabel = getFullLabel(TacticalGraphicName.ProbableLineOfDeployment, labels.label);
    return (f, resolution) => {
        const styles = getDefaultLineStyles(f, resolution, identifierLabel, '', '');
        // Override the line stroke to always be dashed
        styles.forEach(s => {
            const stroke = s.getStroke?.();
            if (stroke) stroke.setLineDash([12, 8]);
        });
        return styles;
    };
}

/** Line of Contact: two mirrored half-circle waves — red on top, black on bottom. */
export function lineOfContactStyleFunc(): StyleFunction {
    return (f, resolution) => lineOfContactStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function lineOfContactStyleFromLabels(labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as LineString;
        const coords = geom?.getCoordinates() ?? [];
        if (coords.length < 2) return [];

        // Both waves and — the point of this symbol — the gap between them are screen
        // sized. Baked into the geometry the offset was fixed in metres, so the distance
        // between the enemy-side and friendly-side lines grew as the map zoomed in and
        // closed up as it zoomed out.
        //
        // One scale drives all three, so the symbol keeps its proportions and simply
        // gets smaller. This was exempt from `decorationScale` until 2026-08-04, on the
        // grounds that the separation is what the graphic says and so must hold at every
        // zoom. What that produced was a 117 px line still wearing 8 px waves 16 px
        // apart — two separate squiggles rather than one symbol. The separation is not
        // lost by scaling: held in ratio to the waves it stays legible, which is what
        // makes the pair read as a line of contact. The failure the exemption was
        // guarding against — an offset fixed in *metres*, growing as you zoom in — is a
        // different one, and is not what a shared cap does.
        const scale = decorationScale(coords, false, resolution, WAVE_AMPLITUDE_PX);
        const wavelengthMap = WAVE_WAVELENGTH_PX * scale * resolution;
        const amplitudeMap = WAVE_AMPLITUDE_PX * scale * resolution;

        // The separation alone does not scale to nothing. Below `DECORATION_MIN_PX` the
        // waves are dropped, and a shared scale of 0 would put the enemy-side and
        // friendly-side lines on top of each other — one red line, and no symbol left.
        // Held at the scale the waves were dropped at, the pair still stands apart:
        // two plain lines in contact, which is the graphic with its detail removed
        // rather than the graphic gone. This is the one place the old exemption's
        // reasoning still holds.
        const offsetScale = Math.max(scale, DECORATION_MIN_PX / WAVE_AMPLITUDE_PX);
        const offsetMap = LINE_OF_CONTACT_OFFSET_PX * offsetScale * resolution;

        // Which side is which is a property of the map, not of the drawing gesture: the
        // enemy-side wave takes the upper side of the line however it was drawn.
        const {dir} = pathPointAt(coords, pathLength(coords) / 2);
        const enemySign = upSign(dir);

        const start = coords[0];
        const end = coords[coords.length - 1];
        const labelScale = featureLabelScale(f, resolution);
        const startRotation = getRotation(start, end);
        const endRotation = getRotation(end, start);
        // getRotation flips rotation 180° to keep text upright, so a line drawn right→left
        // needs its anchors swapped to keep the labels outside the graphic.
        const reversed = end[0] < start[0];
        const labelPadPx = 10;

        return [
            // Enemy-side wave. Routed through the palette rather than a literal 'red' so
            // it tracks its friendly-side partner; the graphic draws both identities at
            // once, so the pair has to stay balanced.
            new Style({
                geometry: new LineString(wavePath(coords, wavelengthMap, amplitudeMap, enemySign, offsetMap)),
                stroke: new Stroke({color: getColorByHostility(TacticalGraphicHostility.hostileFaker), width: LINE_WIDTH()}),
            }),
            // Friendly-side wave
            new Style({
                geometry: new LineString(wavePath(coords, wavelengthMap, amplitudeMap, -enemySign, offsetMap)),
                stroke: new Stroke({color: getDefaultLineColor(), width: LINE_WIDTH()}),
            }),
            new Style({
                geometry: new Point(start),
                text: new Text({
                    text: 'LC',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: startRotation,
                    textAlign: reversed ? 'left' : 'right',
                    textBaseline: 'middle',
                    scale: labelScale,
                    offsetX: (reversed ? 1 : -1) * labelPadPx,
                    stroke: getHaloStroke(),
                }),
            }),
            new Style({
                geometry: new Point(end),
                text: new Text({
                    text: 'LC',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: endRotation,
                    textAlign: reversed ? 'right' : 'left',
                    textBaseline: 'middle',
                    scale: labelScale,
                    offsetX: (reversed ? -1 : 1) * labelPadPx,
                    stroke: getHaloStroke(),
                }),
            }),
        ];
    };
}

export function retroGradeTaskStyleFunc(label: string): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates();

        let baseLine = coords[0];

        const styles: Style[] = [];
        const hostility = readHostility(f);

        const outlineSegments: Coordinate[][] = [];

        let midSegmentIndex = 0;

        for (let i = 0; i < coords.length; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push(coords[i]);
            }
        }

        // Interpolate along that segment
        const t1 = .5;
        const p1 = baseLine[0];
        const p2 = baseLine[1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // 4) carve a central gap sized to fit the label at current scale
        const labelFont = 'bold 24px sans-serif';
        const labelScale = featureLabelScale(f, resolution);
        const labelWidthPx = getTextWidth(label, labelFont, labelScale);
        const GAP_PADDING_PX = 4;
        const halfGapPx = labelWidthPx / 2 + GAP_PADDING_PX;
        const gapMap = halfGapPx * resolution;
        const gapRatio = gapMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        // 6) build styles for the echelon in the middle. The label lies along the
        // segment whose gap holds it — `getRotation` flips it through 180° when
        // that segment points left, so it never renders upside down.
        const textStyle = new Style({
            geometry: new Point(midGap),
            text: new Text({
                text: label,
                font: labelFont,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: getRotation(p1, p2),
                textAlign: 'center',
                textBaseline: 'middle',
                scale: labelScale,
                stroke: getHaloStroke(),
            }),
        });
        styles.push(textStyle);

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
        });
        // Base layers
        styles.push(outlineStyle);

        return styles;
    };
}

/**
 * Exfiltrate — the whole drawn route with a gap in the middle of its FIRST segment
 * for the "EX" label, plus the arrowhead on the far end.
 *
 * Geometry from `Exfiltrate.generateGraphics`: `[0]` is the route, `[1]` the
 * arrowhead. Only the first segment is split; everything past the first bend
 * renders as one continuous piece.
 *
 * Not `retroGradeTaskStyleFunc`, which this graphic used to share. That one
 * discards sub-line 0 and rebuilds it from `baseLine[0]`/`baseLine[1]` alone, so
 * a multi-vertex route would lose every segment after the first — fine for the
 * cane arrows, which are fixed at two points, wrong here.
 */
export function exfiltrateStyleFunc(label: string): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry();
        if (!(geom instanceof MultiLineString)) return [];
        const lines = geom.getCoordinates();
        const route = lines[0];
        if (!route || route.length < 2) return [];

        const hostility = readHostility(f);
        // Everything after the route renders untouched — that is the arrowhead.
        const outlineSegments: Coordinate[][] = lines.slice(1);

        const p1 = route[0];
        const p2 = route[1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // Gap sized to the rendered glyph plus 4px padding a side. getTextWidth
        // returns screen pixels, so × resolution once to reach map units.
        const labelFont = 'bold 24px sans-serif';
        const labelScale = featureLabelScale(f, resolution);
        const halfGapPx = getTextWidth(label, labelFont, labelScale) / 2 + 4;
        const gapRatio = segLen > 0 ? (halfGapPx * resolution) / segLen : 0;

        const midGap: Coordinate = [p1[0] + dx * 0.5, p1[1] + dy * 0.5];
        if (gapRatio > 0 && gapRatio < 0.5) {
            const at = (t: number): Coordinate => [p1[0] + dx * t, p1[1] + dy * t];
            outlineSegments.push([p1, at(0.5 - gapRatio)]);
            // The far side of the gap runs on through every remaining vertex, so a
            // bent route stays connected.
            outlineSegments.push([at(0.5 + gapRatio), ...route.slice(1)]);
        } else {
            // Label is wider than the segment holding it — render the route
            // unbroken rather than opening a gap that swallows the segment.
            outlineSegments.push(route);
        }

        return [
            new Style({
                geometry: new Point(midGap),
                text: new Text({
                    // Lies along the first segment, the one the gap is cut from.
                    // `getRotation` adds 180° for a right-to-left segment, so the
                    // "EX" reads the right way up whichever way the route was drawn.
                    text: label,
                    font: labelFont,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: getRotation(p1, p2),
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: labelScale,
                    stroke: getHaloStroke(),
                }),
            }),
            new Style({
                geometry: new MultiLineString(outlineSegments),
                stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
            }),
        ];
    };
}

// ReliefInPlace: top line + curve + bottom line + arrowhead, with the "RIP"
// label carved into a gap on the top line near the non-arrow end.
export function reliefInPlaceStyleFunc(label: string): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        if (!geom) return [];
        const coords = geom.getCoordinates();
        if (coords.length < 4) return [];

        const topLine = coords[0];
        const curve = coords[1];
        const bottomLine = coords[2];
        const bottomArrow = coords[3];
        const topArrow = coords[4];

        const hostility = readHostility(f);
        const stroke = new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()});

        const p1 = topLine[0];
        const p2 = topLine[1];
        const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) return [];

        const labelFont = 'bold 24px sans-serif';
        const labelScale = featureLabelScale(f, resolution);
        const textWidthPx = getTextWidth(label, labelFont, labelScale);
        const halfGapPx = textWidthPx / 2 + 4;
        const gapRatio = (halfGapPx * resolution) / segLen;
        const t = 0.2; // gap center at 20% along the top line (near p0)

        const gapA: Coordinate = [p1[0] + dx * (t - gapRatio), p1[1] + dy * (t - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t + gapRatio), p1[1] + dy * (t + gapRatio)];
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        let rotation = -Math.atan2(dy, dx);
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;

        return [
            new Style({geometry: new LineString([p1, gapA]), stroke}),
            new Style({geometry: new LineString([gapB, p2]), stroke}),
            new Style({geometry: new LineString(curve as Coordinate[]), stroke}),
            new Style({geometry: new LineString(bottomLine as Coordinate[]), stroke}),
            new Style({geometry: new LineString(bottomArrow as Coordinate[]), stroke}),
            ...(topArrow ? [new Style({geometry: new LineString(topArrow as Coordinate[]), stroke})] : []),
            new Style({
                geometry: new Point(midGap),
                text: new Text({
                    text: label,
                    font: labelFont,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: labelScale,
                    stroke: getHaloStroke(),
                }),
            }),
        ];
    };
}

export function breachStyleFunc(label: string): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates();

        let verticalLine = coords[coords.length - 1];

        const styles: Style[] = [];
        const hostility = readHostility(f);

        const outlineSegments: Coordinate[][] = [];

        let midSegmentIndex = coords.length - 1;

        for (let i = 0; i < coords.length; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push(coords[i]);
            }
        }

        // Interpolate along that segment
        const t1 = .5;
        const p1 = verticalLine[0];
        const p2 = verticalLine[1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // 4) carve a central gap in that opening side
        const GAP_PX = 10; // px gap on each side of the dot
        const gapMap = GAP_PX * resolution; // map-unit gap
        const gapRatio = gapMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        // 6) build styles for the echelon in the middle
        const textStyle = new Style({
            geometry: new Point(midGap),
            text: new Text({
                text: label,
                font: 'bold 24px sans-serif',
                fill: new Fill({color: getLabelFillColor()}),
                rotation: 0,
                textAlign: 'center',
                textBaseline: 'middle',
                scale: featureGraphicLabelScale(f, resolution),
                stroke: getHaloStroke(),
            }),
        });
        styles.push(textStyle);

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
        });
        // Base layers
        styles.push(outlineStyle);

        return styles;
    };
}

export function blockStyleFunc(label: string): StyleFunction {
    return (f: FeatureLike, resolution: number) => {
        const geom = f.getGeometry();
        let coords;
        if (!geom) return;

        if (geom instanceof LineString) coords = geom.getCoordinates();
        else if (geom instanceof MultiLineString) coords = geom.getCoordinates()[0];
        else return;

        const styles: Style[] = [];
        const hostility = readHostility(f);

        const outlineSegments: Coordinate[][] = [];
        if (geom instanceof MultiLineString) {
            outlineSegments.push(...geom.getCoordinates().slice(1, geom.getCoordinates().length));
        }

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Compute the total baseline vector (start → end)
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        // Project each vertex onto that baseline to get cumulative "linear" distance
        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen; // scalar projection
        });

        // 4️⃣ Normalize to 0 → baseLen range
        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const normalizedProjections = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        // Find segment that crosses the projected midpoint (0.5)
        const half = 0.5;
        let midSegmentIndex = 0;
        for (let i = 0; i < normalizedProjections.length - 1; i++) {
            if (normalizedProjections[i] <= half && normalizedProjections[i + 1] >= half) {
                midSegmentIndex = i;
                break;
            }
        }

        for (let i = 0; i < coords.length - 1; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push([coords[i], coords[i + 1]]);
            }
        }

        // Interpolate along that segment
        const t1 =
            (half - normalizedProjections[midSegmentIndex]) /
            (normalizedProjections[midSegmentIndex + 1] - normalizedProjections[midSegmentIndex]);

        const p1 = coords[midSegmentIndex];
        const p2 = coords[midSegmentIndex + 1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        if (!label) {
            // The table 5-19 obstacle effect carries no letter, so there is no
            // hole to leave for one. The gap below is not label-width alone —
            // it adds 4px of padding a side — so an empty label would still
            // break the shaft around nothing. Push the segment unbroken.
            outlineSegments.push([p1, p2]);
        } else {
            // Gap: sized to fit the actually rendered label glyph plus 4px
            // padding per side. getTextWidth returns screen pixels at the
            // current OL text scale, so we convert to map units with
            // `* resolution` — this keeps the gap tight around the label
            // regardless of zoom or of how wide the graphic's front line is.
            // Measure with the same 24px font that the text style renders.
            const labelScale = featureGraphicLabelScale(f, resolution);
            const labelWidthPx = getTextWidth(label, 'bold 24px sans-serif', labelScale);
            const gapMap = (labelWidthPx / 2 + 4) * resolution;
            const gapRatio = gapMap / segLen;

            const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
            const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];
            let rotation = -Math.atan2(dy, dx);

            // Keep text upright
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
                rotation += Math.PI;
            }
            // Normalize to [-π, π)
            if (rotation > Math.PI) rotation -= 2 * Math.PI;

            // keep the two side pieces of that segment
            outlineSegments.push([p1, gapA], [gapB, p2]);

            // 5) compute the center of the gap for the dot
            const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

            // 6) build styles for the label in the middle.
            // Use the same 24px base font as breachStyleFunc/clearStyleFunc so the
            // ratio-locked block-family graphics render with matching label sizes.
            const textStyle = new Style({
                geometry: new Point(midGap),
                text: new Text({
                    text: label,
                    font: 'bold 24px sans-serif',
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: labelScale,
                }),
            });
            styles.push(textStyle);
        }

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
        });
        // Base layers
        styles.push(outlineStyle);

        return styles;
    };
}

/**
 * The whole geometry in one hostility-coloured stroke, no label. Both
 * fire-position symbols are shape-only in FM 1-02.2 table 6-1 — the bracket and
 * the arrows *are* the symbol, there is no letter to render — and every sub-line
 * they emit is part of the same pen line, so a single Style keeps the bar, the
 * feathers and the arrowheads in lock-step at any weight.
 */
function firePositionStyles(f: FeatureLike): Style[] {
    const geom = f.getGeometry();
    if (!(geom instanceof MultiLineString)) return [];
    const hostility = readHostility(f);
    return [new Style({
        geometry: geom,
        stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
    })];
}

/**
 * AttackByFire — the position bracket at the start plus one shaft out of the
 * bar's midpoint ending in an arrowhead. Geometry comes from
 * `getAttackByFireSymbol` as a MultiLineString:
 *   [0] bracket (feather → bar → feather), [1] shaft, [2] arrowhead.
 */
export function attackByFireStyleFunc(): StyleFunction {
    return f => firePositionStyles(f);
}

/**
 * SupportByFire — the same position bracket, with two arrows diverging off the
 * bar's ends instead of one shaft from its middle. Geometry comes from
 * `getSupportByFireSymbol` as a MultiLineString:
 *   [0] bracket, [1] upper arrow, [2] upper head, [3] lower arrow, [4] lower head.
 *
 * Kept as its own exported function rather than reusing `attackByFireStyleFunc`
 * so the two can diverge — a hostility or status rule that applies to one of
 * them should not silently reach the other.
 */
export function supportByFireStyleFunc(): StyleFunction {
    return f => firePositionStyles(f);
}

export function coordinatedFireLineStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => coordinatedFireLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function coordinatedFireLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const topLabel = getFullLabel(name, labels.label ?? '');
    const bottomLabel = getDateLabel(labels);
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();

        const styles: Style[] = [];

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Compute the total baseline vector (start → end)
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        // Project each vertex onto that baseline to get cumulative "linear" distance
        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen; // scalar projection
        });

        // 4️⃣ Normalize to 0 → baseLen range
        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const normalizedProjections = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        // Find segment that crosses the projected midpoint (0.5)
        const half = 0.5;
        let midSegmentIndex = 0;
        for (let i = 0; i < normalizedProjections.length - 1; i++) {
            if (normalizedProjections[i] <= half && normalizedProjections[i + 1] >= half) {
                midSegmentIndex = i;
                break;
            }
        }

        // Interpolate along that segment
        const t1 =
            (half - normalizedProjections[midSegmentIndex]) /
            (normalizedProjections[midSegmentIndex + 1] - normalizedProjections[midSegmentIndex]);

        const p1 = coords[midSegmentIndex];
        const p2 = coords[midSegmentIndex + 1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // 4) carve a gap: infiltration formula — half label width + 8px padding
        const cflScale = featureLabelScale(f, resolution);
        const cflGapMap = segLen * 0.35 + 8 * resolution;
        const gapRatio = cflGapMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }
        // Normalize to [-π, π)
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        // 8px perpendicular offset from line to nearest text edge
        const offsetMap = 8 * resolution;
        // Perpendicular unit vector — normalized to always point "above" (north),
        // so labels are correct regardless of drawing direction.
        const len = Math.hypot(dx, dy);
        let nx = -dy / len;
        let ny = dx / len;
        if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
        let topLabelCoordinate = [midGap[0] + nx * offsetMap, midGap[1] + ny * offsetMap];
        let bottomLabelCoordinate = [midGap[0] - nx * offsetMap, midGap[1] - ny * offsetMap];

        styles.push(new Style(
            {
                geometry: new Point(topLabelCoordinate), // dummy point
                text: new Text({
                    text: topLabel,
                    font: fontStyle,
                    //font: 'bold 20px sans-serif',
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'bottom',
                    scale: cflScale,
                    stroke: getHaloStroke(),
                }),
            },
        ));
        styles.push(new Style(
            {
                geometry: new Point(bottomLabelCoordinate), // dummy point
                text: new Text({
                    text: bottomLabel,
                    font: fontStyle,
                    //font: 'bold 20px sans-serif',
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'top',
                    scale: cflScale,
                    stroke: getHaloStroke(),
                }),
            },
        ));

        const hostility = readHostility(f);
        const outlineStyle = new Style({
            geometry: geom,
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
        });
        styles.push(outlineStyle);
        if (labels.status && labels.status === TacticalGraphicStatus.planned) {
            // Override the line stroke to always be dashed
            styles.forEach(s => {
                const stroke = s.getStroke?.();
                if (stroke) stroke.setLineDash([12, 8]);
            });
        }

        return styles;
    };
}

export function engineerWorkLineStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => engineerWorkLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function engineerWorkLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const mainLabelText = getLabel(name);          // "EWL"
    const midTopText   = (!isEmpty(labels.label) ? labels.label : '') + (!isEmpty(labels.countryCode) ? ' ' + labels.countryCode : '');       // name / field T (optional)
    const midBotText   = (!isEmpty(labels.secondId) ? labels.secondId : '') + (!isEmpty(labels.secondCountryCode) ? ' ' + labels.secondCountryCode : ''); // country code / field AS (optional)

    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();
        if (coords.length < 2) return [];

        const styles: Style[] = [];
        const scale = featureLabelScale(f, resolution);

        // ── End labels ("EWL" on the line above each endpoint) ────────────
        const start     = coords[0];
        const startNext = coords[1];
        const end       = coords[coords.length - 1];
        const endPrev   = coords[coords.length - 2];

        const rotStart = getRotation(start, startNext);
        const rotEnd   = getRotation(endPrev, end);

        const startGoesRight = startNext[0] >= start[0];
        const endGoesRight   = end[0]       >= endPrev[0];

        styles.push(new Style({
            geometry: new Point(offsetAbove(start, start, startNext, resolution, 8)),
            text: new Text({
                text: mainLabelText,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: rotStart,
                textAlign: startGoesRight ? 'left' : 'right',
                textBaseline: 'bottom',
                scale,
                stroke: getHaloStroke(),
            }),
        }));

        styles.push(new Style({
            geometry: new Point(offsetAbove(end, endPrev, end, resolution, 8)),
            text: new Text({
                text: mainLabelText,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: rotEnd,
                textAlign: endGoesRight ? 'right' : 'left',
                textBaseline: 'bottom',
                scale,
                stroke: getHaloStroke(),
            }),
        }));

        // ── Midpoint: find the projected centre of the line ────────────────
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen;
        });

        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const norm = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        let midIdx = 0;
        for (let i = 0; i < norm.length - 1; i++) {
            if (norm[i] <= 0.5 && norm[i + 1] >= 0.5) { midIdx = i; break; }
        }

        const p1 = coords[midIdx];
        const p2 = coords[midIdx + 1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);
        const t1 = (0.5 - norm[midIdx]) / (norm[midIdx + 1] - norm[midIdx]);
        const midPt: Coordinate = [p1[0] + dx * t1, p1[1] + dy * t1];

        let rotation = -Math.atan2(dy, dx);
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // Perpendicular unit vector always pointing "above" (north-ward)
        let nx = -dy / segLen;
        let ny =  dx / segLen;
        if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }

        const offsetMap = 8 * resolution;

        // ── Middle-top: name (field T) ─────────────────────────────────────
        if (midTopText) {
            styles.push(new Style({
                geometry: new Point([midPt[0] + nx * offsetMap, midPt[1] + ny * offsetMap]),
                text: new Text({
                    text: midTopText,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'bottom',
                    scale,
                    stroke: getHaloStroke(),
                }),
            }));
        }

        // ── Middle-bottom: country code / identifier2 (field AS) ──────────
        if (midBotText) {
            styles.push(new Style({
                geometry: new Point([midPt[0] - nx * offsetMap, midPt[1] - ny * offsetMap]),
                text: new Text({
                    text: midBotText,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'top',
                    scale,
                    stroke: getHaloStroke(),
                }),
            }));
        }

        // ── Line ──────────────────────────────────────────────────────────
        const hostility = readHostility(f);
        styles.push(new Style({
            geometry: geom,
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
        }));
        if (labels.status && labels.status === TacticalGraphicStatus.planned) {
            // Override the line stroke to always be dashed
            styles.forEach(s => {
                const stroke = s.getStroke?.();
                if (stroke) stroke.setLineDash([12, 8]);
            });
        }
        return styles;
    };
}

/**
 * ## Obstacle crenellation
 *
 * Teeth are a feature of the symbol, not a measurement: their size says nothing about
 * the ground, so it should not change with zoom. They are drawn here at a constant
 * number of screen pixels, the way `StrongPoint`'s cross-ties always have been.
 *
 * They used to be baked into the geometry by the generator, sized from the drawing
 * resolution — 15 px at whatever zoom the graphic happened to be drawn at, then fixed in
 * metres, so they grew on screen as the map zoomed in and shrank to nothing zoomed out.
 * That also made the obstacle line's label clearance a measuring exercise: with teeth of
 * unknown map-unit height, the label had to scan the rendered geometry to find out how
 * far to stand off. A constant in pixels needs no measuring.
 *
 * The one place a constant is wrong is a symbol smaller than its own decoration — a
 * 15 px sample in the gallery cannot carry a 10 px tooth. So the height is capped at a
 * share of the shape's own on-screen extent, and the base and gap scale with it, keeping
 * the teeth in proportion as they shrink.
 */
const OBSTACLE_TOOTH_HEIGHT_PX = 10;
const OBSTACLE_TOOTH_BASE_PX = 10;
const OBSTACLE_TOOTH_GAP_PX = 10;

/**
 * The fortified line and area wear square merlons; the forward line of own troops and
 * each half of the line of contact wear a scalloped wave. Both were baked into geometry
 * at the drawing resolution until 2026-08-03, for the same reason and with the same
 * result as the obstacle teeth. `LINE_OF_CONTACT_OFFSET_PX` is what holds the enemy-side
 * and friendly-side waves apart — in pixels, so the pair keeps its spacing at any zoom.
 */
const FORTIFIED_MERLON_PX = 15;
const FORTIFIED_CRENEL_PX = 15;
const FORTIFIED_HEIGHT_PX = 11;
const WAVE_WAVELENGTH_PX = 15;
const WAVE_AMPLITUDE_PX = 8;
const LINE_OF_CONTACT_OFFSET_PX = 16;

/**
 * How much to shrink a decoration so it still fits the symbol it decorates, 0–1.
 * Zero means "draw the plain line or ring" — every decoration builder here returns
 * its input path unchanged when the pattern comes out non-positive.
 *
 * A constant pixel size is right in the middle of the range and wrong at both ends.
 * Too small a shape cannot carry its own decoration — the sample gallery draws areas
 * 15 px across — and the same is true of a full-size graphic seen from far enough
 * out, which is the case this exists for. `available` is what the decoration has to
 * fit inside: the smaller side of a closed ring's extent, or the length of an open
 * path, because a horizontal line's extent has no height and the smaller side would
 * be zero.
 *
 * The rule is deliberately about the *shape*, not the zoom. A graphic 120 px across
 * needs the same treatment whether it got that way by being drawn small or by the
 * user zooming out, and a resolution threshold would only catch the second.
 */
function decorationScale(path: Coordinate[], closed: boolean, resolution: number, heightPx: number): number {
    let availablePx: number;
    if (closed) {
        const xs = path.map(p => p[0]);
        const ys = path.map(p => p[1]);
        availablePx = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / resolution;
    } else {
        availablePx = pathLength(path) / resolution;
    }
    const share = closed ? DECORATION_MAX_SHARE_CLOSED : DECORATION_MAX_SHARE_OPEN;
    const scale = Math.max(0, Math.min(1, (availablePx * share) / heightPx));

    // Below a few pixels a tooth, merlon or wave crest is not a symbol any more, it is
    // texture on the stroke — and a row of 2 px bumps reads as a fuzzy line rather than
    // as an obstacle. Drop it and let the plain geometry stand.
    return heightPx * scale < DECORATION_MIN_PX ? 0 : scale;
}

/**
 * The share of a shape's own on-screen size its decoration may occupy before it starts
 * shrinking.
 *
 * These came down from 0.25 and 0.12 on 2026-08-04, which were loose enough that the cap
 * effectively never engaged: at 0.12 an open path had to fall under 83 px before a 10 px
 * tooth was touched, so an obstacle line zoomed out to 117 px still carried six full-size
 * teeth and read as a zigzag rather than as a line.
 *
 * The open share is much the smaller of the two because it is measured against the
 * path's whole length while the decoration repeats along it — a tooth a twentieth of the
 * line long is already prominent. A closed ring is measured against its smaller side,
 * which the decoration spans only once.
 */
const DECORATION_MAX_SHARE_CLOSED = 0.1;
const DECORATION_MAX_SHARE_OPEN = 0.05;

/** Below this many screen pixels a decoration is dropped rather than drawn. */
const DECORATION_MIN_PX = 3;

/** The point at a distance along a polyline, with the unit direction there. */
function pathPointAt(path: Coordinate[], distance: number): {point: Coordinate, dir: Coordinate} {
    let remaining = Math.max(0, distance);
    for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length === 0) continue;
        const dir: Coordinate = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        if (remaining <= length) {
            return {point: [a[0] + dir[0] * remaining, a[1] + dir[1] * remaining], dir};
        }
        remaining -= length;
    }
    const a = path[path.length - 2];
    const b = path[path.length - 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return {point: b, dir: [(b[0] - a[0]) / length, (b[1] - a[1]) / length]};
}

/** The side of a segment that points up on screen, as a sign on the left-hand normal. */
function upSign(dir: Coordinate): number {
    return dir[0] >= 0 ? 1 : -1;
}

/**
 * Square merlons along a path — the fortified line and area.
 *
 * The tooth is a rectangle standing off the baseline, so the path runs along the
 * baseline for a crenel, up, across a merlon, down, and on. Emitted as one connected
 * path: the generator used to hand back interleaved gap and tooth sub-lines, which drew
 * identically but had to be reassembled by anything that wanted the outline.
 */
function castellatedPath(path: Coordinate[], merlonMap: number, crenelMap: number, heightMap: number, side: number | 'up'): Coordinate[] {
    const total = pathLength(path);
    const pattern = merlonMap + crenelMap;
    if (path.length < 2 || pattern <= 0 || total < pattern) return path;

    const count = Math.max(1, Math.round(total / pattern));
    const spacing = total / count;
    const merlon = spacing * (merlonMap / pattern);

    const out: Coordinate[] = [path[0]];
    for (let i = 0; i < count; i++) {
        const startAt = i * spacing + (spacing - merlon) / 2;
        const left = pathPointAt(path, startAt);
        const right = pathPointAt(path, startAt + merlon);
        const sign = side === 'up' ? upSign(left.dir) : side;
        const ln: Coordinate = [-left.dir[1] * sign, left.dir[0] * sign];
        const rn: Coordinate = [-right.dir[1] * sign, right.dir[0] * sign];
        out.push(
            left.point,
            [left.point[0] + ln[0] * heightMap, left.point[1] + ln[1] * heightMap],
            [right.point[0] + rn[0] * heightMap, right.point[1] + rn[1] * heightMap],
            right.point,
        );
    }
    out.push(path[path.length - 1]);
    return out;
}

/** Steps per bump. Enough that a semicircle reads as a curve rather than a tent. */
const WAVE_STEPS = 12;

/**
 * A scalloped path — the forward line of own troops, and each half of the line of
 * contact. `offsetMap` shifts the whole wave sideways off the drawn line, which is what
 * separates the line of contact's two identities.
 */
/**
 * Slides a path sideways by `offsetMap`, on the side `sideSign` selects.
 *
 * Per vertex, using the direction at that point along the path, so a bend keeps both
 * halves of the pair the same distance apart rather than pinching on the inside.
 */
function offsetPath(path: Coordinate[], sideSign: number, offsetMap: number): Coordinate[] {
    if (!offsetMap || path.length < 2) return path;
    const total = pathLength(path);
    if (total === 0) return path;

    let travelled = 0;
    return path.map((point, i) => {
        if (i > 0) travelled += Math.hypot(point[0] - path[i - 1][0], point[1] - path[i - 1][1]);
        const {dir} = pathPointAt(path, Math.min(travelled, total));
        return [point[0] - dir[1] * sideSign * offsetMap, point[1] + dir[0] * sideSign * offsetMap] as Coordinate;
    });
}

function wavePath(path: Coordinate[], wavelengthMap: number, amplitudeMap: number, sideSign: number, offsetMap = 0): Coordinate[] {
    const total = pathLength(path);
    // No wave to draw, but `offsetMap` is a displacement of the whole line and not part
    // of the wave — the line of contact is a *pair*, and returning the path undisplaced
    // put its two halves on top of each other the moment the waves were dropped. Offset
    // it and hand back a plain line.
    if (path.length < 2 || wavelengthMap <= 0 || total === 0) return offsetPath(path, sideSign, offsetMap);

    const count = Math.max(1, Math.round(total / wavelengthMap));
    const wavelength = total / count;
    const out: Coordinate[] = [];

    const shifted = (at: {point: Coordinate, dir: Coordinate}): Coordinate => {
        const n: Coordinate = [-at.dir[1] * sideSign, at.dir[0] * sideSign];
        return [at.point[0] + n[0] * offsetMap, at.point[1] + n[1] * offsetMap];
    };

    for (let i = 0; i < count; i++) {
        const from = pathPointAt(path, i * wavelength);
        const to = pathPointAt(path, (i + 1) * wavelength);
        const a = shifted(from);
        const b = shifted(to);
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const chord = Math.hypot(dx, dy) || 1;
        const nx = -(dy / chord) * sideSign;
        const ny = (dx / chord) * sideSign;

        for (let step = 0; step <= WAVE_STEPS; step++) {
            if (i > 0 && step === 0) continue; // the previous bump ended here
            const t = step / WAVE_STEPS;
            const bump = Math.sin(Math.PI * t) * amplitudeMap;
            out.push([a[0] + dx * t + nx * bump, a[1] + dy * t + ny * bump]);
        }
    }
    return out;
}

/** Winding, by the shoelace sum: `> 0` is clockwise in projected coordinates. */
function ringIsClockwise(ring: Coordinate[]): boolean {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
    }
    return sum > 0;
}

function pathLength(path: Coordinate[]): number {
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    }
    return total;
}

/**
 * Tooth dimensions in map units for one path, honouring the cap.
 *
 * `available` is what the teeth have to fit inside: the smaller side of a closed ring's
 * extent, or the length of an open one — a horizontal line's extent has no height, so
 * the smaller side would be zero and the teeth would vanish.
 */
function obstacleToothSize(path: Coordinate[], closed: boolean, resolution: number) {
    const scale = decorationScale(path, closed, resolution, OBSTACLE_TOOTH_HEIGHT_PX);
    return {
        heightMap: OBSTACLE_TOOTH_HEIGHT_PX * scale * resolution,
        baseMap: OBSTACLE_TOOTH_BASE_PX * scale * resolution,
        gapMap: OBSTACLE_TOOTH_GAP_PX * scale * resolution,
        heightPx: OBSTACLE_TOOTH_HEIGHT_PX * scale,
    };
}

/**
 * Walks a path and inserts teeth, apex on the side `sideSign` selects (+1 left of travel,
 * -1 right). A tooth is only placed where it fits wholly within one segment, so corners
 * get a slightly wider gap rather than a tooth bent around them; the pattern carries
 * across the vertex so the spacing stays even along the whole path.
 */
function crenellatedPath(path: Coordinate[], heightMap: number, baseMap: number, gapMap: number, side: number | 'up'): Coordinate[] {
    if (path.length < 2 || baseMap <= 0) return path;
    const out: Coordinate[] = [];
    const unit = baseMap + gapMap;
    let nextToothAt = gapMap / 2;

    for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        out.push(a);

        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = Math.hypot(dx, dy);
        if (length === 0) continue;

        const ux = dx / length;
        const uy = dy / length;
        // 'up' is decided per segment: a closed ring has an inside and an outside, but an
        // open line has neither, so the only stable choice is the one the map defines.
        // Picking a side of *travel* is what made the same line drawn right-to-left come
        // out with its teeth on the other side.
        const sideSign = side === 'up' ? (ux >= 0 ? 1 : -1) : side;
        const nx = -uy * sideSign;
        const ny = ux * sideSign;

        while (nextToothAt + baseMap <= length) {
            const p1: Coordinate = [a[0] + ux * nextToothAt, a[1] + uy * nextToothAt];
            const p2: Coordinate = [a[0] + ux * (nextToothAt + baseMap), a[1] + uy * (nextToothAt + baseMap)];
            out.push(
                p1,
                [(p1[0] + p2[0]) / 2 + nx * heightMap, (p1[1] + p2[1]) / 2 + ny * heightMap],
                p2,
            );
            nextToothAt += unit;
        }
        nextToothAt = Math.max(0, nextToothAt - length);
    }
    out.push(path[path.length - 1]);
    return out;
}

/**
 * The crenellated ring for an obstacle area.
 *
 * `outward` is a geometric intent, and the side of travel it lands on depends on the
 * ring's winding — which nothing normalises, since the ring comes back in the order the
 * user clicked the corners. Reconciling the two here is what keeps an area drawn
 * anticlockwise from turning its teeth inside out.
 */
function obstacleRing(ring: Coordinate[], resolution: number, outward: boolean): Coordinate[] {
    const {heightMap, baseMap, gapMap} = obstacleToothSize(ring, true, resolution);
    if (heightMap <= 0) return ring;
    const outwardIsLeft = ringIsClockwise(ring);
    const sideSign = outward === outwardIsLeft ? 1 : -1;
    return crenellatedPath(ring, heightMap, baseMap, gapMap, sideSign);
}

/** Index of the segment containing the halfway point by length — the centre-most one. */
function centreSegmentIndex(coords: Coordinate[]): number {
    const lengths: number[] = [];
    let total = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const len = Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]);
        lengths.push(len);
        total += len;
    }
    let travelled = 0;
    for (let i = 0; i < lengths.length; i++) {
        travelled += lengths[i];
        if (travelled >= total / 2) return i;
    }
    return Math.max(0, lengths.length - 1);
}

export function obstacleLineStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => obstacleLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function obstacleLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const label = getFullLabel(name, labels.label ?? '');
    return (f, resolution) => {
        const geom = f.getGeometry() as LineString;
        const coords = geom.getCoordinates();
        const styles: Style[] = [];

        if (coords.length < 2) return styles;

        // ── 1. The centre-most drawn segment ──────────────────────────────
        // The geometry *is* the drawn line now — the teeth are added below, in screen
        // space — so its own segments are the drawn ones. While the teeth were baked in,
        // every third vertex here was a tooth apex, and finding the middle of the drawn
        // line meant carrying a copy of it on the feature.
        const segIdx = centreSegmentIndex(coords);
        const p1 = coords[segIdx];
        const p2 = coords[segIdx + 1];

        const segDx = p2[0] - p1[0];
        const segDy = p2[1] - p1[1];
        const segLength = Math.hypot(segDx, segDy);
        if (segLength === 0) return styles;

        const dir: Coordinate = [segDx / segLength, segDy / segLength];
        const mid: Coordinate = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

        // ── 2. The side that is down ──────────────────────────────────────
        // Both perpendiculars are equally "beside the line"; the one with a negative
        // northing is the one below it on screen. Picking by the segment's own direction
        // is what made the label change sides when the same line was drawn right-to-left
        // — the direction of travel reverses, and every perpendicular derived from it
        // with it. A vertical line has no lower side, so the tie breaks to the east.
        let normal: Coordinate = [-dir[1], dir[0]];
        if (normal[1] > 0 || (normal[1] === 0 && normal[0] < 0)) {
            normal = [-normal[0], -normal[1]];
        }

        // ── 3. Stand off the line — a constant, in pixels ─────────────────
        // The teeth take the upper side and the label the lower, so it has only the line
        // itself to clear, and both terms are screen-sized: text does not scale with the
        // map. This used to be a scan of the rendered geometry to discover how far
        // map-unit teeth happened to reach, which is what sent the label a screen away on
        // a line that doubled back over itself.
        const obsScale = featureLabelScale(f, resolution);
        const halfTextHeightPx = (BASE_FONT_SIZE_PX / 2) * obsScale;
        const offsetMap = (halfTextHeightPx + OBSTACLE_LABEL_GAP_PX) * resolution;

        const labelPoint: Coordinate = [
            mid[0] + normal[0] * offsetMap,
            mid[1] + normal[1] * offsetMap,
        ];

        // ── 4. Read along the segment, always upright ─────────────────────
        let rotation = -Math.atan2(dir[1], dir[0]);
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }
        if (rotation > Math.PI) rotation -= 2 * Math.PI;


        styles.push(new Style(
            {
                geometry: new Point(labelPoint), // dummy point
                text: new Text({
                    text: label,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: obsScale,
                    stroke: getHaloStroke(),
                }),
            },
        ));

        // The line, crenellated in screen space. The teeth take the upper side whichever
        // way the line was drawn, and the label sits below, so the two never compete.
        const {heightMap, baseMap, gapMap} = obstacleToothSize(coords, false, resolution);
        const hostility = readHostility(f);
        styles.push(new Style({
            geometry: new LineString(crenellatedPath(coords, heightMap, baseMap, gapMap, 'up')),
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
        }));

        return styles;
    };
}

function getPointAlongSegment(coord1: number[], coord2: number[], ratio: number) {
    return [
        coord1[0] + (coord2[0] - coord1[0]) * ratio,
        coord1[1] + (coord2[1] - coord1[1]) * ratio,
    ];
}

export function ferryCrossingStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => ferryCrossingStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function ferryCrossingStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        let color = readHostilityColor(f);
        return new Style({
            fill: new Fill({color: color}),
            stroke: new Stroke({
                color: color,
                width: LINE_WIDTH(),
                lineDash: dashStyle(labels),
            }),
        });
    };
}

/**
 * TacticalFix — same fill/stroke treatment as `ferryCrossingStyleFunc`, plus
 * an "F" label rendered 15px past the line start in screen pixels, oriented
 * with the line and kept upright. Label scale tracks the user-drawn line
 * length so it grows/shrinks with the graphic and matches the block-family
 * label size at the 100px minimum.
 */
/**
 * @param label the doctrinal letter. Defaults to "F" so the published signature
 *   stays source-compatible; the table 5-19 obstacle effect passes '' and gets
 *   the same zigzag with no glyph.
 */
export function tacticalFixStyleFunc(label: string = 'F'): StyleFunction {
    return (f, resolution) => tacticalFixStyleFromLabels(label, readGraphicLabels(f))(f, resolution);
}

function tacticalFixStyleFromLabels(label: string, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const styles: Style[] = [];
        const color = readHostilityColor(f);
        styles.push(new Style({
            fill: new Fill({color: color}),
            stroke: new Stroke({
                color: color,
                width: LINE_WIDTH(),
                lineDash: dashStyle(labels),
            }),
        }));

        const geom = f.getGeometry();
        let lineCoords: Coordinate[] | undefined;
        if (geom instanceof GeometryCollection) {
            for (const sub of geom.getGeometries()) {
                if (sub instanceof LineString) {
                    lineCoords = sub.getCoordinates();
                    break;
                }
            }
        } else if (geom instanceof LineString) {
            lineCoords = geom.getCoordinates();
        }
        if (!lineCoords || lineCoords.length < 2) return styles;

        // Derive the F position straight from the geometry: the first segment
        // runs from the line start (lineCoords[0]) to the first triangle's
        // first vertex (lineCoords[1]). Anchoring at that segment's midpoint
        // keeps the label glued in place across zooms — it's no longer offset
        // by `25 × resolution`, which used to drift as zoom changed.
        const segStart = lineCoords[0];
        const segEnd = lineCoords[1];
        const labelAnchor: Coordinate = [
            (segStart[0] + segEnd[0]) / 2,
            (segStart[1] + segEnd[1]) / 2,
        ];

        // Rotation/scale come from the full line so the F is upright with the
        // graphic and its size tracks the user-drawn length.
        const start = lineCoords[0];
        const end = lineCoords[lineCoords.length - 1];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const len = Math.hypot(dx, dy);
        if (len === 0) return styles;

        // Everything past here builds the letter. Unlike the block family this
        // one cuts no gap for it, so the twin just stops.
        if (!label) return styles;

        let rotation = -Math.atan2(dy, dx);
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // Sized to render ~22.5px tall at the 145px min line length, matching
        // the block-family label size at minimum — and capped at the same
        // ceiling they are, so a long Fix does not grow an outsized "F".
        const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        const lenPx = len / resolution;
        const K = 0.10;
        const scale = Math.min(maxGraphicLabelScale(), sizeFactor * K * lenPx / BASE_FONT_SIZE_PX);

        styles.push(new Style({
            geometry: new Point(labelAnchor),
            text: new Text({
                text: label,
                font: 'bold 24px sans-serif',
                fill: new Fill({color: getLabelFillColor()}),
                stroke: getHaloStroke(),
                rotation,
                textAlign: 'center',
                textBaseline: 'middle',
                scale,
            }),
        }));

        return styles;
    };
}

export function defaultStyleFunc(): StyleFunction {
    return (f, resolution) => {
        let color = readHostilityColor(f);
        return new Style({
            fill: new Fill({color: color}),
            stroke: new Stroke({
                color: color,
                width: LINE_WIDTH(),
            }),
        });
    };
}

/**
 * BaseDefenseZone label: hardcoded "BDZ" centered on the circle, scaled so
 * the text grows/shrinks with the circle. The circle's radius (in metres)
 * is read from `feature.get('graphicSize')` — `MissionTaskGraphicBase`
 * stamps it on the label feature each time the geometry updates.
 *
 * Scale formula: `radiusPx / SCALE_DIVISOR`, floored so a tiny circle still
 * renders something and capped at `maxGraphicLabelScale()` like every other
 * size-proportional label. Lower the divisor for a larger label, raise it for a
 * smaller one; past a ~68 px radius the cap is what decides, so the divisor
 * only shapes how the label grows on the way there.
 */
export function baseDefenseZoneLabelStyleFn(): StyleFunction {
    return (feature, resolution) => {
        const geom = feature.getGeometry() as Point;
        const size = feature.get('graphicSize') as number | undefined;
        const radiusPx = size && size > 0 ? size / resolution : 0;
        const SCALE_DIVISOR = 45;
        const scale = Math.min(maxGraphicLabelScale(), Math.max(0.1, radiusPx / SCALE_DIVISOR));
        return [new Style({
            geometry: geom,
            text: new Text({
                text: 'BDZ',
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                textAlign: 'center',
                textBaseline: 'middle',
                scale,
                stroke: getHaloStroke(),
            }),
        })];
    };
}

/**
 * FightingPosition: stroke-only render of the 3-sided rectangle (left, top,
 * right walls — open at the bottom). The graphic feature's geometry is a
 * LineString of 4 points produced by `FightingPosition.generateGraphics`,
 * so a single Stroke is enough — no fill, no per-point label.
 */
export function fightingPositionStyleFunc(): StyleFunction {
    return (f) => {
        const color = readHostilityColor(f);
        return new Style({
            stroke: new Stroke({color, width: LINE_WIDTH()}),
        });
    };
}

/**
 * FortifiedLine: a continuous baseline plus rectangular teeth (merlons)
 * bumping up from it. Geometry is a MultiLineString — sub-line [0] is the
 * baseline, sub-lines [1..N] are each tooth as 4 points (leftBase, leftTop,
 * rightTop, rightBase). All sub-lines share one stroke; the name label
 * (when set) sits below the baseline midpoint so the teeth above don't
 * overlap it.
 */
export function fortifiedLineStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => fortifiedLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function fortifiedLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const label = getFullLabel(name, labels.label ?? '');
    return (f, resolution) => {
        const geom = f.getGeometry() as LineString;
        if (!geom) return [];
        const coords = geom.getCoordinates();
        if (coords.length < 2) return [];

        const color = readHostilityColor(f);
        const styles: Style[] = [];

        // Merlons in screen pixels, on the upper side of each segment whichever way the
        // line was drawn. The generator used to hand back interleaved gap and tooth
        // sub-lines, sized at the drawing resolution; the geometry is the drawn line now.
        const scale = decorationScale(coords, false, resolution, FORTIFIED_HEIGHT_PX);
        styles.push(new Style({
            geometry: new LineString(castellatedPath(
                coords,
                FORTIFIED_MERLON_PX * scale * resolution,
                FORTIFIED_CRENEL_PX * scale * resolution,
                FORTIFIED_HEIGHT_PX * scale * resolution,
                'up',
            )),
            stroke: new Stroke({color, width: LINE_WIDTH(), lineDash: dashStyle(labels)}),
        }));

        if (!label) return styles;

        // The label goes under the centre-most drawn segment — the merlons take the upper
        // side, so the two never compete.
        const segIdx = centreSegmentIndex(coords);
        const a = coords[segIdx];
        const b = coords[segIdx + 1];
        const mid: Coordinate = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const labelScale = featureLabelScale(f, resolution);
        const labelAnchor = offsetBelow(mid, a, b, resolution, 8);

        styles.push(new Style({
            geometry: new Point(labelAnchor),
            text: new Text({
                text: label,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: getRotation(a, b),
                textAlign: 'center',
                textBaseline: 'top',
                scale: labelScale,
                stroke: getHaloStroke(),
            }),
        }));

        return styles;
    };
}

export function directionArrowStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => directionArrowStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function directionArrowStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const color = readHostilityColor(f);
        const geom = f.getGeometry() as MultiLineString;
        const allCoords = geom.getCoordinates();
        const baseCoords = allCoords[0];
        const arrowCoords = allCoords[1];
        const styles: Style[] = [];

        // Base line (dashes when planned).
        styles.push(new Style({
            geometry: new LineString(baseCoords),
            stroke: new Stroke({
                color,
                width: LINE_WIDTH(),
                lineDash: dashStyle(labels),
            }),
        }));

        // Arrowhead + any extra shapes (feint dashes, main-attack polygon, etc.), solid.
        if (allCoords.length > 1) {
            styles.push(new Style({
                geometry: new MultiLineString(allCoords.slice(1)),
                stroke: new Stroke({color, width: LINE_WIDTH()}),
            }));
        }

        // Fill the Aviation-direction-of-attack bow-tie triangles (closed rings
        // appended at indices 2 and 3 by AviationDirectionOfAttack.generateGraphics).
        if (name === TacticalGraphicName.AviationDirectionOfAttack && allCoords.length >= 4) {
            styles.push(new Style({
                geometry: new Polygon([allCoords[2]]),
                fill: new Fill({color}),
            }));
            styles.push(new Style({
                geometry: new Polygon([allCoords[3]]),
                fill: new Fill({color}),
            }));
        }

        if (baseCoords.length >= 2 && arrowCoords && arrowCoords.length >= 3) {
            addDirectionArrowLabels(name, labels, baseCoords, arrowCoords, styles, resolution, f);
        }

        return styles;
    };
}

/**
 * Draws the name / optional ENY prefix / DTG labels for a direction arrow.
 * Anchor is set just behind the arrowhead wing base so text never invades the
 * arrowhead. Text extends backward along the line via `textAlign` chosen per
 * local screen direction, keeping the labels away from the tip for both
 * left-to-right and right-to-left draws.
 */
function addDirectionArrowLabels(
    name: TacticalGraphicName,
    labels: GraphicLabels,
    baseCoords: Position[],
    arrowCoords: Position[],
    styles: Style[],
    resolution: number,
    feature: FeatureLike,
): void {
    const p1 = baseCoords[baseCoords.length - 2];
    const p2 = baseCoords[baseCoords.length - 1];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const lineLen = Math.hypot(dx, dy);
    if (lineLen === 0) return;
    const ux = dx / lineLen;
    const uy = dy / lineLen;

    // Midpoint of the arrowhead's wing base (computeArrowheadPoints → [lw, tip, rw]).
    const leftWing = arrowCoords[0];
    const rightWing = arrowCoords[2];
    const midWingBase: Coordinate = [
        (leftWing[0] + rightWing[0]) / 2,
        (leftWing[1] + rightWing[1]) / 2,
    ];

    // Anchor = short fixed clearance behind the wing base along the line.
    const CLEARANCE_PX = 10;
    const clearanceMap = CLEARANCE_PX * resolution;
    const anchor: Coordinate = [
        midWingBase[0] - ux * clearanceMap,
        midWingBase[1] - uy * clearanceMap,
    ];

    const rotation = getRotation(p1, p2);
    const labelScale = featureLabelScale(feature, resolution);
    // The arrowhead is at p2; text must extend away from it in screen space.
    const arrowGoesRight = p2[0] >= p1[0];
    const textAlign: CanvasTextAlign = arrowGoesRight ? 'right' : 'left';

    const nameText = getFullLabel(name, labels.label ?? '');
    const dateText = getDateLabel(labels);
    const isHostile = labels.hostility === TacticalGraphicHostility.hostileFaker;
    const showEny = name === TacticalGraphicName.DirectionOfSupportingAttack && isHostile;

    if (nameText) {
        styles.push(new Style({
            geometry: new Point(anchor),
            text: new Text({
                text: nameText,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign,
                textBaseline: 'middle',
                scale: labelScale,
                stroke: getHaloStroke(),
            }),
        }));
    }

    if (showEny) {
        const nameWidthPx = nameText ? getTextWidth(nameText, fontStyle, labelScale) : 0;
        const ENY_GAP_PX = 36;
        const enyBackMap = (nameWidthPx + ENY_GAP_PX) * resolution;
        const enyAnchor: Coordinate = [
            anchor[0] - ux * enyBackMap,
            anchor[1] - uy * enyBackMap,
        ];
        styles.push(new Style({
            geometry: new Point(enyAnchor),
            text: new Text({
                text: 'ENY',
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign,
                textBaseline: 'middle',
                scale: labelScale,
                stroke: getHaloStroke(),
            }),
        }));
    }

    if (dateText) {
        const DTG_OFFSET_PX = 20;
        const dtgAnchor = offsetBelow(anchor, p1, p2, resolution, DTG_OFFSET_PX * labelScale);
        styles.push(new Style({
            geometry: new Point(dtgAnchor),
            text: new Text({
                text: dateText,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign,
                textBaseline: 'top',
                scale: labelScale,
                stroke: getHaloStroke(),
            }),
        }));
    }
}

export function forwardLineOfOwnTroopsStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => forwardLineOfOwnTroopsStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function forwardLineOfOwnTroopsStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as LineString;
        const coords = geom?.getCoordinates() ?? [];
        if (coords.length < 2) return [];

        // The scallops are screen-sized: baked into the geometry they were fixed in
        // metres, so a FLOT drawn zoomed out came back as a row of huge bulges.
        const scale = decorationScale(coords, false, resolution, WAVE_AMPLITUDE_PX);
        return [new Style({
            geometry: new LineString(wavePath(
                coords,
                WAVE_WAVELENGTH_PX * scale * resolution,
                WAVE_AMPLITUDE_PX * scale * resolution,
                1,
            )),
            stroke: new Stroke({
                color: readHostilityColor(f),
                width: LINE_WIDTH(),
                lineDash: dashStyle(labels),
            }),
        })];
    };
}

export function fieldOfFireStyleFunc(): StyleFunction {
    return (f, resolution) => fieldOfFireStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function fieldOfFireStyleFromLabels(labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const color = readHostilityColor(f);
        const styles: Style[] = [];

        // Thin stroke for the whole MultiLineString (V legs + both arrowheads).
        styles.push(new Style({
            stroke: new Stroke({color, width: LINE_WIDTH()}),
        }));

        const coords0 = (f.getGeometry() as MultiLineString).getCoordinates()[0];

        // Filled "rectangle" on the center of the LEFT leg (P0→P1), rendered as
        // a thick butt-cap stroke so the ends are square. It is part of the
        // symbol, so it takes the same standard identity colour as the legs.
        if (coords0.length >= 2) {
            const startPoint = getPointAlongSegment(coords0[0], coords0[1], 0.2);
            const endPoint = getPointAlongSegment(coords0[0], coords0[1], 0.7);
            styles.push(new Style({
                geometry: new LineString([startPoint, endPoint]),
                stroke: new Stroke({
                    color,
                    width: 12,
                    lineCap: 'butt',
                }),
            }));
        }

        // Boxed label at the vertex (middle point of a 3-point V).
        if (coords0.length >= 3) {
            const vertex = coords0[1];
            const labelText = labels?.label ?? '';
            if (labelText) {
                styles.push(new Style({
                    geometry: new Point(vertex),
                    text: new Text({
                        text: labelText,
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        padding: [3, 5, 3, 5],
                        textAlign: 'center',
                        textBaseline: 'top',
                        offsetY: 8,
                        scale: featureLabelScale(f, resolution),
                    }),
                }));
            }
        }

        return styles;
    };
}

export function munitionFlightPathStyleFunc(): StyleFunction {
    return (f, resolution) => munitionFlightPathStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function munitionFlightPathStyleFromLabels(labels: GraphicLabels): StyleFunction {
    let dateLabel = getDateLabel(labels);
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();

        const styles: Style[] = [];
        const hostility = readHostility(f);

        const outlineSegments: Coordinate[][] = [];

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Compute the total baseline vector (start → end)
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        // Project each vertex onto that baseline to get cumulative "linear" distance
        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen; // scalar projection
        });

        // 4️⃣ Normalize to 0 → baseLen range
        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const normalizedProjections = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        // Find segment that crosses the projected midpoint (0.5)
        const half = 0.5;
        let midSegmentIndex = 0;
        for (let i = 0; i < normalizedProjections.length - 1; i++) {
            if (normalizedProjections[i] <= half && normalizedProjections[i + 1] >= half) {
                midSegmentIndex = i;
                break;
            }
        }

        for (let i = 0; i < coords.length - 1; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push([coords[i], coords[i + 1]]);
            }
        }

        // Interpolate along that segment
        const t1 =
            (half - normalizedProjections[midSegmentIndex]) /
            (normalizedProjections[midSegmentIndex + 1] - normalizedProjections[midSegmentIndex]);

        const p1 = coords[midSegmentIndex];
        const p2 = coords[midSegmentIndex + 1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // Carve a gap sized to fit the "MFP" label at the current scale (half
        // text width + 4px padding per side), not a fixed fraction of the segment.
        const mfpFont = fontStyle;
        const mfpScale = featureLabelScale(f, resolution);
        const mfpTextWidthPx = getTextWidth('MFP', mfpFont, mfpScale);
        const mfpHalfGapPx = mfpTextWidthPx / 2 + 4;
        const gapRatio = (mfpHalfGapPx * resolution) / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }
        // Normalize to [-π, π)
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        styles.push(new Style(
            {
                geometry: new Point(midGap), // dummy point
                text: new Text({
                    text: 'MFP',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: mfpScale,
                    stroke: getHaloStroke(),
                }),
            },
        ));

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({
                color: getColorByHostility(hostility),
                width: LINE_WIDTH(),
            }),
        });

        const afterStart = coords[1];
        // Date label: center offset = half text height + 8px so nearest edge is 8px from line
        const dateOffsetPx = 12 * mfpScale + 8;
        let startDateLabelCoordinate = offsetCoordinatesUp(start, afterStart, -resolution, dateOffsetPx);
        let startRotation = getRotation(start, afterStart);
        styles.push(new Style(
            {
                geometry: new Point(startDateLabelCoordinate), // anchored at the line's start
                text: new Text({
                    text: dateLabel,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: startRotation,
                    // Left-align so the DTG text begins exactly at the line's start,
                    // matching the visual convention for MunitionFlightPath.
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale: mfpScale,
                    stroke: getHaloStroke(),
                }),
            },
        ));
        // Base layers
        styles.push(outlineStyle);
        return styles;
    };
}

const dashStyle = (labels: GraphicLabels) => {
    return (labels.status === TacticalGraphicStatus.planned ||
        (labels.hostility === TacticalGraphicHostility.hostileFaker
            && labels.confidence === TacticalGraphicConfidence.suspected
        )
    ) ? [12, 8] : undefined;
};

/**
 * Create a single feature with a style function
 * that draws labels at each segment midpoint with rotation.
 */
export function boundariesStyleFunc(): StyleFunction {
    return (f, resolution) => boundariesStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function boundariesStyleFromLabels(labels: GraphicLabels): StyleFunction {
    const topLabel = formatFullLabel(labels.label, labels.countryCode ?? '');
    const botLabel = formatFullLabel(labels.secondId ?? '', labels.secondCountryCode ?? '');
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();

        const styles: Style[] = [];
        const hostility = readHostility(f);
        const echelon = f.get('echelon') || TacticalGraphicEchelon.unknown;

        const outlineSegments: Coordinate[][] = [];

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Compute the total baseline vector (start → end)
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        // Project each vertex onto that baseline to get cumulative "linear" distance
        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen; // scalar projection
        });

        // 4️⃣ Normalize to 0 → baseLen range
        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const normalizedProjections = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        // Find segment that crosses the projected midpoint (0.5)
        const half = 0.5;
        let midSegmentIndex = 0;
        for (let i = 0; i < normalizedProjections.length - 1; i++) {
            if (normalizedProjections[i] <= half && normalizedProjections[i + 1] >= half) {
                midSegmentIndex = i;
                break;
            }
        }

        for (let i = 0; i < coords.length - 1; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push([coords[i], coords[i + 1]]);
            }
        }

        // Interpolate along that segment
        const t1 =
            (half - normalizedProjections[midSegmentIndex]) /
            (normalizedProjections[midSegmentIndex + 1] - normalizedProjections[midSegmentIndex]);

        const p1 = coords[midSegmentIndex];
        const p2 = coords[midSegmentIndex + 1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // 4) carve a central gap — match StrongPoint approach:
        //    10% of the segment on each side of center + 10px scaled pixel padding
        const echelonScale = featureLabelScale(f, resolution);
        const GAP_PX = 10;
        const gapHalfMap = 0.1 * segLen + GAP_PX * echelonScale * resolution;
        const gapRatio = gapHalfMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright. Track the flip so the perpendicular direction
        // stays consistent with the corrected reading direction.
        let perpSign = 1;
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
            perpSign = -1;
        }
        // Normalize to [-π, π)
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        // Offset label so its near edge clears the echelon with a proportional gap.
        // All three components scale together with labelScale so the layout stays
        // visually identical at every zoom level:
        //   anchor_px = (half_font_height + echelon_perp_extent + gap) * labelScale
        // With textBaseline:'middle', the near text edge is half_font_height px
        // closer to the line than the anchor, leaving `gap` px between it and the
        // echelon edge.
        // const GAP_PX = 8;
        const labelScale = featureLabelScale(f, resolution);
        const echelonPerpBasePx = getEchelonPerpExtentPx(echelon);
        const anchorMap = (BASE_FONT_SIZE_PX / 2 + echelonPerpBasePx + GAP_PX) * labelScale * resolution;
        // Perpendicular unit vector, negated when rotation was flipped to keep
        // top/bottom labels on the correct sides regardless of segment direction.
        const len = Math.hypot(dx, dy);

        const nx = perpSign * (-dy / len);
        const ny = perpSign * (dx / len);
        const topLabelCoordinate = [midGap[0] + nx * anchorMap, midGap[1] + ny * anchorMap];
        const bottomLabelCoordinate = [midGap[0] - nx * anchorMap, midGap[1] - ny * anchorMap];

        styles.push(new Style(
            {
                geometry: new Point(topLabelCoordinate),
                text: new Text({
                    text: topLabel,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: labelScale,
                    stroke: getHaloStroke(),
                }),
            },
        ));
        styles.push(new Style(
            {
                geometry: new Point(bottomLabelCoordinate),
                text: new Text({
                    text: botLabel,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: labelScale,
                    stroke: getHaloStroke(),
                }),
            },
        ));
        // 6) build styles for the echelon in the middle
        const echelonStyles = createEchelonStyles(midGap, dx, dy, resolution, echelon, getColorByHostility(TacticalGraphicHostility.unknown), echelonScale);
        styles.push(...echelonStyles);


        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({
                color: getColorByHostility(hostility),
                width: LINE_WIDTH(),
                lineDash: dashStyle(labels),
            }),
        });
        // Base layers
        styles.push(outlineStyle);

        return styles;
    };
}


export function getFullLabel(graphicName: TacticalGraphicName, customName: string): string {
    const prefix = getLabel(graphicName);
    return formatFullLabel(prefix, customName);
}

export function formatFullLabel(prefix: string, name: string): string {
    return prefix ? `${prefix} ${name}`.trim() : name;

}

export function getDateLabel(graphicLabels: GraphicLabels): string {
    let start = graphicLabels.startDate;
    let end = graphicLabels.endDate;
    const hasStart = !!start && start.trim() !== '';
    const hasEnd = !!end && end.trim() !== '';

    if (hasStart && hasEnd) {
        return `${start} - ${end}`;
    }

    if (hasStart) return start!;
    if (hasEnd) return end!;

    return '';
}

export function getAreaLabelStylesFn(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => getAreaLabelStylesFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function getAreaLabelStylesFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const fullLabel = getFullLabel(name, labels.label ?? '');
    const dateLabel = getDateLabel(labels);
    switch (name) {
        case TacticalGraphicName.HighDensityAirspaceControlZone:
        case TacticalGraphicName.RestrictedOperationsZone:
        case TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone:
        case TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone:
        case TacticalGraphicName.WeaponEngagementZone:
        case TacticalGraphicName.JointEngagementZone:
        case TacticalGraphicName.MissileEngagementZone:
        case TacticalGraphicName.LowAltitudeMissileEngagementZone:
        case TacticalGraphicName.HighAltitudeMissileEngagementZone:
        case TacticalGraphicName.ShortRangeAirDefenseEngagementZone:
            return airCoordinatingAreaStyleFunc(getLabel(name), labels, false);
        case TacticalGraphicName.WeaponsFreeZone:
            return airCoordinatingAreaStyleFunc(getLabel(name), labels, true);
        case TacticalGraphicName.AirSpaceCoordinationAreaRectangular:
        case TacticalGraphicName.AirSpaceCoordinationAreaIrregular:
        case TacticalGraphicName.AirSpaceCoordinationAreaCircular:
            labels.eff = dateLabel;
            return airspaceCoordinationAreaStyle(fullLabel, labels);
        case TacticalGraphicName.Airfield:
            return getAirfieldStyle(fullLabel, dateLabel);
        case TacticalGraphicName.NoFireAreaRectangular:
        case TacticalGraphicName.NoFireAreaCircular:
        case TacticalGraphicName.NoFireAreaIrregular:
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                const scale = featureLabelScale(feature, resolution);
                const lines: string[] = [];
                if (fullLabel?.trim()) lines.push(fullLabel.trim());
                if (dateLabel?.trim()) lines.push(dateLabel.trim());
                if (lines.length === 0) return [];
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: getHaloStroke(),
                        padding: [4, 8, 4, 8],
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        case TacticalGraphicName.PositionAreaArtilleryCircular:
        case TacticalGraphicName.PositionAreaArtilleryIrregular:
        case TacticalGraphicName.PositionAreaArtilleryRectangular:
            // PAA shows four "PAA" labels anchored at the top, bottom, left, and
            // right of the geometry's bounding box (stored on the label feature
            // by the base classes).
            return (feature: FeatureLike, resolution: number) => {
                const minX = feature.get('polygonMinX') as number | undefined;
                const minY = feature.get('polygonMinY') as number | undefined;
                const maxX = feature.get('polygonMaxX') as number | undefined;
                const maxY = feature.get('polygonMaxY') as number | undefined;
                if (minX === undefined || minY === undefined || maxX === undefined || maxY === undefined) return [];
                const scale = featureLabelScale(feature, resolution);
                const cx = (minX + maxX) / 2;
                const cy = (minY + maxY) / 2;
                const positions: Array<[number, number]> = [
                    [cx, maxY], // top edge midpoint
                    [cx, minY], // bottom edge midpoint
                    [minX, cy], // left edge midpoint
                    [maxX, cy], // right edge midpoint
                ];
                const styles: Style[] = positions.map(pos => new Style({
                    geometry: new Point(pos),
                    text: new Text({
                        text: 'PAA',
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: getHaloStroke(),
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                }));

                // Name + DTG label centered on the label feature's anchor point
                // (matches FreeFireArea's treatment).
                const anchorPoint = feature.getGeometry() as Point;
                const lines: string[] = [];
                if (fullLabel?.trim()) lines.push(fullLabel.trim());
                if (dateLabel?.trim()) lines.push(dateLabel.trim());
                if (anchorPoint && lines.length > 0) {
                    styles.push(new Style({
                        geometry: anchorPoint,
                        text: new Text({
                            text: lines.join('\n'),
                            font: fontStyle,
                            fill: new Fill({color: getLabelFillColor()}),
                            stroke: getHaloStroke(),
                            textAlign: 'center',
                            textBaseline: 'middle',
                            scale,
                        }),
                    }));
                }

                return styles;
            };
        case TacticalGraphicName.ObstacleFreeArea:
        case TacticalGraphicName.ObstacleRestrictedArea:
            // Stacked inside the toothed ring: the free area's literal "FREE" over T (the
            // designation) over W - W1 (the two DTGs, which `getDateLabel` already joins
            // with the hyphen the plate shows). "FREE" is a line of its own rather than
            // the `getLabel` prefix, which would set it beside the name instead of above
            // it. One Text with newlines rather than a style per line, for the same
            // reason the fire support areas use one: a fixed pixel offset between
            // separate styles collides with text that grows on zoom.
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                if (!anchorPoint) return [];
                const lines = [
                    name === TacticalGraphicName.ObstacleFreeArea ? 'FREE' : '',
                    fullLabel.trim(),
                    dateLabel.trim(),
                ].filter(line => line.length > 0);
                if (lines.length === 0) return [];
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: getHaloStroke(),
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale: featureLabelScale(feature, resolution),
                    }),
                })];
            };
        case TacticalGraphicName.FireSupportAreaIrregular:
            // FSA Irregular: stack "FSA" / name / DTG1 / DTG2 in a single Text
            // centered at the polygon centroid. Using "\n" instead of separate
            // styles keeps the line spacing tied to the font, so the lines
            // don't drift apart and overlap when the user zooms in (the
            // default getAreaLabelStyles uses a fixed 18px offsetY which
            // collides with text growing past 18px at high zoom).
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                if (!anchorPoint) return [];
                const scale = featureLabelScale(feature, resolution);
                const lines = [
                    fullLabel.trim(),
                    (labels.startDate ?? '').trim(),
                    (labels.endDate ?? '').trim(),
                ].filter(s => s && s.length > 0);
                if (lines.length === 0) return [];
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: getHaloStroke(),
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        case TacticalGraphicName.FireSupportAreaRectangular:
        case TacticalGraphicName.FireSupportAreaCircular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular:
        case TacticalGraphicName.CriticalFriendlyZoneIrregular:
        case TacticalGraphicName.CriticalFriendlyZoneRectangular:
        case TacticalGraphicName.CriticalFriendlyZoneCircular:
        case TacticalGraphicName.CensorZoneIrregular:
        case TacticalGraphicName.CensorZoneRectangular:
        case TacticalGraphicName.CensorZoneCircular:
        case TacticalGraphicName.CallForFireZoneIrregular:
        case TacticalGraphicName.CallForFireZoneRectangular:
        case TacticalGraphicName.CallForFireZoneCircular:
        case TacticalGraphicName.DeadSpaceAreaIrregular:
        case TacticalGraphicName.DeadSpaceAreaRectangular:
        case TacticalGraphicName.DeadSpaceAreaCircular:
        case TacticalGraphicName.BlueKillBoxIrregular:
        case TacticalGraphicName.BlueKillBoxRectangular:
        case TacticalGraphicName.BlueKillBoxCircular:
        case TacticalGraphicName.PurpleKillBoxIrregular:
        case TacticalGraphicName.PurpleKillBoxRectangular:
        case TacticalGraphicName.PurpleKillBoxCircular:
            // FSA Rect / Circle (and ATI ZONE / CF ZONE / CENSOR ZONE / CFF
            // ZONE / DA / BKB / PKB irregular, rect & circle variants — same
            // layout, the prefix shown comes from getLabel(name)): "<PREFIX>"
            // and name on separate lines, centered inside the shape. The two
            // DTGs (W / W1) stack outside on the top-left of its bounding box,
            // to the left of the left edge, top-aligned with the top edge.
            // For the circle the bounding box is the imaginary square hugging
            // the circle; for an irregular polygon it is the geometry's axis-
            // aligned extent (stored on the label feature by AreaGraphicBase).
            return (feature: FeatureLike, resolution: number) => {
                const styles: Style[] = [];
                const scale = featureLabelScale(feature, resolution);

                const anchorPoint = feature.getGeometry() as Point;
                const prefix = getLabel(name);
                const nameLines = [prefix, (labels.label ?? '').trim()].filter(s => s && s.length > 0);
                if (anchorPoint && nameLines.length > 0) {
                    styles.push(new Style({
                        geometry: anchorPoint,
                        text: new Text({
                            text: nameLines.join('\n'),
                            font: fontStyle,
                            fill: new Fill({color: getLabelFillColor()}),
                            stroke: getHaloStroke(),
                            textAlign: 'center',
                            textBaseline: 'middle',
                            scale,
                        }),
                    }));
                }

                const dtg1 = (labels.startDate ?? '').trim();
                const dtg2 = (labels.endDate ?? '').trim();
                let dtgAnchor: Coordinate | undefined;
                const isIrregularZone =
                    name === TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular ||
                    name === TacticalGraphicName.CriticalFriendlyZoneIrregular ||
                    name === TacticalGraphicName.CensorZoneIrregular ||
                    name === TacticalGraphicName.CallForFireZoneIrregular ||
                    name === TacticalGraphicName.DeadSpaceAreaIrregular ||
                    name === TacticalGraphicName.BlueKillBoxIrregular ||
                    name === TacticalGraphicName.PurpleKillBoxIrregular;
                if (isIrregularZone) {
                    // Irregular zones: anchor on the actual upper-leftmost
                    // vertex of the polygon. Using the bounding-box corner
                    // (polygonMinX / polygonMaxY) is misleading for irregular
                    // shapes — that point can sit far away from the geometry.
                    // "Upper-left vertex" = smallest X; ties broken by largest Y.
                    const ring = feature.get('polygonRing') as Coordinate[] | undefined;
                    if (ring && ring.length > 0) {
                        let best = ring[0];
                        for (let i = 1; i < ring.length; i++) {
                            const v = ring[i];
                            if (v[0] < best[0] || (v[0] === best[0] && v[1] > best[1])) {
                                best = v;
                            }
                        }
                        dtgAnchor = best;
                    }
                } else {
                    // FSA / rect / circle: bounding-box corner is the right
                    // anchor (a rectangle's top-left is a vertex, and a circle
                    // has no vertices — the imaginary square hugging it works).
                    const minX = feature.get('polygonMinX') as number | undefined;
                    const maxY = feature.get('polygonMaxY') as number | undefined;
                    if (minX !== undefined && maxY !== undefined) {
                        dtgAnchor = [minX, maxY];
                    }
                }
                if (dtgAnchor && (dtg1 || dtg2)) {
                    const dtgText = [dtg1, dtg2].filter(s => s.length > 0).join('-\n');
                    styles.push(new Style({
                        geometry: new Point(dtgAnchor),
                        text: new Text({
                            text: dtgText,
                            font: fontStyle,
                            fill: new Fill({color: getLabelFillColor()}),
                            stroke: getHaloStroke(),
                            textAlign: 'right',
                            textBaseline: 'top',
                            offsetX: -10,
                            scale,
                        }),
                    }));
                }
                return styles;
            };
        case TacticalGraphicName.GroupOrSeriesOfTargets:
            // Group/Series of Targets: name label sits ON the polygon's
            // northern-most segment, centered along it and rotated to follow
            // the segment direction. AreaGraphicBase parks the labels feature
            // at that segment's midpoint, so feature.getGeometry() is already
            // the anchor and labelSegmentA/B give the rotation axis.
            return (feature: FeatureLike, resolution: number) => {
                const a = feature.get('labelSegmentA') as Coordinate | undefined;
                const b = feature.get('labelSegmentB') as Coordinate | undefined;
                const point = feature.getGeometry() as Point;
                if (!a || !b || !point || !fullLabel?.trim()) return [];
                return [new Style({
                    geometry: point,
                    text: new Text({
                        text: fullLabel.trim(),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: getHaloStroke(),
                        textAlign: 'center',
                        textBaseline: 'middle',
                        rotation: getRotation(a, b),
                        scale: featureLabelScale(feature, resolution),
                    }),
                })];
            };
        case TacticalGraphicName.SmokeObscurant:
            // Smoke obscurant labels: name / SMOKE / DTG1- / DTG2 stacked at the
            // polygon centroid in a single Text so the line spacing tracks the
            // font scale at every zoom. Present and Planned share the label
            // layout — Planned just renders the outline dashed (handled in
            // getStyle).
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                if (!anchorPoint) return [];
                const scale = featureLabelScale(feature, resolution);
                const userName = (labels.label ?? '').trim();
                const dtg1 = (labels.startDate ?? '').trim();
                const dtg2 = (labels.endDate ?? '').trim();
                const lines: string[] = [];
                if (userName) lines.push(userName);
                lines.push('SMOKE');
                if (dtg1) lines.push(dtg2 ? `${dtg1}-` : dtg1);
                if (dtg2) lines.push(dtg2);
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: getHaloStroke(),
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        case TacticalGraphicName.FreeFireAreaCircular:
        case TacticalGraphicName.FreeFireAreaIrregular:
        case TacticalGraphicName.FreeFireAreaRectangular:
        case TacticalGraphicName.RestrictiveFireAreaCircular:
        case TacticalGraphicName.RestrictiveFireAreaIrregular:
        case TacticalGraphicName.RestrictiveFireAreaRectangular:
            // All FireSupportCoordination polygon labels share the opaque-white
            // halo treatment (matches LimitedAccessArea), and both lines render
            // in a single Text via "\n" so their spacing scales with the font
            // instead of drifting at different zoom levels. This only affects
            // label rendering — hatch fill still applies to NoFireArea only.
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                const scale = featureLabelScale(feature, resolution);
                const lines: string[] = [];
                if (fullLabel?.trim()) lines.push(fullLabel.trim());
                if (dateLabel?.trim()) lines.push(dateLabel.trim());
                if (lines.length === 0) return [];
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: getHaloStroke(),
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        case TacticalGraphicName.LimitedAccessArea:
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                const scale = featureLabelScale(feature, resolution);
                const lines: string[] = [];
                if (fullLabel?.trim()) lines.push(fullLabel.trim());
                if (dateLabel?.trim()) lines.push(dateLabel.trim());
                if (lines.length === 0) return [];
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: getHaloStroke(),
                        padding: [4, 8, 4, 8],
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        default:
            return getAreaLabelFn(fullLabel, dateLabel);
    }
}

export function getAirfieldStyle(fullLabel: string, dateLabel: string): StyleFunction {
    return (f, res) => {
        let styles = getAreaLabelStyles(f, res, fullLabel, dateLabel, 0, 36);
        const svg = `M -200000 0 L 200000 0 M -200000 -120000 L 200000 120000`;
        let {geometry} = svgToOpenLayersGeometry(svg, (f.getGeometry() as Point).getCoordinates());
        styles.push(new Style({
            geometry: geometry,
            // The crossed runways are the symbol's own line work, not an
            // amplifier, so they take the standard identity colour with the
            // area outline — FM 1-02.2 para 5-3.
            stroke: new Stroke({
                color: readHostilityColor(f),
                width: LINE_WIDTH(),
            }),
        }));

        return styles;
    };
}

export function getAreaLabelStyles(feature: FeatureLike, resolution: number, textLabel: string, dateLabel: string, rotation: number, offsetY: number = 0) {
    const geom = feature.getGeometry() as Point;
    let styles = [];

    styles.push(new Style({
        geometry: geom,
        text: new Text({
            rotation: rotation,
            text: textLabel,
            font: fontStyle,
            offsetY: offsetY,
            fill: new Fill({color: getLabelFillColor()}),
            scale: featureLabelScale(feature, resolution),
            stroke: getHaloStroke(),
        }),
    }));

    styles.push(new Style({
        geometry: geom,
        text: new Text({
            rotation: rotation,
            text: dateLabel,
            font: fontStyle,
            fill: new Fill({color: getLabelFillColor()}),
            scale: featureLabelScale(feature, resolution),
            offsetY: 18 + offsetY,
            stroke: getHaloStroke(),
        }),
    }));
    return styles;
}

export function getAreaLabelFn(textLabel: string, dateLabel: string, rotation: number = 0): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        return getAreaLabelStyles(feature, resolution, textLabel, dateLabel, rotation);
    };
}

/**
 * Generates an array of OpenLayers Style objects to position and format
 * the complex text labels on a polygon feature.
 * * The function uses multiple ol/style/Text objects with calculated pixel
 * offsets to create the multi-line, multi-column layout shown in the diagram.
 * Text is omitted if the corresponding value is not provided in the data.
 *
 * @param identifier
 * @param {GraphicLabels} labels The parameterized label values (A, T, X, X1, W, W1).
 * @returns {StyleFunction} An array of OpenLayers Style objects for the labels.
 */
export function airspaceCoordinationAreaStyle(
    identifier: string,
    labels: GraphicLabels,
): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        const anchorPoint = feature.getGeometry() as Point;

        // ── Build text block ──────────────────────────────────────────────────
        const nameLines: string[] = [];
        if (identifier?.trim())    nameLines.push(identifier.trim());
        if (labels.secondId?.trim()) nameLines.push(labels.secondId.trim());

        const altLines: string[] = [];
        if (labels.minAltitude) altLines.push(`${'MIN ALT:'.padEnd(11)}${labels.minAltitude}`);
        if (labels.maxAltitude) altLines.push(`${'MAX ALT:'.padEnd(11)}${labels.maxAltitude}`);
        if (labels.grid)        altLines.push(`${'GRID:'.padEnd(11)}${labels.grid}`);
        if (labels.eff)         altLines.push(`${'EFF'.padEnd(11)}${labels.eff}`);

        const allLines = (nameLines.length > 0 && altLines.length > 0)
            ? [...nameLines, '', ...altLines]
            : [...nameLines, ...altLines];

        if (allLines.length === 0) return [];

        // ── Measure widest line at scale = 1 ─────────────────────────────────
        const ctx = measureCtx();
        ctx.font = fontStyle;
        const maxLineWidth = Math.max(...allLines.map(l => l ? ctx.measureText(l).width : 0));

        // ── Fit-to-polygon scale cap ──────────────────────────────────────────
        // Use the shorter bounding-box dimension so the block stays inside the
        // polygon at every zoom level. Falls back to featureLabelScale alone when
        // the extent hasn't been stored yet (e.g. first render).
        const extW = feature.get('polygonExtentWidth')  as number | undefined;
        const extH = feature.get('polygonExtentHeight') as number | undefined;
        let fitScale = Infinity;
        if (extW && extH && maxLineWidth > 0) {
            const availablePx = Math.min(extW, extH) / resolution * 0.80;
            fitScale = availablePx / maxLineWidth;
        }
        const scale = Math.min(featureLabelScale(feature, resolution), fitScale);

        // ── Center the left-aligned block at the interior point ───────────────
        const offsetX = -(maxLineWidth * scale) / 2;

        return [new Style({
            geometry: anchorPoint,
            text: new Text({
                text: allLines.join('\n'),
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                stroke: getHaloStroke(),
                textAlign: 'left',
                textBaseline: 'middle',
                offsetX,
                scale,
            }),
        })];
    };
}


export function getMissionTaskStyleFn(textLabel: string, rotation: number = 0): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        const geom = feature.getGeometry() as Point;
        let styles = [];

        styles.push(new Style({
            geometry: geom,
            text: new Text({
                rotation: rotation,
                text: textLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                scale: featureLabelScale(feature, resolution),
                stroke: getHaloStroke(),
            }),
        }));

        return styles;

    };
}

/**
 * Mission-task label rendered with the same 24px base font as the
 * ratio-locked block-family graphics. Scale tracks the circle radius
 * (`graphicSize`) so the label grows with the graphic, tuned so a
 * 50px-radius circle (the 100px-diameter floor) renders the label at
 * ~22.5px tall — matching the block-family label size at their minimum.
 */
export function getRatioLockedMissionTaskStyleFn(textLabel: string): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        const geom = feature.getGeometry() as Point;
        return [new Style({
            geometry: geom,
            text: new Text({
                text: textLabel,
                font: RATIO_LOCKED_LABEL_FONT,
                fill: new Fill({color: getLabelFillColor()}),
                scale: ratioLockedLabelScale(feature, resolution),
                stroke: getHaloStroke(),
                textAlign: 'center',
                textBaseline: 'middle',
            }),
        })];
    };
}

/**
 * The font literal every ratio-locked mission-task label renders with. Anything
 * that measures one of those labels (`getTextWidth`) has to pass this same
 * string or the measured width won't match the drawn glyph.
 */
export const RATIO_LOCKED_LABEL_FONT = 'bold 24px sans-serif';
/** Declared px size of `RATIO_LOCKED_LABEL_FONT`, for glyph-height math. */
const RATIO_LOCKED_LABEL_FONT_PX = 24;

/** Clearance between the label's glyph box and each arc end, in screen pixels. */
const ARC_LABEL_CLEARANCE_PX = 5;
/**
 * Widest the label gap may open, in degrees of arc either side of the label.
 * Only reached when the circle is small enough that the letter genuinely spans
 * that much of it; past this the arcs would stop reading as a circle at all, so
 * the letter is allowed to overhang instead.
 */
const ARC_LABEL_MAX_HALF_GAP_RAD = (40 * Math.PI) / 180;

/** Smallest angle between two directions, in radians — always in [0, π]. */
function angleBetween(a: number, b: number): number {
    const d = Math.abs(a - b) % (2 * Math.PI);
    return d > Math.PI ? 2 * Math.PI - d : d;
}

/**
 * Trims the end of one arc that runs into the label, back to `halfGap` radians
 * clear of the label axis. Whichever end is nearer the axis is the one cut, so
 * this works for an arc that approaches the label from either side.
 *
 * The cut lands **exactly** on the gap edge rather than on the nearest sample:
 * the generator's arcs are 100 points over 160°, and at a large radius one 1.6°
 * step is several pixels — enough for the two sides of the gap to look uneven.
 *
 * Angles are measured about the projected centre, and radii are never assumed:
 * a geodesic circle is not quite a circle in EPSG:3857, so anything that
 * reconstructed a point from `graphicSize` would drift off the drawn arc.
 */
function cutArcAtLabel(pts: Coordinate[], centre: Coordinate, axis: number, halfGap: number): Coordinate[] {
    if (pts.length < 2) return pts;
    const angleAt = (p: Coordinate) => Math.atan2(p[1] - centre[1], p[0] - centre[0]);
    const clearance = (p: Coordinate) => angleBetween(angleAt(p), axis);

    const fromStart = clearance(pts[0]) <= clearance(pts[pts.length - 1]);
    const seq = fromStart ? pts : [...pts].reverse();

    let i = 0;
    while (i < seq.length && clearance(seq[i]) < halfGap) i++;
    if (i === 0) return pts;        // already clear of the label
    if (i >= seq.length) return []; // the whole arc is inside the gap

    const before = clearance(seq[i - 1]);
    const after = clearance(seq[i]);
    const t = after > before ? (halfGap - before) / (after - before) : 0;
    const edge: Coordinate = [
        seq[i - 1][0] + t * (seq[i][0] - seq[i - 1][0]),
        seq[i - 1][1] + t * (seq[i][1] - seq[i - 1][1]),
    ];
    const kept = [edge, ...seq.slice(i)];
    return fromStart ? kept : kept.reverse();
}

/** Every sub-line of a MultiLineString / GeometryCollection of them, in order. */
function flattenLineWork(geom: Geometry | RenderFeature | undefined): Coordinate[][] {
    if (geom instanceof MultiLineString) return geom.getCoordinates() as Coordinate[][];
    if (geom instanceof LineString) return [geom.getCoordinates() as Coordinate[]];
    if (geom instanceof GeometryCollection) return geom.getGeometries().flatMap(g => flattenLineWork(g));
    return [];
}

/** The filled rings alongside that line work — AreaDefense's teeth, and nothing else today. */
function flattenFilledRings(geom: Geometry | RenderFeature | undefined): Coordinate[][][] {
    if (geom instanceof Polygon) return [geom.getCoordinates() as Coordinate[][]];
    if (geom instanceof GeometryCollection) return geom.getGeometries().flatMap(g => flattenFilledRings(g));
    return [];
}

/**
 * The arc-and-arrowhead mission tasks — Secure, Isolate, Retain, Occupy,
 * Control, Contain, Cordon and Search — with the gap for their one-letter label
 * **cut from the rendered glyph** rather than left as a fixed slice of the
 * circle.
 *
 * The generator is asked for no gap at all (`labelGapDegrees: 0`), so its two
 * arcs run right up to the label axis and this function takes back exactly what
 * the letter needs. A fixed angular gap could not do that: 30° of a 100 px
 * circle is a comfortable hole around a 22 px letter, and 30° of a 400 px circle
 * is a hole four times too big around the *same* letter, since the label scale
 * is capped. @see maxGraphicLabelScale
 *
 * **The gap is tangential, so it comes off the glyph's height as much as its
 * width.** The label is drawn horizontally wherever it sits on the circle: with
 * the label due east the letter's *height* is what runs along the arc, and with
 * it due north, its width. Projecting the glyph box onto the tangent covers both
 * and everything between — measuring the width alone left the east/west labels,
 * which is most of them, sitting in a hole far wider than the letter.
 *
 * Sub-lines `[0]` and `[1]` are the two arcs (`MissionTask.labelGapArcs`);
 * everything after them — arrowheads, teeth, radials — is drawn untouched.
 */
export function arcMissionTaskStyleFunc(name: TacticalGraphicName, ratioLocked: boolean): StyleFunction {
    const label = getLabel(name);
    return (feature, resolution) => {
        const lines = flattenLineWork(feature.getGeometry());
        if (!lines.length) return [];

        const centre = feature.get('graphicCenter') as Coordinate | undefined;
        const labelPoint = feature.get('graphicLabelPoint') as Coordinate | undefined;
        const radius = centre && labelPoint ? Math.hypot(labelPoint[0] - centre[0], labelPoint[1] - centre[1]) : 0;

        if (centre && labelPoint && radius > 0 && label) {
            const axis = Math.atan2(labelPoint[1] - centre[1], labelPoint[0] - centre[0]);
            const scale = ratioLocked ? ratioLockedLabelScale(feature, resolution) : featureLabelScale(feature, resolution);
            const font = ratioLocked ? RATIO_LOCKED_LABEL_FONT : fontStyle;
            const fontPx = ratioLocked ? RATIO_LOCKED_LABEL_FONT_PX : BASE_FONT_SIZE_PX;

            const halfWidthPx = getTextWidth(label, font, scale) / 2;
            const halfHeightPx = (fontPx * scale * CAP_HEIGHT_FRACTION) / 2;
            // Half-extent of the glyph box along the tangent at the label.
            const tangentHalfPx =
                halfWidthPx * Math.abs(Math.sin(axis)) + halfHeightPx * Math.abs(Math.cos(axis)) + ARC_LABEL_CLEARANCE_PX;
            const halfGap = Math.min(ARC_LABEL_MAX_HALF_GAP_RAD, (tangentHalfPx * resolution) / radius);

            for (const i of [0, 1]) {
                if (lines[i]) lines[i] = cutArcAtLabel(lines[i], centre, axis, halfGap);
            }
        }

        const color = readHostilityColor(feature);
        const stroke = new Stroke({color, width: LINE_WIDTH()});
        const styles: Style[] = [];

        const drawn = lines.filter(line => line.length >= 2);
        if (drawn.length) styles.push(new Style({geometry: new MultiLineString(drawn), stroke}));

        // AreaDefense's teeth are solid polygons rather than open outlines; every
        // other member of the family has none, so this costs them nothing.
        const rings = flattenFilledRings(feature.getGeometry());
        if (rings.length) {
            styles.push(new Style({
                geometry: new MultiPolygon(rings),
                fill: new Fill({color}),
                stroke,
            }));
        }
        return styles;
    };
}

/**
 * Label height as a fraction of the graphic's `graphicSize` on screen. Lower
 * than `GRAPHIC_LABEL_FRACTION` because mission tasks store a radius where the
 * block family stores a perpendicular size — 0.3 here lines the two families up
 * at their respective minimums. @see getRatioLockedMissionTaskStyleFn
 */
const RATIO_LOCKED_LABEL_FRACTION = 0.3;

/**
 * Scale of a ratio-locked mission task's label. Exported because the graphic
 * style functions that open a gap for that label have to size the gap from the
 * same number the label is drawn at.
 *
 * Capped at `maxGraphicLabelScale()`, the same ceiling the block family's
 * `featureGraphicLabelScale` stops at — a big circle keeps its one-letter label
 * at a readable size instead of scaling it up without limit. The cap applies to
 * the gap math for free, since both read this one number.
 */
export function ratioLockedLabelScale(feature: FeatureLike, resolution: number): number {
    const radius = feature.get('graphicSize') as number | undefined;
    if (radius && radius > 0) {
        const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        return Math.min(maxGraphicLabelScale(), sizeFactor * RATIO_LOCKED_LABEL_FRACTION * (radius / resolution) / BASE_FONT_SIZE_PX);
    }
    return featureLabelScale(feature, resolution);
}

/**
 * Which of the two crossed arms renders hashed, by sub-line index into
 * `CrossedMissionTask.generateGraphics` output. Absent = both solid.
 */
const CROSSED_HASHED_ARM: Partial<Record<TacticalGraphicName, number>> = {
    // The "/" stroke of the X.
    [TacticalGraphicName.Suppress]: 0,
    // The diagonal; the horizontal stays solid.
    [TacticalGraphicName.Neutralize]: 1,
};

/** Hash pattern of a doctrinally-broken arm, in screen pixels. */
const CROSSED_HASH_DASH = [12, 8];
/**
 * Clearance in screen pixels between the label's glyph box and the arm ends
 * that stop short of it. Added *along the arm*, past where the arm leaves the
 * box — not as padding on the box itself. Padding the box inflates on the
 * diagonals (a 45° ray exits a box grown by `p` some `p × √2` further out), so
 * an X would end up with a visibly wider gap than a cross for the same number.
 */
const CROSSED_LABEL_CLEARANCE_PX = 7;
/** Cap height of the label font as a fraction of its declared px size. */
const CAP_HEIGHT_FRACTION = 0.72;

/**
 * Screen half-width a crossed mission task always renders at — 100 px across,
 * at **every** zoom level.
 *
 * These are badges, not areas. They mark a point; nothing about them describes
 * ground extent, so there is no size for the map scale to be right about. The
 * symbol is therefore pinned to the screen outright rather than merely capped:
 * it neither grows on zoom-in nor recedes on zoom-out.
 *
 * That makes the stored `size` irrelevant to what is drawn — the style function
 * divides it straight back out. It still matters as the thing `size` and
 * `resolution` are compared *through*, and as what a non-OpenLayers renderer
 * would fall back on, so it is still saved.
 */
export const CROSSED_HALF_WIDTH_PX = 50;

/**
 * Label scale for the crossed mission tasks: the ratio-locked family's formula
 * driven off the fixed half-width, so the letter is the same size as the line
 * work is — constant. Exported because the graphic style has to reproduce it to
 * size the gap the letter sits in.
 */
export function crossedMissionTaskLabelScale(): number {
    const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
    return sizeFactor * RATIO_LOCKED_LABEL_FRACTION * CROSSED_HALF_WIDTH_PX / BASE_FONT_SIZE_PX;
}

/**
 * The one-letter label of a crossed mission task. Same treatment as
 * `getRatioLockedMissionTaskStyleFn`, but at a constant screen size.
 */
export function crossedMissionTaskLabelStyleFn(name: TacticalGraphicName): StyleFunction {
    const textLabel = getLabel(name);
    return (feature: FeatureLike) => [new Style({
        geometry: feature.getGeometry() as Point,
        text: new Text({
            text: textLabel,
            font: RATIO_LOCKED_LABEL_FONT,
            fill: new Fill({color: getLabelFillColor()}),
            scale: crossedMissionTaskLabelScale(),
            stroke: getHaloStroke(),
            textAlign: 'center',
            textBaseline: 'middle',
        }),
    })];
}

/**
 * Destroy / Interdict / Neutralize / Suppress — two straight lines crossing at
 * a one-letter label, per FM 1-02.2 table 6-1.
 *
 * Sub-line layout, written by `CrossedMissionTask.generateGraphics`:
 *   `[0]` first arm, `[1]` second arm, `[2…]` arrowheads.
 * The arms arrive whole, running right through the centre; the gap for the
 * label is opened here, sized from the glyph that actually renders. Baking it
 * into the geometry would be a second place to keep in step with the label's
 * scale formula.
 *
 * The whole symbol is also **scaled about its centre onto the screen**, so it
 * renders `CROSSED_HALF_WIDTH_PX × 2` wide at every zoom level — it neither
 * grows on zoom-in nor recedes on zoom-out. Nothing about the stored `size`
 * survives that: the scale factor divides it straight back out. It has to
 * happen here rather than in the geometry because it is a function of the live
 * `resolution`, which the generator never sees.
 *
 * Euclidean EPSG:3857 maths only — no turf, no GeometryService. @see conventions.md
 */
export function crossedMissionTaskStyleFunc(name: TacticalGraphicName): StyleFunction {
    const label = getLabel(name);
    const hashedArm = CROSSED_HASHED_ARM[name];
    return (feature: FeatureLike, resolution: number) => {
        const geom = feature.getGeometry();
        if (!(geom instanceof MultiLineString)) return [];
        const lines = geom.getCoordinates();
        if (lines.length < 2) return [];

        const color = readHostilityColor(feature);
        const strokeFor = (hashed: boolean) => new Stroke({
            color,
            width: LINE_WIDTH(),
            lineDash: hashed ? CROSSED_HASH_DASH : undefined,
        });

        // The symbol's centre, as stamped by the holder — the same projected
        // point the label feature is drawn at.
        //
        // **Not the arms' midpoint.** The generator walks out from the centre
        // with `turf.destination`, which is geodesic; Mercator then stretches
        // the northern end of a diagonal arm more than the southern one, so the
        // projected midpoint sits a little north of the true centre. That error
        // is fixed in map units, so on screen it grew on zoom-in — and since the
        // geometry is scaled about this point while the label is not, the letter
        // visibly drifted out of its own gap as you zoomed.
        const stamped = feature.get('graphicCenter') as number[] | undefined;
        const [a0, a1] = lines[0];
        const cx = stamped?.[0] ?? (a0[0] + a1[0]) / 2;
        const cy = stamped?.[1] ?? (a0[1] + a1[1]) / 2;

        // Scale the symbol about its centre so its half-width is always
        // `CROSSED_HALF_WIDTH_PX` on screen. `k` is the ratio between the
        // half-width the geometry was built at and the one we want, so the
        // stored `size` cancels out entirely and the result is the same number
        // of pixels at every zoom. No clamp: it grows the geometry on zoom-out
        // just as it shrinks it on zoom-in.
        const size = feature.get('graphicSize') as number | undefined;
        const k = size && size > 0 ? (CROSSED_HALF_WIDTH_PX * resolution) / size : 1;
        const pinned = (p: number[]): Coordinate => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];

        // Half-extents of the label's glyph box, in map units. The scale is the
        // one the label itself uses — constant, like everything else here.
        const scale = crossedMissionTaskLabelScale();
        const halfW = (getTextWidth(label, RATIO_LOCKED_LABEL_FONT, scale) / 2) * resolution;
        const halfH = (24 * scale * CAP_HEIGHT_FRACTION / 2) * resolution;
        const clearance = CROSSED_LABEL_CLEARANCE_PX * resolution;

        const styles: Style[] = [];
        for (let i = 0; i < 2; i++) {
            const start = pinned(lines[i][0]);
            const end = pinned(lines[i][1]);
            const dx = end[0] - start[0];
            const dy = end[1] - start[1];
            const len = Math.hypot(dx, dy);
            const stroke = strokeFor(i === hashedArm);
            if (len === 0) continue;
            const ux = dx / len;
            const uy = dy / len;
            // Where this direction leaves the label's box: whichever of the two
            // half-extents it reaches first. A near-horizontal arm therefore
            // clears the glyph's width, a near-vertical one its height. The
            // clearance is then added *along the arm*, so every arm stops the
            // same distance from the glyph whatever angle it comes in at.
            const boxExit = Math.min(
                Math.abs(ux) > 1e-9 ? halfW / Math.abs(ux) : Infinity,
                Math.abs(uy) > 1e-9 ? halfH / Math.abs(uy) : Infinity,
            );
            const gap = boxExit + clearance;
            if (!isFinite(gap) || gap * 2 >= len) {
                styles.push(new Style({geometry: new LineString([start, end]), stroke}));
                continue;
            }
            styles.push(new Style({
                geometry: new LineString([start, [cx - ux * gap, cy - uy * gap]]),
                stroke,
            }));
            styles.push(new Style({
                geometry: new LineString([[cx + ux * gap, cy + uy * gap], end]),
                stroke,
            }));
        }

        // Arrowheads are never hashed — FM 1-02.2 draws Interdict's heads solid
        // even where the arm they sit on is broken.
        for (let i = 2; i < lines.length; i++) {
            styles.push(new Style({geometry: new LineString(lines[i].map(pinned)), stroke: strokeFor(false)}));
        }
        return styles;
    };
}

/**
 * Turn — the bowed curve and its filled arrowhead. The geometry is a
 * GeometryCollection (`[MultiLineString, Polygon]`), so one fill + stroke pair
 * covers both: OpenLayers strokes the sub-lines and fills the arrowhead.
 * The "T" comes off the separate label feature.
 */
export function turnStyleFunc(name: TacticalGraphicName): StyleFunction {
    const label = getLabel(name);
    return (f, resolution) => {
        const color = readHostilityColor(f);
        const stroke = new Stroke({color, width: LINE_WIDTH()});
        const geom = f.getGeometry();
        if (!(geom instanceof GeometryCollection)) {
            return new Style({fill: new Fill({color}), stroke});
        }

        // Half the gap, in map units, from the glyph as it renders right now.
        // The label's own scale is zoom-clamped to [0.3, 1.5], so a gap baked
        // in metres drifted against it: wider than the "T" zoomed in, tighter
        // than it zoomed out. Measuring here is the only way the two agree at
        // every zoom. @see conventions.md, "a gap follows what it makes room for"
        // No letter, no gap: TURN_LABEL_PAD_PX is added on top of the measured
        // width, so an empty label would still leave 10px of curve missing.
        const scale = featureLabelScale(f, resolution);
        const halfGap = label ? (getTextWidth(label, fontStyle, scale) / 2 + TURN_LABEL_PAD_PX) * resolution : 0;

        const styles: Style[] = [];
        for (const sub of geom.getGeometries()) {
            if (sub instanceof Polygon) {
                // The arrowhead — filled, and never trimmed.
                styles.push(new Style({geometry: sub, fill: new Fill({color}), stroke}));
                continue;
            }
            if (!(sub instanceof MultiLineString)) {
                styles.push(new Style({geometry: sub, stroke}));
                continue;
            }
            // `[curveBeforeLabel, curveAfterLabel]`, meeting exactly at the
            // arc-length midpoint because the holder passes `labelGap: 0` and
            // does the cutting here instead. Trim each half back from that
            // shared inner end.
            const halves = sub.getCoordinates();
            halves.forEach((half, i) => {
                const trimmed =
                    halfGap > 0
                        ? i === 0
                            ? trimFromEnd(half, halfGap)
                            : trimFromEnd(half.slice().reverse(), halfGap).reverse()
                        : half;
                if (trimmed.length >= 2) styles.push(new Style({geometry: new LineString(trimmed), stroke}));
            });
        }
        return styles;
    };
}

/** Padding either side of the "T", in screen pixels. */
const TURN_LABEL_PAD_PX = 5;

/**
 * Drops `distance` map units off the far end of a polyline, interpolating the
 * new last vertex. Euclidean — these are projected EPSG:3857 metres.
 * Returns fewer than two points when the line is shorter than the trim.
 */
function trimFromEnd(coords: number[][], distance: number): Coordinate[] {
    let remaining = distance;
    const kept = coords.map(c => [c[0], c[1]] as Coordinate);
    while (kept.length >= 2) {
        const last = kept[kept.length - 1];
        const prev = kept[kept.length - 2];
        const segment = Math.hypot(last[0] - prev[0], last[1] - prev[1]);
        if (segment > remaining) {
            const t = remaining / segment;
            kept[kept.length - 1] = [last[0] + (prev[0] - last[0]) * t, last[1] + (prev[1] - last[1]) * t];
            return kept;
        }
        remaining -= segment;
        kept.pop();
    }
    return kept;
}

/**
 * Label-style function for the doctrinal weapon/sensor range fans.
 *
 * MultiPoint vertex layout, written by `RangeFan.generateLabels` and
 * mirrored on the OL feature by `RangeFanGraphicBase.updateGeometry`:
 *   circular: [center, band1Mid, band2Mid, ...]
 *   sector:   [center, band1Mid, band1LeftAz, band1RightAz,
 *                       band2Mid, band2LeftAz, band2RightAz, ...]
 * The bands array stamped on the label feature carries the resolved
 * azimuth values for each sector band so this fn doesn't need to re-run
 * the resolver.
 */
export function getRangeFanLabelStyleFn(
    name: TacticalGraphicName,
): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        const geom = feature.getGeometry();
        if (!(geom instanceof MultiPoint)) return [];
        const coords = geom.getCoordinates();
        if (coords.length < 2) return [];

        const bands = feature.get('rangeFanBands') as
            | Array<{
                  range: number;
                  label?: string;
                  altitude?: string;
                  /** Resolved absolute compass bearings — written by
                   * RangeFanGraphicBase / RangeFan.generateLabels for the
                   * style fn to print. The raw user-facing fields on each
                   * band are deflections from the global center. */
                  resolvedLeftAz?: number;
                  resolvedRightAz?: number;
              }>
            | undefined;
        if (!bands || bands.length === 0) return [];

        const shape = feature.get('rangeFanShape') as 'circular' | 'sector' | undefined;
        const isSector = shape === 'sector' && name === TacticalGraphicName.WeaponSensorRangeFanSector;
        // Sector packs three vertices per band (mid + leftAz + rightAz);
        // circular packs one (mid only).
        const stride = isSector ? 3 : 1;

        const scale = featureLabelScale(feature, resolution);
        const fill = new Fill({color: getLabelFillColor()});
        const styles: Style[] = [];

        // Per-band labels. Layout per shape:
        //   circular — user label (if any), then "MIN RG <km>",
        //              then "ALT <altitude>" if entered.
        //   sector   — user label (if any), then "RG <km>",
        //              then "ALT <altitude>" if entered, plus per-band
        //              azimuth labels at the arc edges.
        // The auto range line renders even when no name is typed. Range
        // values are stored in kilometers.
        for (let i = 0; i < bands.length; i++) {
            const midIdx = 1 + i * stride;
            if (midIdx >= coords.length) break;
            const band = bands[i];
            const lines: string[] = [];
            const labelText = band.label?.trim();
            if (labelText) lines.push(labelText);
            if (shape === 'circular') {
                lines.push(`MIN RG ${formatKm(band.range)}`);
            } else if (isSector) {
                lines.push(`RG ${formatKm(band.range)}`);
            }
            const altText = band.altitude?.trim();
            if (altText) lines.push(`ALT ${altText}`);
            if (lines.length > 0) {
                styles.push(new Style({
                    geometry: new Point(coords[midIdx]),
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill,
                        stroke: getHaloStroke(),
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                }));
            }

            // Sector: per-band azimuth text at vertices (3i+2) and (3i+3).
            // Format matches FM 1-02.2 examples ("315", "030").
            if (isSector) {
                const leftIdx = midIdx + 1;
                const rightIdx = midIdx + 2;
                if (leftIdx < coords.length && band.resolvedLeftAz !== undefined) {
                    styles.push(new Style({
                        geometry: new Point(coords[leftIdx]),
                        text: new Text({
                            text: formatAzimuth(band.resolvedLeftAz),
                            font: fontStyle,
                            fill,
                            stroke: getHaloStroke(),
                            textAlign: 'center',
                            textBaseline: 'middle',
                            scale,
                        }),
                    }));
                }
                if (rightIdx < coords.length && band.resolvedRightAz !== undefined) {
                    styles.push(new Style({
                        geometry: new Point(coords[rightIdx]),
                        text: new Text({
                            text: formatAzimuth(band.resolvedRightAz),
                            font: fontStyle,
                            fill,
                            stroke: getHaloStroke(),
                            textAlign: 'center',
                            textBaseline: 'middle',
                            scale,
                        }),
                    }));
                }
            }
        }

        return styles;
    };
}

function formatAzimuth(deg: number): string {
    let n = Math.round(deg) % 360;
    if (n < 0) n += 360;
    return String(n).padStart(3, '0');
}

/** Range bands are stored in km; print them dropping a trailing .0. */
function formatKm(km: number): string {
    if (!Number.isFinite(km)) return '0';
    return Number.isInteger(km) ? String(km) : km.toFixed(1);
}

function getOffset(distance: number, rotation: number): [number, number] {
    const offsetX = Math.cos(rotation) * distance;
    const offsetY = Math.sin(rotation) * distance;
    return [offsetX, offsetY];
}

export function getSecurityOperationLabelStyle(textLabel: string, rotation: number = 0, position: 'left' | 'right' = 'left'): StyleFunction {
    // Takes neither `feature` nor `resolution`: the label's size no longer
    // depends on the zoom, and it carries no amplifiers to read off the feature.
    return () => {
        const orientation = position === 'left' ? 1 : -1;

        // Constant on-screen size, deliberately NOT `featureLabelScale`.
        //
        // That helper returns `sizeFactor × (drawingResolution / resolution)`,
        // which holds a label at a constant size in *map* units — so it doubles
        // on screen every time you zoom in a level. Right for a label that
        // belongs to geometry drawn in map units; wrong here, because every size
        // in `SecurityOperationGraphicBase` is a pixel constant × the resolution
        // and the whole graphic holds its on-screen size across a zoom. A label
        // that grew while its arrows stayed put was the odd one out.
        //
        // This is exactly what `featureLabelScale` yields at the moment the
        // graphic is drawn (`resolution === drawingResolution`), so the label
        // keeps the size it has always had — it just stops growing from there.
        const labelScale = getDefaultLabelSize() / BASE_FONT_SIZE_PX;

        // The glyph is NOT rotated with the graphic, and `rotation` is spent only on
        // the sub-pixel nudge below.
        //
        // Rotating it turned the C / G / S upside down as soon as the user swung the
        // graphic past the horizontal, which is exactly what an amplifier must never
        // do — a label is read by the operator, not by the symbol. The mission tasks
        // already behave this way: `getMissionTaskStyleFn` takes a rotation and
        // every caller, Retain included, leaves it at 0.
        //
        // The letter still travels with its own arm, because the label *anchor* is
        // rotated about the centre in `SecurityOperationGraphicBase.placeCoordinates`.
        // Position follows the graphic; orientation follows the screen.
        const [offsetX, offsetY] = getOffset(0.5 * orientation, rotation);
        return new Style({
            text: new Text({
                text: textLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                textBaseline: 'middle',
                scale: labelScale,
                offsetX,
                offsetY,
                stroke: getHaloStroke(),
            }),
        });
    };
}

export const createFeatureWithDashedLines = () => {
    let feature = new Feature();

    const style = new Style({
        stroke: new Stroke({
            color: getDefaultLineColor(),
            width: LINE_WIDTH(),
            lineDash: [4, 4],
        }),
    });

    feature.setStyle(style);
    return feature;
};

/** Screen-pixel size of a StrongPoint cross tie, and the spacing between ties. */
const CROSS_TIE_PX = 10;

function generateCrossTiesForPolygon(polygon: Polygon | MultiLineString, resolution: number, color: string) {
    const styles: any[] = [];

    const rings = polygon.getCoordinates(); // [ [ [x, y], ... ], [hole1], [hole2], ... ]

    // StrongPoint's ties are where the screen-fixed decorations started — the obstacle
    // teeth and the fortified merlons were changed to match them — but they were the one
    // set never capped, so zoomed out they swamped the ring they hang off. Same
    // shape-relative rule as the rest now, measured across the whole outline because
    // `rings` here are the outline segments rather than one closed ring.
    const scale = decorationScale(rings.flat() as Coordinate[], true, resolution, CROSS_TIE_PX);
    if (scale <= 0) return styles;

    const tieSpacing = CROSS_TIE_PX * scale * resolution; // Distance between ties
    const tieLength = CROSS_TIE_PX * scale * resolution; // Half-length of each cross tie

    rings.forEach((ring: Coordinate[]) => {
        let totalDistance = 0;
        let lastTieDistance = 0;

        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];

            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (segmentLength === 0) continue;

            const segmentStart = totalDistance;
            const segmentEnd = totalDistance + segmentLength;

            while (lastTieDistance + tieSpacing <= segmentEnd) {
                const nextTieDistance = lastTieDistance + tieSpacing;

                if (nextTieDistance >= segmentStart) {
                    const t = (nextTieDistance - segmentStart) / segmentLength;
                    const x = p1[0] + t * dx;
                    const y = p1[1] + t * dy;

                    const perpX = -dy / segmentLength;
                    const perpY = dx / segmentLength;

                    const tieStart = [x, y];
                    const tieEnd = [x + perpX * tieLength, y + perpY * tieLength];

                    styles.push(
                        new Style({
                            geometry: new LineString([tieStart, tieEnd]),
                            stroke: new Stroke({
                                color: color,
                                width: LINE_WIDTH(),
                            }),
                        }),
                    );
                }

                lastTieDistance = nextTieDistance;
            }

            totalDistance = segmentEnd;
        }
    });

    return styles;
}

// Define a type for the common computed results
interface GraphicGeometryData {
    /** The segments of the polygon outline, excluding the gap. */
    outlineSegments: Coordinate[][];
    /** The center point of the gap, where the echelon symbol will be placed. */
    midGap: Coordinate;
    /** The delta X component of the segment used for the gap. */
    dx: number;
    /** The delta Y component of the segment used for the gap. */
    dy: number;
    /** The length of the segment used for the gap. */
    segLen: number;
}

/**
 * Common logic to process the polygon geometry, find the open segment,
 * carve a gap, and prepare data for style generation.
 * @param geom The OpenLayers Polygon geometry.
 * @param rotation The rotation angle (0=east, π/2=north).
 * @param resolution The current map resolution (map units per pixel).
 * @returns An object containing the computed geometry data, or null if invalid.
 */
function getGraphicGeometryData(
    geom: Geometry,
    rotation: number,
    resolution: number,
): GraphicGeometryData | null {
    if (geom.getType() !== 'Polygon') {
        return null;
    }

    const unitRot: Coordinate = [Math.cos(rotation), Math.sin(rotation)];

    // 1) get the outer ring
    const ring: Coordinate[] = (geom as Polygon).getCoordinates()[0];
    if (ring.length < 2) {
        return null;
    }

    // 2) pick the segment whose outward normal best aligns with rotation
    let openIndex = 0;
    let bestDot = -Infinity;
    for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        const dx = x2 - x1,
            dy = y2 - y1;
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) continue;

        // polygon is CCW → outward normal = [-dy, dx]
        const nx = -dy / segLen;
        const ny = dx / segLen;
        const dot = nx * unitRot[0] + ny * unitRot[1];
        if (dot > bestDot) {
            bestDot = dot;
            openIndex = i;
        }
    }

    // endpoints of that opening segment
    const p1 = ring[openIndex];
    const p2 = ring[openIndex + 1];
    const dx = p2[0] - p1[0],
        dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);

    // 3) outline all other edges
    const outlineSegments: Coordinate[][] = [];
    for (let i = 0; i < ring.length - 1; i++) {
        if (i !== openIndex) {
            outlineSegments.push([ring[i], ring[i + 1]]);
        }
    }

    // 4) carve a central gap in that opening side
    const GAP_PX = 10; // px gap on each side of the dot
    const gapMap = GAP_PX * resolution; // map-unit gap
    const gapRatio = gapMap / segLen;
    // t1 and t2 define the original fraction along the segment for the gap center
    const t1 = 0.4,
        t2 = 0.6;

    // Calculate gap endpoints adjusted by the map-unit gap
    const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
    const gapB: Coordinate = [p1[0] + dx * (t2 + gapRatio), p1[1] + dy * (t2 + gapRatio)];

    // keep the two side pieces of that segment
    outlineSegments.push([p1, gapA], [gapB, p2]);

    // 5) compute the center of the gap for the dot
    const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

    return {
        outlineSegments,
        midGap,
        dx,
        dy,
        segLen,
    };
}

// Complete style function for OpenLayers
function railroadStyleFunction(feature: FeatureLike, resolution: number) {
    const geometry = feature.getGeometry();
    // Default to π/2 so the echelon sits on the southernmost segment.
    // The normal formula in getGraphicGeometryData is the inward normal, so the
    // target direction is inverted: pointing north (π/2) selects the south-facing edge.
    // ?? (not ||) ensures an explicit rotation of 0 (east) is still respected.
    const rotation: number = feature.get('rotation') ?? Math.PI / 2;

    const geoData = getGraphicGeometryData(geometry as Geometry, rotation, resolution);
    if (!geoData) {
        return [];
    }

    const styles = [];
    const {outlineSegments, midGap, dx, dy} = geoData;
    // 0 = east, π/2 = north, etc.
    const hostility = readHostility(feature);
    const echelon = feature.get('echelon') || TacticalGraphicEchelon.squad;

    // 6) build styles
    const outlineStyle = new Style({
        geometry: new MultiLineString(outlineSegments),
        stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH()}),
    });
    // Base layers
    styles.push(outlineStyle);
    const echelonStyles = createEchelonStyles(midGap, dx, dy, resolution, echelon, getColorByHostility(hostility), featureLabelScale(feature, resolution));
    styles.push(...echelonStyles);
    const crossTies = generateCrossTiesForPolygon(new MultiLineString(outlineSegments), resolution, getColorByHostility(hostility));
    styles.push(...crossTies);

    return styles;
}

/** Returns the echelon symbol's half-extent perpendicular to the segment, in screen pixels (unscaled). */
function getEchelonPerpExtentPx(echelon: TacticalGraphicEchelon): number {
    const dotRadiusPx = 5;
    const lineHalfPx = 10;
    switch (echelon) {
        case TacticalGraphicEchelon.squad:
        case TacticalGraphicEchelon.section:
        case TacticalGraphicEchelon.platoonDetachment:
            return dotRadiusPx;
        case TacticalGraphicEchelon.companyBatteryTroop:
        case TacticalGraphicEchelon.battalionSquadron:
        case TacticalGraphicEchelon.regimentGroup:
        case TacticalGraphicEchelon.brigade:
            return lineHalfPx;
        default:
            return dotRadiusPx;
    }
}

/** Returns the echelon symbol's half-extent along the segment, in screen pixels. */
function getEchelonHalfExtentPx(echelon: TacticalGraphicEchelon): number {
    const dotRadiusPx = 5;
    const spacingPx = 12;
    const lineHalfPx = 10;
    switch (echelon) {
        case TacticalGraphicEchelon.squad:
            return dotRadiusPx;
        case TacticalGraphicEchelon.section:
        case TacticalGraphicEchelon.platoonDetachment:
            return spacingPx + dotRadiusPx;
        case TacticalGraphicEchelon.companyBatteryTroop:
            return 0;
        case TacticalGraphicEchelon.battalionSquadron:
        case TacticalGraphicEchelon.regimentGroup:
            return spacingPx;
        case TacticalGraphicEchelon.brigade:
            return lineHalfPx * Math.cos(Math.PI / 4);
        default:
            return dotRadiusPx;
    }
}

function createEchelonStyles(mid: Coordinate, dx: number, dy: number, resolution: number, echelon: TacticalGraphicEchelon, color: string, echelonScale: number = 1): Style[] {
    const segLen = Math.hypot(dx, dy);
    if (!segLen) return [];

    // unit tangent (along segment) & normal (perp to segment)
    const ux = dx / segLen;
    const uy = dy / segLen;
    const nx = -uy;
    const ny = ux;

    // common sizes — scaled so the echelon grows with zoom like the labels
    const dotRadius = 5 * echelonScale;           // px (CircleStyle radius is in px)
    const spacingPx = 12 * echelonScale;
    const lineHalfPx = 10 * echelonScale;

    // convert to map units
    const spacing = spacingPx * resolution;
    const lineHalf = lineHalfPx * resolution;

    const fillStyle = new Fill({color});
    const strokeStyle = new Stroke({color, width: LINE_WIDTH()});

    const styles: Style[] = [];

    switch (echelon) {
        // single dot
        case TacticalGraphicEchelon.squad:
            styles.push(
                new Style({
                    geometry: new Point(mid),
                    image: new CircleStyle({radius: dotRadius, fill: fillStyle}),
                }),
            );
            break;

        // two dots along the segment
        case TacticalGraphicEchelon.section:
            [-1, 1].forEach(i => {
                const x = mid[0] + ux * spacing * i;
                const y = mid[1] + uy * spacing * i;
                styles.push(
                    new Style({
                        geometry: new Point([x, y]),
                        image: new CircleStyle({radius: dotRadius, fill: fillStyle}),
                    }),
                );
            });
            break;

        // three dots (-, center, +)
        case TacticalGraphicEchelon.platoonDetachment:
            [-1, 0, 1].forEach(i => {
                const x = mid[0] + ux * spacing * i;
                const y = mid[1] + uy * spacing * i;
                styles.push(
                    new Style({
                        geometry: new Point([x, y]),
                        image: new CircleStyle({radius: dotRadius, fill: fillStyle}),
                    }),
                );
            });
            break;

        // single perpendicular line
        case TacticalGraphicEchelon.companyBatteryTroop:
            styles.push(
                new Style({
                    geometry: new LineString([
                        [mid[0] - nx * lineHalf, mid[1] - ny * lineHalf],
                        [mid[0] + nx * lineHalf, mid[1] + ny * lineHalf],
                    ]),
                    stroke: strokeStyle,
                }),
            );
            break;

        // two parallel perpendicular lines
        case TacticalGraphicEchelon.battalionSquadron:
            [-1, 1].forEach(i => {
                // offset along segment, then draw perp line
                const cx = mid[0] + ux * spacing * i;
                const cy = mid[1] + uy * spacing * i;
                styles.push(
                    new Style({
                        geometry: new LineString([
                            [cx - nx * lineHalf, cy - ny * lineHalf],
                            [cx + nx * lineHalf, cy + ny * lineHalf],
                        ]),
                        stroke: strokeStyle,
                    }),
                );
            });
            break;

        // three parallel perpendicular lines
        case TacticalGraphicEchelon.regimentGroup:
            [-1, 0, 1].forEach(i => {
                const cx = mid[0] + ux * spacing * i;
                const cy = mid[1] + uy * spacing * i;
                styles.push(
                    new Style({
                        geometry: new LineString([
                            [cx - nx * lineHalf, cy - ny * lineHalf],
                            [cx + nx * lineHalf, cy + ny * lineHalf],
                        ]),
                        stroke: strokeStyle,
                    }),
                );
            });
            break;

        // X shape: two crossing lines (segment & its normal)
        case TacticalGraphicEchelon.brigade: {
            const angle = Math.PI / 4; // 45°
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // rotate tangent by +45°
            const vx1 = ux * cos - uy * sin;
            const vy1 = ux * sin + uy * cos;
            // rotate tangent by -45°
            const vx2 = ux * cos + uy * sin;
            const vy2 = -ux * sin + uy * cos;

            styles.push(
                new Style({
                    geometry: new LineString([
                        [mid[0] - vx1 * lineHalf, mid[1] - vy1 * lineHalf],
                        [mid[0] + vx1 * lineHalf, mid[1] + vy1 * lineHalf],
                    ]),
                    stroke: strokeStyle,
                }),
            );
            styles.push(
                new Style({
                    geometry: new LineString([
                        [mid[0] - vx2 * lineHalf, mid[1] - vy2 * lineHalf],
                        [mid[0] + vx2 * lineHalf, mid[1] + vy2 * lineHalf],
                    ]),
                    stroke: strokeStyle,
                }),
            );
            break;
        }

        default:
            // fallback to single dot
            styles.push(
                new Style({
                    geometry: new Point(mid),
                    image: new CircleStyle({radius: dotRadius, fill: fillStyle}),
                }),
            );
    }

    return styles;
}

export function battlePositionStyleFunction(labels: GraphicLabels, feature: FeatureLike, resolution: number): Style[] {
    const geometry = feature.getGeometry();
    // Default to π/2 so the echelon sits on the southernmost segment.
    // getGraphicGeometryData uses the inward normal, so pointing north (π/2) selects the south-facing edge.
    const rotation: number = feature.get('rotation') ?? Math.PI / 2;
    const geoData = getGraphicGeometryData(geometry as Geometry, rotation, resolution);
    if (!geoData) {
        return [];
    }

    const hostility = readHostility(feature);
    const echelon = feature.get('echelon') || TacticalGraphicEchelon.squad;
    const {outlineSegments, midGap, dx, dy} = geoData;

    const isPlanned = labels.status === TacticalGraphicStatus.planned;

    // 6) build styles
    const outlineStyle = new Style({
        geometry: new MultiLineString(outlineSegments),
        stroke: new Stroke({
            color: getColorByHostility(hostility),
            width: LINE_WIDTH(),
            lineDash: isPlanned ? [12, 8] : undefined
        }),
    });

    const echelonStyles = createEchelonStyles(midGap, dx, dy, resolution, echelon, getColorByHostility(hostility), featureLabelScale(feature, resolution));

    return [outlineStyle, ...echelonStyles];
}

/**
 * The four affiliation colours, straight from FM 1-02.2. One set, used in every mode —
 * see the palette note above `getDefaultLineColor` for why there is no longer a second.
 *
 * A host re-tints these through `configureTacticalGraphics({hostilityColors})` rather
 * than by editing this table.
 */
const HOSTILITY_COLORS = {
    friend: 'rgba(0, 0, 255, 1)',
    hostile: 'rgba(255, 0, 0, 1)',
    neutral: 'rgba(0, 128, 0, 1)',
    pending: 'rgba(255, 255, 0, 1)',
} as const;

/**
 * Affiliations that draw as another one. Doctrine gives assumed-friend the friendly
 * blue and suspect/joker the pending yellow, so an override on the affiliation a host
 * actually thinks about (`friend`, `pending`) carries to its alias without their having
 * to name both. An override on the alias itself still wins, for a host that wants them
 * distinguishable.
 */
const HOSTILITY_ALIASES: Partial<Record<TacticalGraphicHostility, TacticalGraphicHostility>> = {
    [TacticalGraphicHostility.assumedFriend]: TacticalGraphicHostility.friend,
    [TacticalGraphicHostility.suspectJoker]: TacticalGraphicHostility.pending,
};

/**
 * The doctrinal FM 1-02.2 colour for an affiliation, **ignoring any config override**.
 * `undefined` for `unknown`, whose colour is `getDefaultLineColor()` rather than an
 * affiliation colour of its own.
 *
 * Exported because it is a *pure* answer to "what would this be with no override" —
 * something a settings UI needs and cannot get from `getColorByHostility`, which reads
 * the live config. Reading the live config to render a control that edits the live
 * config renders one frame stale: clearing an override re-renders before the host has
 * republished, so the cleared value is still what comes back.
 */
export function getDoctrinalHostilityColor(hostility: TacticalGraphicHostility): string | undefined {
    switch (HOSTILITY_ALIASES[hostility] ?? hostility) {
        case TacticalGraphicHostility.friend:
            return HOSTILITY_COLORS.friend;
        case TacticalGraphicHostility.hostileFaker:
            return HOSTILITY_COLORS.hostile;
        case TacticalGraphicHostility.neutral:
            return HOSTILITY_COLORS.neutral;
        case TacticalGraphicHostility.pending:
            return HOSTILITY_COLORS.pending;
        default:
            return undefined;
    }
}

export const getColorByHostility = (hostility: TacticalGraphicHostility): string => {
    const canonical = HOSTILITY_ALIASES[hostility] ?? hostility;
    const override = getHostilityColorOverride(hostility) ?? getHostilityColorOverride(canonical);
    if (override) return override;

    return getDoctrinalHostilityColor(hostility) ?? getDefaultLineColor();
};

function withOpacity(color: string, alpha: number): string {
    // rgb()/rgba()
    const rgb = color.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/,
    );
    if (rgb) {
        const [, r, g, b] = rgb;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // #rgb / #rgba / #rrggbb / #rrggbbaa — the default line color is hex, so
    // hatch/fill helpers that tint it must handle this form too.
    const hex = color.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
        let h = hex[1];
        if (h.length <= 4) h = h.split('').map(c => c + c).join(''); // #rgb(a) → #rrggbb(aa)
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    console.warn('Unrecognized color for withOpacity:', color);
    return color;
}

export function createDiagonalHatchPattern(
    hostility: TacticalGraphicHostility,
    size: number = 8,
    lineWidth: number = 1,
): CanvasPattern {

    let hostilityColor = getColorByHostility(hostility);
    let color = withOpacity(hostilityColor, .25);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();

    return ctx.createPattern(canvas, 'repeat')!;
}

/**
 * The obstacle areas: belt, group and zone wear their teeth outward, the free and
 * restricted areas inward, and the restricted area alone carries a hatch fill.
 *
 * The geometry is the plain drawn ring — the crenellation is added here, in screen
 * pixels. @see obstacleRing
 */
export function obstacleAreaStyles(feature: FeatureLike, resolution: number, opts: {outward: boolean, hatched?: boolean}): Style[] {
    const geometry = feature.getGeometry();
    if (!(geometry instanceof Polygon)) return [];

    const hostility = readHostility(feature);
    const color = getColorByHostility(hostility);
    const toothed = geometry.getCoordinates().map(ring => obstacleRing(ring, resolution, opts.outward));

    return [new Style({
        geometry: new Polygon(toothed),
        stroke: new Stroke({color, width: LINE_WIDTH()}),
        fill: opts.hatched ? new Fill({color: createDiagonalHatchPattern(hostility, 8, 1)}) : undefined,
    })];
}

export function obstacleRestrictedZoneStyle(feature: FeatureLike, resolution: number) {
    return obstacleAreaStyles(feature, resolution, {outward: false, hatched: true});
}

/**
 * The fortified area: square merlons standing outward off the drawn ring, in screen
 * pixels. Same reasoning as the obstacle teeth, same winding correction — outward is a
 * property of the ring, not of the order its corners were clicked.
 */
export function fortifiedAreaStyle(feature: FeatureLike, resolution: number): Style[] {
    const geometry = feature.getGeometry();
    if (!(geometry instanceof Polygon)) return [];

    const scale = decorationScale(geometry.getCoordinates()[0], true, resolution, FORTIFIED_HEIGHT_PX);
    const merlonMap = FORTIFIED_MERLON_PX * scale * resolution;
    const crenelMap = FORTIFIED_CRENEL_PX * scale * resolution;
    const heightMap = FORTIFIED_HEIGHT_PX * scale * resolution;

    const rings = geometry.getCoordinates().map(ring =>
        castellatedPath(ring, merlonMap, crenelMap, heightMap, ringIsClockwise(ring) ? 1 : -1));

    return [new Style({
        geometry: new Polygon(rings),
        stroke: new Stroke({color: readHostilityColor(feature), width: LINE_WIDTH()}),
    })];
}

// FreeFireAreaCircular: present = solid stroke with no fill; planned = dashed
// stroke with diagonal hatch fill. Mirrors the polygon FFA rendering so all
// three FFA variants read the same when their status is set.
export function freeFireAreaCircularStyleFunc(): StyleFunction {
    return (f, resolution) => freeFireAreaCircularStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function freeFireAreaCircularStyleFromLabels(labels: GraphicLabels): StyleFunction {
    return (feature) => {
        const color = readHostilityColor(feature);
        const hostility = readHostility(feature);
        const isPlanned = labels.status === TacticalGraphicStatus.planned;
        const hatchPattern = isPlanned ? createDiagonalHatchPattern(hostility, 8, 1) : undefined;

        return new Style({
            fill: hatchPattern ? new Fill({color: hatchPattern}) : undefined,
            stroke: new Stroke({
                color,
                width: LINE_WIDTH(),
                lineDash: isPlanned ? [12, 8] : undefined,
            }),
        });
    };
}

export function groupOrSeriesOfTargetsGraphicStyle(
    labels: GraphicLabels,
    feature: FeatureLike,
    resolution: number,
): Style[] {
    const geom = feature.getGeometry();
    if (!(geom instanceof Polygon)) return [];
    const ring = geom.getCoordinates()[0];
    if (!ring || ring.length < 2) return [];

    const color = readHostilityColor(feature);
    const isPlanned = labels.status === TacticalGraphicStatus.planned;
    const stroke = new Stroke({
        color,
        width: LINE_WIDTH(),
        lineDash: isPlanned ? [12, 8] : undefined,
    });

    let bestIdx = 0;
    let bestMidY = -Infinity;
    for (let i = 0; i < ring.length - 1; i++) {
        const midY = (ring[i][1] + ring[i + 1][1]) / 2;
        if (midY > bestMidY) {
            bestMidY = midY;
            bestIdx = i;
        }
    }

    const styles: Style[] = [];
    const labelText = (labels.label ?? '').trim();
    const scale = featureLabelScale(feature, resolution);
    const labelWidthPx = labelText ? getTextWidth(labelText, fontStyle, scale) : 0;
    const gapHalfMap = labelText ? (labelWidthPx / 2 + 6) * resolution : 0;

    for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        if (i === bestIdx && gapHalfMap > 0) {
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const segLen = Math.hypot(dx, dy);
            if (segLen > 2 * gapHalfMap) {
                const ux = dx / segLen, uy = dy / segLen;
                const mx = (a[0] + b[0]) / 2;
                const my = (a[1] + b[1]) / 2;
                const gapStart: Coordinate = [mx - ux * gapHalfMap, my - uy * gapHalfMap];
                const gapEnd: Coordinate = [mx + ux * gapHalfMap, my + uy * gapHalfMap];
                styles.push(new Style({geometry: new LineString([a, gapStart]), stroke}));
                styles.push(new Style({geometry: new LineString([gapEnd, b]), stroke}));
                continue;
            }
        }
        styles.push(new Style({geometry: new LineString([a, b]), stroke}));
    }
    return styles;
}

export function limitedAccessAreaStyleFunc(feature: FeatureLike, resolution: number): Style {
    return limitedAccessAreaStyleFromLabels(readGraphicLabels(feature), feature, resolution);
}

function limitedAccessAreaStyleFromLabels(labels: GraphicLabels, feature: FeatureLike, resolution: number): Style {
    const color = readHostilityColor(feature);
    const isPlanned = labels.status === TacticalGraphicStatus.planned;

    const pattern = createDiagonalHatchPattern(
        TacticalGraphicHostility.unknown,
        16,
        2                    // hatch thickness
    );

    return new Style({
        fill: new Fill({
            color: pattern ?? 'rgba(0,0,0,0)',
        }),
        stroke: new Stroke({
            color,
            width: LINE_WIDTH(),
            lineDash: isPlanned ? [12, 8] : undefined,
        }),
    });
}

export function getStyle(name: TacticalGraphicName, feature: FeatureLike, resolution: number) {
    return getStyleFromLabels(name, readGraphicLabels(feature), feature, resolution);
}

function getStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels, feature: FeatureLike, resolution: number) {
    if (name === TacticalGraphicName.StrongPoint) return railroadStyleFunction(feature, resolution);
    if (name === TacticalGraphicName.BattlePosition) return battlePositionStyleFunction(labels, feature, resolution);
    if (name === TacticalGraphicName.UnexplodedExplosiveOrdnanceArea) return unexplodedExplosiveOrdenanceStyle(feature, resolution);
    if (name === TacticalGraphicName.Encirclement) return encirclementGraphicStyle(feature, resolution);
    if (name === TacticalGraphicName.ObstacleRestrictedArea) return obstacleRestrictedZoneStyle(feature, resolution);
    if (name === TacticalGraphicName.ObstacleFreeArea) return obstacleAreaStyles(feature, resolution, {outward: false});
    if (name === TacticalGraphicName.FortifiedArea) return fortifiedAreaStyle(feature, resolution);
    if (
        name === TacticalGraphicName.ObstacleBelt ||
        name === TacticalGraphicName.ObstacleGroup ||
        name === TacticalGraphicName.ObstacleZone
    ) return obstacleAreaStyles(feature, resolution, {outward: true});
    if (name === TacticalGraphicName.LimitedAccessArea) return limitedAccessAreaStyleFromLabels(labels, feature, resolution);
    if (
        name === TacticalGraphicName.NoFireAreaCircular ||
        name === TacticalGraphicName.NoFireAreaIrregular ||
        name === TacticalGraphicName.NoFireAreaRectangular ||
        name === TacticalGraphicName.WeaponsFreeZone
    ) return limitedAccessAreaStyleFromLabels(labels, feature, resolution);
    if (name === TacticalGraphicName.GroupOrSeriesOfTargets) {
        return groupOrSeriesOfTargetsGraphicStyle(labels, feature, resolution);
    }
    // ✅ Pull hostility-based color if available
    let color = readHostilityColor(feature);

    const isPlanned = labels.status === TacticalGraphicStatus.planned;

    return new Style({
        stroke: new Stroke({
            color: color,
            width: LINE_WIDTH(),
            lineDash: isPlanned ? [12, 8] : undefined,
        }),
    });
}

export function encirclementGraphicStyle(feature: FeatureLike, resolution: number): Style[] | Style {
    const hostility = readHostility(feature);
    let geom = feature.getGeometry();
    let styles = [
        new Style({
            stroke: new Stroke({
                color: getColorByHostility(hostility),
                width: LINE_WIDTH(),
            }),
        }),
    ];

    if (!geom || !(geom instanceof GeometryCollection)) {
        return styles;
    }

    let geometries = geom.getGeometries();

    geometries.forEach((geom) => {
        if (!(geom instanceof MultiPoint)) return;

        if (hostility === TacticalGraphicHostility.hostileFaker) {
            styles.push(
                new Style({
                        geometry: new MultiPoint(geom.getCoordinates()),
                        text: new Text({
                            text: 'ENY',
                            font: fontStyle,
                            // Was getColorByHostility(unknown), which resolves to
                            // the same #000000 by a confusing route. ENY is an
                            // amplifier, and amplifiers are black.
                            fill: new Fill({color: getLabelFillColor()}),
                            placement: 'point',
                            scale: featureLabelScale(feature, resolution),
                        }),
                    },
                ));
        }

    });

    return styles;

}

// --- CONFIGURATION CONSTANTS ---
const GAP_WIDTH_PX = 40; // The desired width (in screen pixels) for each text gap

/**
 * Generates an array of OpenLayers styles for a polygon feature
 * with two text-labeled gaps along the most outward-facing segment.
 *
 * @param {import('ol/Feature').default} feature The feature to style.
 * @param {number} resolution The current map resolution.
 * @param {number[]} rotation The unit vector [dx, dy] representing the 'outward' direction.
 * @param {(hostility: string) => string} getColorByHostility Function to get color.
 * @returns {Style[]} An array of Style objects.
 */
function unexplodedExplosiveOrdenanceStyle(feature: FeatureLike, resolution: number) {
// 1) Get the main ring coordinates
    const geometry = feature.getGeometry() as Polygon;
    const ring = geometry.getCoordinates()[0];

    if (ring.length < 3) return [];

    let rotation = feature.get('rotation') || 0;

    const unitRot = [Math.cos(rotation), Math.sin(rotation)];
    const color = readHostilityColor(feature);
    const gapMapUnits = GAP_WIDTH_PX * resolution;

    // --- NEW LOGIC: FINDING OPPOSITE SEGMENTS ---
    let maxProjection = -Infinity;
    let minProjection = Infinity;
    let maxIndex = -1;
    let minIndex = -1;

    // 2) Iterate over all segments to find the ones defining the extent along the rotation axis
    for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];

        // Midpoint of the segment
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        // Projection of the midpoint onto the rotation axis
        // This tells us how far "out" this segment is along the rotation vector
        const projection = midX * unitRot[0] + midY * unitRot[1];

        if (projection > maxProjection) {
            maxProjection = projection;
            maxIndex = i;
        }
        if (projection < minProjection) {
            minProjection = projection;
            minIndex = i;
        }
    }

    // Ensure we found two distinct segments
    if (maxIndex === minIndex || maxIndex === -1 || minIndex === -1) {
        // Fallback to a closed outline if opposite segments couldn't be found
        return [new Style({stroke: new Stroke({color: color, width: LINE_WIDTH()})})];
    }

    const segmentsToGap = [maxIndex, minIndex];
    const styles = [];
    const outlineSegments = [];

    // 3) Process each segment (maxIndex and minIndex) to create the gap and label
    for (let i = 0; i < ring.length - 1; i++) {
        const p1 = ring[i];
        const p2 = ring[i + 1];
        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        if (segmentsToGap.includes(i)) {
            // This is one of the two segments where we need a gap and a label

            // Gap placement calculation (centered gap)
            if (segLen < gapMapUnits) {
                // Segment is too short, just add the full segment to the outline
                outlineSegments.push([p1, p2]);
                continue;
            }

            // Calculate the fraction (t-value) for the start and end of the gap
            const centerT = 0.5; // Center of the segment
            const halfGapRatio = (gapMapUnits / 2) / segLen;

            const tStart = centerT - halfGapRatio;
            const tEnd = centerT + halfGapRatio;

            const tCenter = centerT; // Label is exactly at the midpoint

            // Calculate the coordinates for the break points and the label
            const breakPoint = (t: number) => [p1[0] + dx * t, p1[1] + dy * t];

            const gapStart = breakPoint(tStart);
            const gapEnd = breakPoint(tEnd);
            const labelCoord = breakPoint(tCenter);

            // Add the two line pieces around the gap
            outlineSegments.push(
                [p1, gapStart], // Piece before the gap
                [gapEnd, p2],    // Piece after the gap
            );

            // Create the label style
            const labelStyle = new Style({
                geometry: new Point(labelCoord),
                text: new Text({
                    text: 'UXO',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: getHaloStroke(),
                    placement: 'point',
                    scale: featureLabelScale(feature, resolution),
                }),
            });
            styles.push(labelStyle);

        } else {
            // This is a normal perimeter segment, just add it to the outline
            outlineSegments.push([p1, p2]);
        }
    }

    // 4) Create the final perimeter style
    const outlineStyle = new Style({
        geometry: new MultiLineString(outlineSegments),
        stroke: new Stroke({color: color, width: LINE_WIDTH()}),
    });
    styles.push(outlineStyle);

    return styles;
}



/**
 * Renders all text labels for an airspace coordination area as a single
 * multiline Text style anchored at the polygon's interior point.
 *
 * Using one Text object (with \n separators) lets OL manage line spacing
 * automatically, so the block scales correctly at every zoom level.
 * Fixed per-line offsetY values were removed because they only worked at
 * one scale; the blank separator between the name block and the alt/time
 * block is achieved with an empty string line.
 */
export function createAirCoordinatingAreaLabelStyle(
    feature: FeatureLike,
    identifier: string,
    labels: GraphicLabels,
    resolution: number,
    hasHatchPattern: boolean
): Style[] {
    const anchorPoint = feature.getGeometry() as Point;
    const scale = featureLabelScale(feature, resolution);

    // ── Name / identifier block ───────────────────────────────────────────────
    const nameLines: string[] = [];
    if (identifier?.trim()) nameLines.push(identifier.trim());
    if (labels.label?.trim()) nameLines.push(labels.label.trim());

    // ── Alt / time block — pad label to 11 chars for rough column alignment ───
    const altLines: string[] = [];
    if (labels.minAltitude) altLines.push(`${'MIN ALT:'.padEnd(11)}${labels.minAltitude}`);
    if (labels.maxAltitude) altLines.push(`${'MAX ALT:'.padEnd(11)}${labels.maxAltitude}`);
    if (labels.startDate)   altLines.push(`${'TIME FROM:'.padEnd(11)}${labels.startDate}`);
    if (labels.endDate)     altLines.push(`${'TIME TO:'.padEnd(11)}${labels.endDate}`);

    // Blank separator line between the two blocks (per MIL-STD-2525E layout)
    const allLines = (nameLines.length > 0 && altLines.length > 0)
        ? [...nameLines, '', ...altLines]
        : [...nameLines, ...altLines];

    if (allLines.length === 0) return [];

    // Measure the widest line so we can shift the left-aligned block to center it.
    // offsetX moves the anchor to the left edge of the block; the block then
    // extends rightward by maxLineWidth*scale, keeping it centered overall.
    const ctx = measureCtx();
    ctx.font = fontStyle;
    const maxLineWidth = Math.max(...allLines.map(l => l ? ctx.measureText(l).width : 0));
    const offsetX = -(maxLineWidth * scale) / 2;

    return [new Style({
        geometry: anchorPoint,
        text: new Text({
            text: allLines.join('\n'),
            font: fontStyle,
            fill: new Fill({color: getLabelFillColor()}),
            stroke: getHaloStroke(),
            padding: hasHatchPattern ? [4, 8, 4, 8] : undefined,
            textAlign: 'left',
            textBaseline: 'middle',
            offsetX,
            scale,
        }),
    })];
}

// Full style function that can be assigned to a layer or feature
export function airCoordinatingAreaStyleFunc(identifier: string, labels: GraphicLabels, hasHatchPattern: boolean): StyleFunction {
    return (feature, resolution) => {
        // Fallback Polygon Style (optional, but good practice)
        const isPlanned = labels.status === TacticalGraphicStatus.planned;
        const polygonStyle = new Style({
            // Fixed literals, and not chrome: this is the graphic's own line work. See
            // the palette note above `getDefaultLineColor`.
            fill: new Fill({
                color: 'rgba(255, 100, 100, 0.4)',
            }),
            stroke: new Stroke({
                color: 'rgb(255, 50, 50)',
                width: LINE_WIDTH(),
                lineDash: isPlanned ? [12, 8] : undefined,
            }),
        });

        // Generate label styles
        const labelStyles = createAirCoordinatingAreaLabelStyle(feature, identifier, labels, resolution, hasHatchPattern);

        // Return the base polygon style and all the generated label styles
        return [polygonStyle, ...labelStyles];
    };
}

export function getTextWidth(text: string, font: string, scale: number): number {
    const ctx = measureCtx();
    ctx.font = font; // e.g. "bold 12px sans-serif"
    const metrics = ctx.measureText(text);
    return metrics.width * scale;
}