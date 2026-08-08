import {Map, View} from 'ol';
import TileLayer from 'ol/layer/Tile';
import Feature, {FeatureLike} from 'ol/Feature';
import {Fill, Stroke, Style, Text} from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import { Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, Point, Polygon} from 'ol/geom';
import {Coordinate} from 'ol/coordinate';
import {defaults, ScaleLine} from 'ol/control';
import {StyleFunction} from 'ol/style/Style';
// The wire and anti-tank tables moved with their paint functions — they describe
// what those symbols *are*, and `obstaclePaints.ts` reads them directly now.
import {geometryService, BAR_SYMBOL_DASHES} from '@zaes/tactical-graphics';
import {
    getLabel,
    TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicName,
    TacticalGraphicStatus,
} from '@zaes/tactical-graphics';
import {GraphicLabels} from '../../utils/graphicLinkRegistry';
import {assignRole, readGraphicLabels} from './graphicProperties';
import {svgToOpenLayersGeometry} from '../../utils/svgToGeoJson';
import {BASE_FONT_SIZE_PX, getDefaultLabelSize} from '@zaes/tactical-graphics';
/**
 * The colour table, the line weight and the three label-scale formulas now live in the
 * map-agnostic half (`core/symbology.ts`) — none of them mentions OpenLayers, and a
 * second renderer that cannot reach them has to reinvent the palette and then drift from
 * it. Imported here and re-exported below, so this module's public surface is unchanged
 * and there is exactly one implementation of each.
 *
 * The three scale functions are aliased on import because this module exports
 * feature-reading wrappers of the same names.
 */
import {
    graphicLabelScale as graphicLabelScaleOf,
    labelScale as labelScaleOf,
    ratioLockedLabelScale as ratioLockedLabelScaleOf,
} from '@zaes/tactical-graphics';
import {
    CAP_HEIGHT_FRACTION,
    HALO_WIDTH,
    LINE_WIDTH,
    RATIO_LOCKED_LABEL_FONT,
    RATIO_LOCKED_LABEL_FONT_PX,
    RATIO_LOCKED_LABEL_FRACTION,
    fontStyle,
    getColorByHostility,
    getDefaultLineColor,
    getDoctrinalHostilityColor,
    getDrawMarkerColor,
    getDrawMarkerOutlineColor,
    getHandleColor,
    getInertHandleColor,
    getLabelFillColor,
    getLabelHaloColor,
    labelZoomMultiplier,
    maxGraphicLabelScale,
    withOpacity,
} from '@zaes/tactical-graphics';

export {
    CAP_HEIGHT_FRACTION,
    HALO_WIDTH,
    LINE_WIDTH,
    RATIO_LOCKED_LABEL_FONT,
    RATIO_LOCKED_LABEL_FONT_PX,
    RATIO_LOCKED_LABEL_FRACTION,
    fontStyle,
    getColorByHostility,
    getDefaultLineColor,
    getDoctrinalHostilityColor,
    getDrawMarkerColor,
    getDrawMarkerOutlineColor,
    getHandleColor,
    getInertHandleColor,
    getLabelFillColor,
    getLabelHaloColor,
    labelZoomMultiplier,
    maxGraphicLabelScale,
};
import {OSM} from 'ol/source';
import {isEmpty} from '../../utils/isEmpty';
/**
 * The ported style functions, and the adapter that renders their output here.
 *
 * A ported function is deleted from this file and replaced by a one-line
 * `asStyleFunction(...)` wrapper, so there is exactly one implementation and the
 * ~1,600 tests that assert on this module's output become parity tests for it.
 * @see paintToOpenLayers.ts
 */
import {
    antiTankDitchPaint,
    arcMissionTaskPaint,
    airCorridorLabelPaint,
    airCorridorPaint,
    directionArrowPaint,
    finalProtectiveFirePaint,
    linearSmokeTargetPaint,
    linearTargetPaint,
    areaFillPaint,
    areaLabelStackPaint,
    groupOrSeriesOfTargetsLabelPaint,
    positionAreaArtilleryLabelPaint,
    fortifiedLinePaint,
    smokeObscurantLabelPaint,
    wireObstaclePaint,
    zoneLabelPaint,
    areaOutlinePaint,
    defaultLinePaint,
    encirclementPaint,
    fortifiedAreaPaint,
    groupOrSeriesOfTargetsPaint,
    limitedAccessAreaPaint,
    obstacleAreaPaint,
    obstacleLinePaint,
    phaseLinePaint,
    routeControlMeasurePaint,
} from '@zaes/tactical-graphics';
import {asStyleFunction} from './paintToOpenLayers';
// Moved to its own leaf module so `paintToOpenLayers` can share it without an
// import cycle back through this file. Re-exported: it is public API.
import {getTextWidth} from './textMeasure';
export {getTextWidth};

const centerCoordinates = [0, 0];

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
 * Zoom-anchored label scale — the default, and the one that does **not** react to a
 * resize. Reads `drawingResolution` off the feature and hands the formula to the
 * map-agnostic `labelScale`.
 */
export function featureLabelScale(feature: FeatureLike, resolution: number): number {
    return labelScaleOf(feature.get('drawingResolution') as number | undefined, resolution);
}

/**
 * Size-proportional label scale: grows with both user resize and zoom-in. Requires
 * the feature to stamp `graphicSize`; falls back to `featureLabelScale` otherwise.
 */
export function featureGraphicLabelScale(feature: FeatureLike, resolution: number): number {
    return graphicLabelScaleOf(
        feature.get('graphicSize') as number | undefined,
        feature.get('drawingResolution') as number | undefined,
        resolution,
    );
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
/**
 * A distance for a user to read, from metres.
 *
 * Metres below a kilometre — a 400 m radius shown as "0.4 km" is both harder to read and
 * less precise than the number it came from. Above that, kilometres: one decimal while
 * the figure is small enough for it to mean something, whole numbers beyond 10 km where
 * it is noise.
 *
 * Exported so the measure line and the properties dialog cannot drift apart; they are
 * reporting the same quantity and a user will compare them.
 */
export const formatDistance = (metres: number): string => {
    if (metres < 1000) return `${Math.round(metres)} m`;
    const km = metres / 1000;
    return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
};

/**
 * The radius read-out shown while a circular graphic is drawn or resized: a hashed line
 * from centre to edge with the radius in km on it.
 *
 * Editor chrome, not symbology — `role: 'handle'` keeps it out of `serializeTacticalGraphics`
 * and out of anything that counts rendered graphics. It draws only when the holder has put
 * a geometry on it, and the holder clears that when the gesture ends, so it never appears
 * in the sample gallery or a restored map.
 *
 * Dashes are in screen pixels via `resolution`, so the hatching stays the same density at
 * every zoom. The distance is measured in EPSG:3857 metres — Euclidean, no turf.
 */
export const createMeasureFeature = () => {
    const feature = new Feature();
    assignRole(feature, 'handle');
    feature.set('measure', true);

    feature.setStyle(f => {
        const geom = f.getGeometry() as LineString | undefined;
        const coords = geom?.getCoordinates();
        if (!coords || coords.length < 2) return new Style({});

        const [a, b] = coords;
        const text = formatDistance(Math.hypot(b[0] - a[0], b[1] - a[1]));

        // `placement: 'line'` lays the text along the geometry, so it picks up the
        // line's own angle and stays upright-relative to it as the user swings the
        // handle around — no rotation to compute, and none to keep in step.
        // `lineDash` is in canvas pixels, so the hatching holds its density at any zoom.
        return new Style({
            // The inert-handle colour: this is a passive read-out, the same class of
            // chrome as the centre dot you cannot drag — not a live handle.
            stroke: new Stroke({color: getInertHandleColor(), width: LINE_WIDTH(), lineDash: [8, 6]}),
            text: new Text({
                text,
                font: fontStyle,
                placement: 'line',
                // The label colour, not the handle colour: this reads as an amplifier on
                // the graphic, and a host that re-themes its labels expects this to move
                // with them. @see getLabelFillColor
                fill: new Fill({color: getLabelFillColor()}),
                stroke: getHaloStroke(),
                textBaseline: 'bottom',
                offsetY: -4,
            }),
        });
    });
    return feature;
};

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
 * ## The air-coordinating corridors — ported
 *
 * `formatWidthAmplifier`, the ACP label-fitting scale and both style functions
 * moved to `symbology/corridorPaints.ts`. Nothing about a corridor's layout is an
 * OpenLayers fact; these are the adapters over the shared implementation.
 */

/** **Ported.** @see corridorPaints.ts, `airCorridorLabelPaint`. */
export function airCoordinatingCorridorStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(airCorridorLabelPaint(name), name);
}

/**
 * **Ported.** @see corridorPaints.ts, `airCorridorPaint`.
 *
 * Takes a resolution it does not use, because the holder calls it with the feature
 * alone. The paint function needs a context, so one is built from a nominal value;
 * nothing in the corridor's line work is resolution-dependent.
 */
export const airCorridorCircleStyleFunc = (feature: FeatureLike, resolution = 1) =>
    asStyleFunction(airCorridorPaint())(feature, resolution);


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
/**
 * **Ported.** The body lives in `tacticalgraphics/symbology/paintFunctions.ts` and
 * this is the OpenLayers adapter over it, so the same implementation draws in both
 * renderers. @see paintToOpenLayers.ts for why the port works this way round.
 *
 * `phaseLineStyle` above is kept: it takes an already-formatted label string and
 * several other style functions call it directly.
 */
export function phaseLineStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(phaseLinePaint(name), name);
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

        // A flat 10 screen pixels a side — the same rule breach and bypass use.
        // It was `wingWidth * 0.35 + 5px`, off the arrowhead's metric span, so the
        // hole grew with the graphic while the "IN" stayed capped by
        // `maxGraphicLabelScale()`. @see envelopmentGraphicStyleFunc
        const GAP_PX = 10;
        const gapHalf = GAP_PX * resolution;
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
        // A flat 10 screen pixels a side — the same rule breach and bypass use.
        //
        // It used to be `wingWidth * 0.35 + 5px`, taken from the arrowhead's
        // wing-to-wing span. That span is metric, so the hole grew with the
        // graphic while the "E" is capped by `maxGraphicLabelScale()`: draw a
        // large envelopment and the gap ran away from the letter it was meant to
        // clear. A gap belongs to the label, not to the shape around it.
        const GAP_PX = 10;
        const gapHalf = GAP_PX * resolution;
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
/** Centreline of the arrow row nearest the route. */
/** Row-to-row pitch for the two-way pair. */
/** Clear space either side of the ALT word before its arrows start. */
/**
 * Shortest an alternating arm may be, head included. The plate draws each arm at
 * roughly two-thirds the width of the word between them, so a bare `ROUTE` — the
 * narrowest identifier there is — still gets an arm that reads as an arrow
 * rather than a head with a stub behind it.
 */
/** Shortest a traffic arrow may get when the identifier is short or empty. */


/** **Ported.** @see routePaints.ts, `routeControlMeasurePaint`. */
export function routeControlMeasureStyle(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(routeControlMeasurePaint(name), name);
}

/** **Ported.** @see paintFunctions.ts, `defaultLinePaint`. */
export function defaultLineStyle(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(defaultLinePaint(name), name);
}


/** **Ported.** @see linearTargetPaints.ts. */
export function linearTargetStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(linearTargetPaint(name), name);
}

/** **Ported.** @see linearTargetPaints.ts. */
export function linearSmokeTargetStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(linearSmokeTargetPaint(name), name);
}

/** **Ported.** @see linearTargetPaints.ts. */
export function finalProtectiveFireStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(finalProtectiveFirePaint(), name);
}

/**
 * ProbableLineOfDeployment is always dashed (present and anticipated), and carries
 * no date-time group. **Ported.** @see paintFunctions.ts, `defaultLinePaint`.
 */
export function probableLineOfDeploymentStyleFunc(): StyleFunction {
    const name = TacticalGraphicName.ProbableLineOfDeployment;
    return asStyleFunction(defaultLinePaint(name, {alwaysDashed: true, showDates: false}), name);
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
        // A graphic in this family with no doctrinal letter — abatis — has nothing to
        // carve space for, and the bare padding left a visible nick in an otherwise
        // continuous route.
        const halfGapPx = label ? labelWidthPx / 2 + GAP_PADDING_PX : 0;
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

/**
 * Length of a solid arrowhead, in screen pixels.
 *
 * 15 is Fix's own head at its minimum draw: `FIX_TRIANGLE_WIDTH_RATIO` is `15/145`
 * and `LineGraphicBase` enforces a 145 px minimum first segment, so a freshly
 * drawn Fix has always carried a 15 px head. It is the one calibrated value among
 * the three solid heads, so the others adopt it.
 */
const SOLID_ARROWHEAD_PX = 15;

/**
 * The share of its graphic's on-screen length an arrowhead may occupy before it
 * starts shrinking with the shape.
 *
 * Much larger than `DECORATION_MAX_SHARE_OPEN`, and deliberately so. That share is
 * small because a tooth or a merlon **repeats** along the path, so one of them a
 * twentieth of the line long is already a lot of ink. An arrowhead appears once,
 * at the end, and a head a quarter of a short graphic still reads correctly — a
 * 5% cap would shrink it on any graphic under 300 px, which is most of them.
 */
const ARROWHEAD_MAX_SHARE = 0.25;

/**
 * Redraws a generator-emitted solid arrowhead at a fixed screen size.
 *
 * The generators build their heads in metres — Fix's off the drawn line's length,
 * Ferry crossing's off the dragged `size`, Turn's off the resolution at draw time
 * — so resizing the graphic resized the head, and Turn's swelled on screen as you
 * zoomed in. The head is a symbol, not part of the shape: it should hold one size.
 *
 * Kept in the style layer rather than re-derived into the geometry, per the house
 * rule that a zoom-invariant size is `px * resolution` computed at draw time. The
 * generators still emit their own heads, so a consumer reading the raw GeoJSON
 * gets a complete symbol — the same split `labelGapDegrees` uses.
 *
 * Scaled **about the tip**, because the tip is the meaningful point: it is where
 * the arrow lands, and the generator has already put it in the right place.
 *
 * Returns null when the head would fall under `DECORATION_MIN_PX`, letting the
 * plain geometry stand rather than drawing a smudge.
 */
function screenSizedArrowHead(head: Polygon, path: Coordinate[], resolution: number): Polygon | null {
    const ring = head.getCoordinates()[0];
    if (!ring || ring.length < 3) return null;
    const [tip, left, right] = ring;
    const baseMid: Coordinate = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
    const currentLength = Math.hypot(tip[0] - baseMid[0], tip[1] - baseMid[1]);
    if (currentLength === 0) return null;

    const availablePx = path.length >= 2 ? pathLength(path) / resolution : Infinity;
    const wantedPx = Math.min(SOLID_ARROWHEAD_PX, availablePx * ARROWHEAD_MAX_SHARE);
    if (wantedPx < DECORATION_MIN_PX) return null;

    const factor = (wantedPx * resolution) / currentLength;
    return new Polygon([ring.map(p =>
        [tip[0] + (p[0] - tip[0]) * factor, tip[1] + (p[1] - tip[1]) * factor] as Coordinate)]);
}

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



/** **Ported.** @see paintFunctions.ts, `obstacleLinePaint`. */
export function obstacleLineStyle(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(obstacleLinePaint(name), name);
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
        const color = readHostilityColor(f);
        const lineStroke = new Stroke({color, width: LINE_WIDTH(), lineDash: dashStyle(labels)});
        const geom = f.getGeometry();
        // One geometry-less style used to cover the whole collection. The two
        // arrowheads have to be drawn separately now so they can be re-sized to
        // screen pixels rather than following the dragged `size`.
        if (!(geom instanceof GeometryCollection)) {
            return new Style({fill: new Fill({color}), stroke: lineStroke});
        }
        const subs = geom.getGeometries();
        const line = subs.find(g => g instanceof LineString) as LineString | undefined;
        const path = line?.getCoordinates() ?? [];

        const styles: Style[] = [];
        for (const sub of subs) {
            if (sub instanceof Polygon) {
                const head = screenSizedArrowHead(sub, path, resolution);
                if (head) {
                    styles.push(new Style({
                        geometry: head,
                        fill: new Fill({color}),
                        stroke: new Stroke({color, width: LINE_WIDTH()}),
                    }));
                }
            } else {
                styles.push(new Style({geometry: sub, stroke: lineStroke}));
            }
        }
        return styles;
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
        const lineStroke = new Stroke({color, width: LINE_WIDTH(), lineDash: dashStyle(labels)});

        const geom = f.getGeometry();
        let lineCoords: Coordinate[] | undefined;
        if (geom instanceof GeometryCollection) {
            const subs = geom.getGeometries();
            const line = subs.find(g => g instanceof LineString) as LineString | undefined;
            lineCoords = line?.getCoordinates();
            // The arrowhead is drawn separately from the zigzag so it can hold a
            // screen size instead of following the drawn line's length.
            for (const sub of subs) {
                if (sub instanceof Polygon) {
                    const head = screenSizedArrowHead(sub, lineCoords ?? [], resolution);
                    if (head) {
                        styles.push(new Style({
                            geometry: head,
                            fill: new Fill({color}),
                            stroke: new Stroke({color, width: LINE_WIDTH()}),
                        }));
                    }
                } else {
                    styles.push(new Style({geometry: sub, stroke: lineStroke}));
                }
            }
        } else {
            styles.push(new Style({fill: new Fill({color}), stroke: lineStroke}));
            if (geom instanceof LineString) lineCoords = geom.getCoordinates();
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

/** **Ported.** @see paintFunctions.ts, `areaFillPaint`. */
export function defaultStyleFunc(): StyleFunction {
    return asStyleFunction(areaFillPaint());
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
/** **Ported.** @see obstaclePaints.ts, `fortifiedLinePaint`. */
export function fortifiedLineStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(fortifiedLinePaint(name), name);
}


/**
 * The nine wire obstacles: a stroked route carrying repeating marks, in screen pixels.
 *
 * The marks live here rather than in the geometry because they are a *decoration* — the
 * same reason the fortified merlons and the obstacle teeth do. They go through
 * `decorationScale`, so they shrink once they would swamp a short line and drop out
 * entirely below `DECORATION_MIN_PX`, leaving the plain wire behind.
 *
 * All the maths is Euclidean on EPSG:3857 metres. Nothing here may call turf.
 */

/**
 * The bar symbols: parallel leaning bars, dashed per the plate.
 *
 * Two graphics use it - the three demolition readiness states (a pair) and roadblock
 * complete (two overlapping crosses, four bars, all solid).
 *
 * `BAR_SYMBOL_DASHES` is the entire difference between the readiness states, and it lives
 * beside the generator so a second renderer reads the same table. Dashing cannot be
 * expressed in the geometry, which is why this is a style function at all: a
 * MultiLineString has one stroke for every part.
 */

/**
 * How far inside its notch an anti-tank mine is drawn, as a share of the largest disc that
 * would fit. Drawn to the limit the disc meets the two teeth bounding it, and with the
 * teeth filled the three merge into one black mass.
 */

/**
 * The three anti-tank ditches: triangular teeth along the drawn route, with a mine nested
 * in each notch on the reinforced state.
 *
 * Teeth are screen-sized and capped by `decorationScale`, like the wire marks and the
 * fortified merlons - so they hold their size at every zoom and drop out on a route too
 * short to carry them, leaving the bare line.
 *
 * They **touch**: consecutive bases share a corner, and the notch between two teeth is what
 * a mine sits in. The run is centred on the route and always starts and ends with a tooth,
 * because a mine with no tooth beside it has no notch to nest in.
 *
 * All the maths is Euclidean on EPSG:3857 metres. Nothing here may call turf.
 */
/** **Ported.** @see obstaclePaints.ts, `antiTankDitchPaint`. */
export function antiTankDitchStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(antiTankDitchPaint(name), name);
}

export function barSymbolStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry();
        if (!(geom instanceof MultiLineString)) return [];
        const bars = geom.getCoordinates();
        if (bars.length < 2) return [];

        const color = readHostilityColor(f);
        const dashed = BAR_SYMBOL_DASHES[name] ?? [];
        // Pixels, not map units. OL's lineDash is canvas pixels, so multiplying by
        // resolution made the dash [200, 140] px on a bar ~50 px long - the whole bar fell
        // inside one "on" segment and every state rendered solid. Matches dashStyle().
        const dash = [12, 8];

        return bars.map(
            (bar, i) =>
                new Style({
                    geometry: new LineString(bar),
                    stroke: new Stroke({color, width: LINE_WIDTH(), lineDash: dashed[i] ? dash : undefined}),
                }),
        );
    };
}

/** **Ported.** @see obstaclePaints.ts, `wireObstaclePaint`. */
export function wireObstacleStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(wireObstaclePaint(name), name);
}


/** Miter ceiling, so a hairpin bend pinches rather than growing a spike. */
const MAX_MITER = 4;


/** **Ported.** @see linePaints.ts, `directionArrowPaint`. */
export function directionArrowStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(directionArrowPaint(name), name);
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
            return asStyleFunction(areaLabelStackPaint(name), name);
        case TacticalGraphicName.PositionAreaArtilleryCircular:
        case TacticalGraphicName.PositionAreaArtilleryIrregular:
        case TacticalGraphicName.PositionAreaArtilleryRectangular:
            return asStyleFunction(positionAreaArtilleryLabelPaint(name), name);
        case TacticalGraphicName.ObstacleFreeArea:
        case TacticalGraphicName.ObstacleRestrictedArea:
            // "FREE" is a line of its own above the designation, not a `getLabel`
            // prefix — a prefix would set it beside the name, and the plate stacks it.
            return asStyleFunction(
                areaLabelStackPaint(name, {
                    before: name === TacticalGraphicName.ObstacleFreeArea ? ['FREE'] : [],
                }),
                name,
            );
        case TacticalGraphicName.FireSupportAreaIrregular:
            return asStyleFunction(areaLabelStackPaint(name), name);
        case TacticalGraphicName.FireSupportAreaRectangular:
        case TacticalGraphicName.FireSupportAreaCircular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular:
        case TacticalGraphicName.CriticalFriendlyZoneRectangular:
        case TacticalGraphicName.CriticalFriendlyZoneCircular:
        case TacticalGraphicName.CensorZoneRectangular:
        case TacticalGraphicName.CensorZoneCircular:
        case TacticalGraphicName.CallForFireZoneRectangular:
        case TacticalGraphicName.CallForFireZoneCircular:
        case TacticalGraphicName.DeadSpaceAreaRectangular:
        case TacticalGraphicName.DeadSpaceAreaCircular:
        case TacticalGraphicName.BlueKillBoxRectangular:
        case TacticalGraphicName.BlueKillBoxCircular:
        case TacticalGraphicName.PurpleKillBoxRectangular:
        case TacticalGraphicName.PurpleKillBoxCircular:
            // Prefix over name, centred; the two DTGs outside the bounding box's
            // upper-left. A rectangle's corner is a real vertex and a circle has none,
            // so the box is the right anchor for both.
            return asStyleFunction(zoneLabelPaint(name, false), name);
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular:
        case TacticalGraphicName.CriticalFriendlyZoneIrregular:
        case TacticalGraphicName.CensorZoneIrregular:
        case TacticalGraphicName.CallForFireZoneIrregular:
        case TacticalGraphicName.DeadSpaceAreaIrregular:
        case TacticalGraphicName.BlueKillBoxIrregular:
        case TacticalGraphicName.PurpleKillBoxIrregular:
            // Same layout, but the DTGs anchor on the real upper-left *vertex*: a
            // bounding-box corner can sit far outside an irregular shape.
            return asStyleFunction(zoneLabelPaint(name, true), name);
        case TacticalGraphicName.GroupOrSeriesOfTargets:
            return asStyleFunction(groupOrSeriesOfTargetsLabelPaint(name), name);
        case TacticalGraphicName.SmokeObscurant:
            return asStyleFunction(smokeObscurantLabelPaint(), name);
        case TacticalGraphicName.FreeFireAreaCircular:
        case TacticalGraphicName.FreeFireAreaIrregular:
        case TacticalGraphicName.FreeFireAreaRectangular:
        case TacticalGraphicName.RestrictiveFireAreaCircular:
        case TacticalGraphicName.RestrictiveFireAreaIrregular:
        case TacticalGraphicName.RestrictiveFireAreaRectangular:
        case TacticalGraphicName.LimitedAccessArea:
            return asStyleFunction(areaLabelStackPaint(name), name);
        default:
            return getAreaLabelFn(fullLabel, dateLabel);
    }
}

/**
 * The crossed runways, written as SVG path data in **map units** — so at scale 1
 * the symbol is a fixed ~400 km across, on every polygon and at every zoom.
 */
const AIRFIELD_SVG = `M -200000 0 L 200000 0 M -200000 -120000 L 200000 120000`;
/** Half-extents of the path above, in its own unscaled units. */
const AIRFIELD_HALF_W = 200000;
const AIRFIELD_HALF_H = 120000;
/**
 * Share of the area's shorter side the symbol spans. Matches the fit-to-polygon
 * cap the area's own text block uses, so symbol and text agree about how much
 * room a polygon offers.
 */
const AIRFIELD_FIT_SHARE = 0.8;

/**
 * Points along the two runway strokes, in unscaled path units, used to test the
 * symbol against the polygon outline. Endpoints alone are not enough: both arms
 * pass through the centre, so a notch can cut a stroke without containing either
 * of its ends.
 */
const AIRFIELD_SAMPLES: Coordinate[] = (() => {
    const segments: [Coordinate, Coordinate][] = [
        [[-AIRFIELD_HALF_W, 0], [AIRFIELD_HALF_W, 0]],
        [[-AIRFIELD_HALF_W, -AIRFIELD_HALF_H], [AIRFIELD_HALF_W, AIRFIELD_HALF_H]],
    ];
    const STEPS = 8;
    const pts: Coordinate[] = [];
    for (const [a, b] of segments) {
        for (let i = 0; i <= STEPS; i++) {
            const t = i / STEPS;
            pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
    }
    return pts;
})();

/**
 * Ray-cast point-in-polygon.
 *
 * Deliberately hand-rolled: a style function receives **projected EPSG:3857
 * metres**, and turf expects geographic degrees, so `booleanPointInPolygon`
 * would quietly give wrong answers here. @see conventions.md
 */
function pointInRing(pt: Coordinate, ring: Coordinate[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const straddles = (yi > pt[1]) !== (yj > pt[1]);
        if (straddles && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/**
 * How much to scale the crossed-runway symbol so it is proportional to the area
 * it marks rather than a fixed number of metres — a USA-sized airfield used to
 * carry the same ~400 km cross as a runway-sized one, which read as a tiny "x".
 *
 * Two stages, because the bounding box is not the polygon:
 *
 *  1. Fit the bounding box — the largest uniform scale keeping the cross within
 *     `AIRFIELD_FIT_SHARE` of the **shorter** side, so the 5:3 shape is kept.
 *  2. Shrink until it is inside the *actual* outline. Areas may be concave, and
 *     a bounding-box fit will happily push an arm out through the notch of an
 *     L-shape. `AreaGraphicBase` stamps `polygonRing`, so the real edges are here.
 */
function airfieldSymbolScale(f: FeatureLike, center: Coordinate): number {
    const extW = f.get('polygonExtentWidth') as number | undefined;
    const extH = f.get('polygonExtentHeight') as number | undefined;
    // Not stamped yet (first render, or a holder that never set a base) — keep
    // the historical fixed size rather than collapsing the symbol to nothing.
    if (!extW || !extH) return 1;

    let scale = AIRFIELD_FIT_SHARE * Math.min(extW / (AIRFIELD_HALF_W * 2), extH / (AIRFIELD_HALF_H * 2));

    const ring = f.get('polygonRing') as Coordinate[] | undefined;
    if (!ring || ring.length < 3) return scale;

    const fits = (s: number) =>
        AIRFIELD_SAMPLES.every(p => pointInRing([center[0] + p[0] * s, center[1] + p[1] * s], ring));

    // Bounded so it can never run away: 0.9^30 ≈ 0.04 of the bbox fit. Anything
    // still outside at that point is a degenerate polygon, not a sizing problem.
    for (let i = 0; i < 30 && !fits(scale); i++) scale *= 0.9;
    return scale;
}

export function getAirfieldStyle(fullLabel: string, dateLabel: string): StyleFunction {
    return (f, res) => {
        let styles = getAreaLabelStyles(f, res, fullLabel, dateLabel, 0, 36);
        const center = (f.getGeometry() as Point).getCoordinates();
        let {geometry} = svgToOpenLayersGeometry(AIRFIELD_SVG, center, airfieldSymbolScale(f, center));
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
        const maxLineWidth = Math.max(...allLines.map(l => (l ? getTextWidth(l, fontStyle, 1) : 0)));

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
    return asStyleFunction(arcMissionTaskPaint(name, ratioLocked), name);
}

/**
 * Scale of a ratio-locked mission task's label. Exported because the graphic
 * style functions that open a gap for that label have to size the gap from the
 * same number the label is drawn at.
 *
 * The formula is `ratioLockedLabelScale` in `core/symbology.ts`; this reads the
 * two inputs off the feature.
 */
export function ratioLockedLabelScale(feature: FeatureLike, resolution: number): number {
    return ratioLockedLabelScaleOf(
        feature.get('graphicSize') as number | undefined,
        feature.get('drawingResolution') as number | undefined,
        resolution,
    );
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
        // The curve, for capping the head against the graphic's own on-screen size.
        const curve = geom.getGeometries()
            .filter((g): g is MultiLineString => g instanceof MultiLineString)
            .flatMap(g => g.getCoordinates().flat());
        for (const sub of geom.getGeometries()) {
            if (sub instanceof Polygon) {
                // The arrowhead — filled, never trimmed, and held at a screen size
                // rather than the metres the generator baked in at draw time.
                const head = screenSizedArrowHead(sub, curve, resolution);
                if (head) styles.push(new Style({geometry: head, fill: new Fill({color}), stroke}));
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
 * The affiliation colour table, the doctrinal lookup and `withOpacity` now live in the
 * map-agnostic half (`core/symbology.ts`) and are re-exported from the import block at
 * the top of this file. Nothing about "hostile line work is red" is an OpenLayers fact,
 * and a second renderer that cannot reach the table has to restate it.
 */

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



/**
 * ## The ported area styles, as OpenLayers style functions
 *
 * Each is `asStyleFunction(...)` over a paint function in `areaPaints.ts`, so one
 * implementation draws in both renderers.
 *
 * **The exported names are kept deliberately.** `openlayerStyles.test.ts` asserts
 * on three of them — the obstacle teeth's winding correction, the shape-relative
 * decoration cap, the fortified merlons — and `MissionTaskGraphicBase` calls a
 * fourth for the circular no-fire areas. Deleting the exports would have deleted
 * the coverage that proves the port did not change what these draw, which is the
 * opposite of what the port is for.
 */

/** Belt / group / zone (outward), free (inward), restricted (inward + hatched). */
export function obstacleAreaStyles(feature: FeatureLike, resolution: number, opts: {outward: boolean; hatched?: boolean}): Style[] {
    return asStyleFunction(obstacleAreaPaint(opts))(feature, resolution);
}

export function obstacleRestrictedZoneStyle(feature: FeatureLike, resolution: number): Style[] {
    return obstacleAreaStyles(feature, resolution, {outward: false, hatched: true});
}

export function fortifiedAreaStyle(feature: FeatureLike, resolution: number): Style[] {
    return asStyleFunction(fortifiedAreaPaint())(feature, resolution);
}

/** The limited-access family, including the circular no-fire area a mission-task holder draws. */
export function limitedAccessAreaStyleFunc(feature: FeatureLike, resolution: number): Style[] {
    return asStyleFunction(limitedAccessAreaPaint())(feature, resolution);
}

export function getStyle(name: TacticalGraphicName, feature: FeatureLike, resolution: number) {
    return getStyleFromLabels(name, readGraphicLabels(feature), feature, resolution);
}

function getStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels, feature: FeatureLike, resolution: number) {
    if (name === TacticalGraphicName.StrongPoint) return railroadStyleFunction(feature, resolution);
    if (name === TacticalGraphicName.BattlePosition) return battlePositionStyleFunction(labels, feature, resolution);
    if (name === TacticalGraphicName.UnexplodedExplosiveOrdnanceArea) return unexplodedExplosiveOrdenanceStyle(feature, resolution);
    // ── Ported to the paint layer ────────────────────────────────────────────
    // Every branch below is `asStyleFunction(...)` over a paint function, so the
    // same implementation draws in OpenLayers and MapLibre. @see areaPaints.ts
    if (name === TacticalGraphicName.ObstacleRestrictedArea) {
        return asStyleFunction(obstacleAreaPaint({outward: false, hatched: true}), name)(feature, resolution);
    }
    if (name === TacticalGraphicName.ObstacleFreeArea) {
        return asStyleFunction(obstacleAreaPaint({outward: false}), name)(feature, resolution);
    }
    if (name === TacticalGraphicName.FortifiedArea) {
        return asStyleFunction(fortifiedAreaPaint(), name)(feature, resolution);
    }
    if (
        name === TacticalGraphicName.ObstacleBelt ||
        name === TacticalGraphicName.ObstacleGroup ||
        name === TacticalGraphicName.ObstacleZone
    ) {
        return asStyleFunction(obstacleAreaPaint({outward: true}), name)(feature, resolution);
    }
    if (
        name === TacticalGraphicName.LimitedAccessArea ||
        name === TacticalGraphicName.NoFireAreaCircular ||
        name === TacticalGraphicName.NoFireAreaIrregular ||
        name === TacticalGraphicName.NoFireAreaRectangular ||
        name === TacticalGraphicName.WeaponsFreeZone
    ) {
        return asStyleFunction(limitedAccessAreaPaint(), name)(feature, resolution);
    }
    if (name === TacticalGraphicName.GroupOrSeriesOfTargets) {
        return asStyleFunction(groupOrSeriesOfTargetsPaint(), name)(feature, resolution);
    }
    if (name === TacticalGraphicName.Encirclement) {
        return asStyleFunction(encirclementPaint(), name)(feature, resolution);
    }
    // Everything else: the plain outline, dashed when planned. **Ported** — 60 of
    // the 75 area graphics reach this branch. @see paintFunctions.ts, `areaOutlinePaint`.
    return asStyleFunction(areaOutlinePaint(name), name)(feature, resolution);
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
    const maxLineWidth = Math.max(...allLines.map(l => (l ? getTextWidth(l, fontStyle, 1) : 0)));
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

