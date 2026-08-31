import {Map, View} from 'ol';
import TileLayer from 'ol/layer/Tile';
import Feature, {FeatureLike} from 'ol/Feature';
import {Fill, Stroke, Style, Text} from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import { Geometry, LineString, MultiLineString, MultiPoint, Point, Polygon} from 'ol/geom';
import {Coordinate} from 'ol/coordinate';
import {defaults, ScaleLine} from 'ol/control';
import {StyleFunction} from 'ol/style/Style';
// The wire and anti-tank tables moved with their paint functions — they describe
// what those symbols *are*, and `obstaclePaints.ts` reads them directly now.
import {geometryService, getPaintFunction} from '@zaes/tactical-graphics';
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
import {escortSymbolStyle, followTaskSymbolStyle, securityOperationCentreSymbolStyle} from './securityOperationSymbol';
import {BASE_FONT_SIZE_PX, getDefaultLabelSize} from '@zaes/tactical-graphics';
/**
 * The color table, the line weight and the three label-scale formulas now live in the
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
    formatAltitude,
    formatDistance,
    getColorByHostility,
    getDefaultLineColor,
    getDoctrinalHostilityColor,
    getDrawMarkerColor,
    getDrawMarkerOutlineColor,
    getHandleColor,
    getInertHandleColor,
    getLabelFillColor,
    getLabelUsesHostilityColor,
    getLabelHaloColor,
    labelZoomMultiplier,
    maxGraphicLabelScale,
    withOpacity,
} from '@zaes/tactical-graphics';

export {
    formatAltitude,
    formatDistance,
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
    airCoordinatingAreaLabelPaint,
    airfieldPaint,
    airfieldPointLabelPaint,
    airfieldPointPaint,
    plainOutlinePaint,
    areaDefaultLabelPaint,
    airCorridorLabelPaint,
    airspaceCoordinationAreaLabelPaint,
    airCorridorPaint,
    arrowheadedLinePaint,
    attackHelicopterAxisLabelPaint,
    bridgeLabelPaint,
    envelopmentGraphicPaint,
    infiltrationGraphicPaint,
    mobileDefenseGraphicPaint,
    coordinatedFireLinePaint,
    engineerWorkLinePaint,
    fieldsOfFirePaint,
    forwardLineOfOwnTroopsPaint,
    lineOfContactPaint,
    munitionFlightPathPaint,
    passageLanePaint,
    barSymbolPaint,
    securityOperationLabelPaint,
    securityOperationPaint,
    boundaryPaint,
    rangeFanLabelPaint,
    battlePositionPaint,
    strongPointPaint,
    unexplodedOrdnanceAreaPaint,
    exfiltratePaint,
    reliefInPlacePaint,
    turnPaint,
    baseDefenseZoneLabelPaint,
    movementToContactPaint,
    pursuitPaint,
    CROSSED_HALF_WIDTH_PX,
    crossedMissionTaskLabelPaint,
    missionTaskLabelPaint,
    crossedMissionTaskLabelScale,
    crossedMissionTaskPaint,
    blockPaint,
    breachPaint,
    clearPaint,
    aviationAxisLabelPaint,
    axisOfAdvanceLabelPaint,
    avenueOfApproachLabelPaint,
    counterattackLabelPaint,
    directionArrowPaint,
    envelopmentLabelPaint,
    frontalAttackLabelPaint,
    infiltrationLabelPaint,
    mobileDefenseLabelPaint,
    advanceToContactLabelPaint,
    movementLabelPaint,
    turningMovementLabelPaint,
    retrogradeTaskPaint,
    finalProtectiveFirePaint,
    linearSmokeTargetPaint,
    linearTargetPaint,
    areaFillPaint,
    areaLabelStackPaint,
    groupOrSeriesOfTargetsLabelPaint,
    positionAreaArtilleryLabelPaint,
    fortifiedLinePaint,
    decisionLinePaint,
    fortifiedPositionPaint,
    mobilityCorridorPaint,
    obstacleBypassPaint,
    demonstrationPaint,
    escortPaint,
    followTaskPaint,
    sweptArcTaskPaint,
    mineClusterPaint,
    minelinePaint,
    raftSitePaint,
    tripWirePaint,
    smokeObscurantLabelPaint,
    wireObstaclePaint,
    zoneLabelPaint,
    areaOutlinePaint,
    defaultLinePaint,
    encirclementPaint,
    CARDINAL_LABEL_AREAS,
    CBRN_AREAS,
    CBRN_TOXIC_AREAS,
    cardinalBoundaryPaint,
    cardinalLabelPaint,
    contourLineBoundaryPaint,
    contourLineLabelPaint,
    nestedZonePaint,
    PSYOPS_ZONES,
    psyOpsZonePaint,
    mineFillPaint,
    minedAreaFencedPaint,
    minefieldAreaPaint,
    cbrnContaminatedAreaPaint,
    cbrnMarkPaint,
    dashedOutlinePaint,
    fortifiedAreaPaint,
    restrictedTerrainPaint,
    freeFireAreaCircularPaint,
    groupOrSeriesOfTargetsPaint,
    limitedAccessAreaPaint,
    obstacleAreaPaint,
    obstacleLinePaint,
    phaseLinePaint,
    routeControlMeasurePaint,
} from '@zaes/tactical-graphics';
import {asStyleFunction} from './paintToOpenLayers';
import type {Paint, PaintContext, PaintFeature} from '@zaes/tactical-graphics';
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
 * `{...DEFAULT_PALETTE, ...myColors}`.
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
 * the sample sweep, and the basemap re-color in `OpenLayers.tsx`), so a style function
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
 * and a host may be coloring features by some route of its own.
 */
export function readHostility(feature: FeatureLike): TacticalGraphicHostility {
    return readGraphicLabels(feature).hostility
        ?? feature.get('hostility')
        ?? TacticalGraphicHostility.unknown;
}

/**
 * The line color for a feature: an explicit `hostilityColor` override if something set
 * one, otherwise the affiliation's color. `getColorByHostility` already resolves
 * `unknown` to the default line color, so this covers the unaffiliated case too.
 */
/**
 * The fill a text amplifier takes.
 *
 * `getLabelFillColor()` unless the host opted the library into affiliation-coloured text,
 * in which case the label follows exactly the rule its line work follows — including the
 * exemptions `readHostilityColor` applies, so a graphic that does not take a hostility
 * colour does not take one on its text either. The map-agnostic half states the same rule
 * once, in `labelColorOf`; this is the OpenLayers-only style functions reading it.
 *
 * Falls back to the configured fill when no feature is in scope, which is what the
 * editor's own read-outs want — they are chrome and belong to no affiliation.
 */
export function labelFillFor(feature?: FeatureLike): string {
    return getLabelUsesHostilityColor() && feature ? readHostilityColor(feature) : getLabelFillColor();
}

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
 * colors reached point-anchored graphics and nothing else: every line, polygon and area
 * fell through to OpenLayers' built-in editing style, which is hardcoded and ignores the
 * config entirely. A host could set `drawMarkerColor` and watch it apply to a handful of
 * graphics.
 *
 * OpenLayers renders a draw in two features — the sketch geometry, and a separate Point
 * for the cursor. Both arrive here, which is why the `Point` branch is the marker and
 * everything else is the sketch line. The sketch is dashed and drawn over an outline in
 * the marker's outline color, so it stays legible over both the basemap and any graphic
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
 * A function, not a `const`. As a module-level const the halo color was frozen at
 * import and could never follow a later change — harmless while it was always white,
 * a silent bug the moment a host overrode it. Cached so the ~75 call sites don't
 * allocate a `Stroke` per style call.
 *
 * Keyed on the resolved color rather than on the mode: the halo now comes from the
 * config, which a host may change at any time, so the mode flag is no longer a
 * complete cache key. In practice a host uses one or two halo colors, so the cache
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
const basemapEnabled = () => {
    // Read here rather than at module load. `process` is a Node and bundler-time global
    // with no equivalent in a plain browser bundle, and this module is published, so a
    // top-level read threw `process is not defined` on import for any consumer whose
    // bundler does not shim it. Same rule as the DOM access that moved into measureCtx().
    //
    // Caught rather than guarded with `typeof process`. A bundler replaces `process.env`
    // (CRA) or `process.env.REACT_APP_BASEMAP` (a Vite `define`) with a literal, so this
    // is normally constant-folded and no global is read at all — but neither of them
    // substitutes a bare `typeof process`, so guarding that way would depend on a
    // `process` shim the demo build is not guaranteed to have, and `off` would silently
    // stop working. The expression below is left exactly as a bundler expects to match it:
    // an index or an optional chain is not replaced.
    try {
        return process.env.REACT_APP_BASEMAP !== 'off';
    } catch {
        return true; // no bundler substitution and no `process`: a plain browser bundle
    }
};

const createBasemapLayers = () => basemapEnabled() ? [
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

/**
 * The backing store never gets *smaller* than the element it fills.
 *
 * OpenLayers sizes its canvas at `devicePixelRatio` and scales it to the container
 * with a CSS transform. Above 1 that transform shrinks — the ordinary HiDPI path,
 * and fine. Below 1 it **enlarges**, and a browser zoomed to 90% (`devicePixelRatio`
 * 0.9) gets a 1920x866 canvas stretched over a 2133x962 box by
 * `transform: matrix(1.11111, …)`. Chrome's compositor can drop that layer
 * entirely: the canvas paints correctly — its pixels read back as the basemap, every
 * tile loaded, no error anywhere — and simply never reaches the screen, until any
 * interaction invalidates the layer and it appears. Diagnosed from a boot recording
 * of a live blank map; `Ctrl+0` cured it, and a clamp here prevents it.
 *
 * Clamping only ever affects a zoomed-*out* page. A real HiDPI display (2), or
 * Windows at 125% or 150% (1.25, 1.5), passes through untouched and keeps its
 * sharpness — those downscale, which is the path every retina browser exercises
 * constantly. This costs a zoomed-out viewer about 20% more pixels per frame.
 *
 * Read once at construction, because OL fixes `pixelRatio` there; changing the
 * browser zoom afterwards has always needed a reload to re-derive it.
 */
const canvasPixelRatio = () => Math.max(1, window.devicePixelRatio || 1);

export const createMap = (target: HTMLElement) => {
    let controls = defaults({zoom: false}).extend([
        new ScaleLine({
            units: 'metric',
        }),
    ]);
    return new Map({
        controls: controls,
        target: target,
        pixelRatio: canvasPixelRatio(),
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
            /**
             * **Let the view zoom out until the whole extent is visible.**
             *
             * The default is false, which stops the zoom at the point where the extent
             * *fills* the viewport — a hard floor at `worldWidth / viewportWidth`, which
             * on a 1500 px window is 26 717 m/px. The sample sweep lays 273 graphics out
             * across 46 million metres, wider than the Earth, so `view.fit` asked for
             * 39 842 and was silently clamped: the gallery zoomed, and still ran off both
             * sides of the window. MapLibre has no such constraint and framed the same
             * sweep correctly, which is how the clamp was found.
             */
            showFullExtent: true,
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
 * Base feature for a point-anchored graphic — the center it is generated around.
 *
 * Two things it must get right, and a plain `new Feature()` gets neither:
 *
 * - **A style function.** A feature with no style falls through to OpenLayers' own
 *   default, which paints a dot — and that default cannot consult `hidden`, so the
 *   center showed in every mode. `createBaseFeature`'s style returns an empty `Style`
 *   while hidden, which is what makes the flag mean anything.
 * - **`base` cleared.** That flag means "has vertices the Modify interaction may drag".
 *   A point-anchored graphic has none — it is reshaped by rotate / resize / translate —
 *   so leaving it set would put a draggable vertex on the center. Same reasoning as
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
 * handles, and a large centered label ("BDZ", and the crossed mission tasks'
 * letters) hid the center dot.
 *
 * **Handles are editor chrome and always paint last.** A handle you cannot see
 * is a handle you cannot use, and hit-testing follows draw order too, so
 * lifting them also makes `forEachFeatureAtPixel` reach them first.
 */
export const HANDLE_Z_INDEX = 1000;

// used for adding markers to a tactical graphics to let a user know where they can drag the graphic to modify
/**
 * A distance for a user to read, from meters.
 *
 * Meters below a kilometer — a 400 m radius shown as "0.4 km" is both harder to read and
 * less precise than the number it came from. Above that, kilometers: one decimal while
 * the figure is small enough for it to mean something, whole numbers beyond 10 km where
 * it is noise.
 *
 * Exported so the measure line and the properties dialog cannot drift apart; they are
 * reporting the same quantity and a user will compare them.
 */


/**
 * The radius read-out shown while a circular graphic is drawn or resized: a hashed line
 * from center to edge with the radius in km on it.
 *
 * Editor chrome, not symbology — `role: 'handle'` keeps it out of `serializeTacticalGraphics`
 * and out of anything that counts rendered graphics. It draws only when the holder has put
 * a geometry on it, and the holder clears that when the gesture ends, so it never appears
 * in the sample gallery or a restored map.
 *
 * Dashes are in screen pixels via `resolution`, so the hatching stays the same density at
 * every zoom.
 *
 * The distance is measured in EPSG:3857 meters by default — Euclidean, no turf — which is
 * what the radius read-out has always shown. **A holder that knows the real ground
 * distance can say so** by setting `measureMeters` on the feature, and the rectangular
 * zones do: their width amplifier is filed geodesically, and a hashed line reporting the
 * projected figure beside it would show two different numbers for one edge (at 51° the
 * projected one is 1.6x larger).
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
        const stated = f.get('measureMeters') as number | undefined;
        const text = formatDistance(
            typeof stated === 'number' && isFinite(stated) ? stated : Math.hypot(b[0] - a[0], b[1] - a[1]),
        );

        // `placement: 'line'` lays the text along the geometry, so it picks up the
        // line's own angle and stays upright-relative to it as the user swings the
        // handle around — no rotation to compute, and none to keep in step.
        // `lineDash` is in canvas pixels, so the hatching holds its density at any zoom.
        return new Style({
            // The inert-handle color: this is a passive read-out, the same class of
            // chrome as the center dot you cannot drag — not a live handle.
            stroke: new Stroke({color: getInertHandleColor(), width: LINE_WIDTH(), lineDash: [8, 6]}),
            text: new Text({
                text,
                font: fontStyle,
                placement: 'line',
                // The label color, not the handle color: this reads as an amplifier on
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

        // Always red, never the hostility color. A handle is a piece of editor
        // chrome, not part of the symbol: it says "you can drag this", and that
        // meaning must not change with the graphic's affiliation. Tinting them
        // also made a hostile graphic's handles the same red as its own strokes,
        // so they stopped reading as handles at all. Gray stays reserved for
        // `createInertHandleFeature` — see it for why the colors must not blur.
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
 * The center dot on a point-anchored graphic.
 *
 * **Gray means "you cannot drag this right now", and it has to stay honest.** The
 * center is refused as a drag origin for resize (the scale ratio divides by
 * distance-to-center, which is ~0 there) and for rotate (a point on the axis carries
 * no angle) — but it *is* the natural grab point for a move, so
 * `TacticalGraphicsManager.handleDownEvent` accepts it in translate mode. This style
 * follows that: red like every other live handle while a move is possible, gray
 * otherwise. A gray dot that silently accepted a drag would teach the color to mean
 * nothing, which is the trap this comment used to warn about when the center was
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
 * `getDefaultLineColor()`, which meant changing a graphic's hostility recolored
 * nothing for anything on this style: all the circle graphics (base defense
 * zone, the circular kill boxes and fire areas), bridge, and every other
 * movement graphic without a bespoke style. Only the graphics with their own
 * style function ever honored it.
 *
 * `hostilityColor` is what the properties dialog stamps; `hostility` is the raw
 * enum, kept as a fallback for features colored by some other path.
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
            fill: new Fill({color: labelFillFor(feature)}),
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
    // Test the affiliation, not the color string. `hostilityColor` is a color resolved
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
                fill: new Fill({color: labelFillFor(feature)}),
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
                fill: new Fill({color: labelFillFor(feature)}),
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

/** **Ported.** @see movementPaints.ts, `bridgeLabelPaint`. */
export function bridgeGraphicStyleFunc(): StyleFunction {
    return asStyleFunction(bridgeLabelPaint());
}

/** Screen-px clear space between the passage lane's fishtail and its DTG. */
const PASSAGE_LANE_LABEL_GAP_PX = 8;

/** **Ported.** @see mobilityPaints.ts, `passageLanePaint`. */
export function passageLaneGraphicStyle(): StyleFunction {
    return asStyleFunction(passageLanePaint());
}


/**
 * Graphic StyleFunction for the Infiltration line feature.
 * Recomputes the gap around the "IN" label on every render using the live
 * resolution, keeping the gap constant in screen pixels regardless of zoom.
 *
 * NOTE: OL geometry is in EPSG:3857 (projected meters), so gap math must use
 * plain Euclidean vectors — NOT turf/GeometryService geographic helpers.
 */
/** **Ported.** @see movementPaints.ts, `infiltrationGraphicPaint`. */
export function infiltrationGraphicStyleFunc(): StyleFunction {
    return asStyleFunction(infiltrationGraphicPaint());
}

/**
 * Graphic StyleFunction for the Envelopment line feature.
 * Renders: straight part with zoom-invariant gap around "E" label, arc, open arrowhead.
 */
// MobileDefense: multi-line-string geometry where triangle rings (closed 4-point
// sub-arrays) are rendered as filled polygons and every other sub-array is a
// stroked line (arcs, arrow shaft, arrow head).
/** **Ported.** @see movementPaints.ts, `mobileDefenseGraphicPaint`. */
export function mobileDefenseGraphicStyleFunc(): StyleFunction {
    return asStyleFunction(mobileDefenseGraphicPaint());
}

/** **Ported.** @see movementPaints.ts, `envelopmentGraphicPaint`. */
export function envelopmentGraphicStyleFunc(): StyleFunction {
    return asStyleFunction(envelopmentGraphicPaint());
}

/**
 * Render a label whose font size tracks the graphic's size in screen pixels.
 * coords[0]→coords[1] defines both the label position (midpoint) and the span
 * used to derive scale — so the label stays proportional at every zoom level.
 * Font is declared at 24px; scale = (spanPx * 0.7) / 24.
 */
function graphicProportionalLabel(feature: FeatureLike | undefined, c0: Coordinate, c1: Coordinate, resolution: number, text: string, textAlign: CanvasTextAlign = 'center'): Style {
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
            fill: new Fill({color: labelFillFor(feature)}),
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
    return asStyleFunction(movementLabelPaintFor(name), name);
}

/**
 * **Ported.** @see movementPaints.ts.
 *
 * The dispatch that used to be a 340-line switch in here is now a table: each
 * member of the family names the paint function that draws its amplifier.
 */
const MOVEMENT_LABEL_PAINTS: Partial<Record<TacticalGraphicName, () => (f: PaintFeature, c: PaintContext) => Paint[]>> = {
    [TacticalGraphicName.Infiltration]: infiltrationLabelPaint,
    [TacticalGraphicName.Envelopment]: envelopmentLabelPaint,
    [TacticalGraphicName.MobileDefense]: mobileDefenseLabelPaint,
    [TacticalGraphicName.TurningMovement]: turningMovementLabelPaint,
    [TacticalGraphicName.FrontalAttack]: frontalAttackLabelPaint,
    [TacticalGraphicName.AvenueOfApproach]: avenueOfApproachLabelPaint,
    [TacticalGraphicName.Counterattack]: counterattackLabelPaint,
    // The by-fire variant carries the same `CATK` amplifier; only the line work differs.
    [TacticalGraphicName.CounterattackByFire]: counterattackLabelPaint,
    [TacticalGraphicName.AviationAxisOfAdvance]: aviationAxisLabelPaint,
    [TacticalGraphicName.AttackHelicopterAxisOfAdvance]: attackHelicopterAxisLabelPaint,
    [TacticalGraphicName.AdvanceToContact]: advanceToContactLabelPaint,
};

/** The four that share the axis-of-advance layout, which needs its own name. */
const AXIS_OF_ADVANCE_LABELS: readonly TacticalGraphicName[] = [
    TacticalGraphicName.MainAxisOfAdvance,
    TacticalGraphicName.MainAxisOfAdvanceFeint,
    TacticalGraphicName.SupportingAxisOfAdvance,
    TacticalGraphicName.InfiltrationLane,
];

function movementLabelPaintFor(name: TacticalGraphicName) {
    if (AXIS_OF_ADVANCE_LABELS.includes(name)) return axisOfAdvanceLabelPaint(name);
    return (MOVEMENT_LABEL_PAINTS[name] ?? movementLabelPaint)();
}

function movementGraphicStyles(label: GraphicLabels, f: FeatureLike, resolution: number) {
    let primaryLabel = label.designation ?? '';
    let dateLabel = getDateLabel(label);
    const geom = f.getGeometry() as MultiPoint;
    if (!geom) return [];
    const coords = geom.getCoordinates();
    if (!coords || coords.length < 2) return [];

    const styles: Style[] = [];
    styles.push(graphicProportionalLabel(f, coords[0], coords[1], resolution, primaryLabel));

    if (!!dateLabel) {
        // Shift one span-width along line direction for date label offset
        const [x0, y0] = coords[0];
        const [x1, y1] = coords[1];
        const dx = x1 - x0, dy = y1 - y0;
        const dc0: Coordinate = [x0 + dx, y0 + dy];
        const dc1: Coordinate = [x1 + dx, y1 + dy];
        styles.push(graphicProportionalLabel(f, dc0, dc1, resolution, dateLabel));
    }

    return styles;
}

/**
 * Downward nudge, in screen pixels per unit of label scale, that puts a capital
 * letter's *ink* on the line rather than its em box. @see clearStyleFunc
 */
const OPTICAL_CENTER_PX_PER_SCALE = 2.2;

/** **Ported.** @see blockPaints.ts, `clearPaint`. */
export function clearStyleFunc(textLabel: string, t1: number = 0.6): StyleFunction {
    return asStyleFunction(clearPaint(textLabel, t1));
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
/** Centerline of the arrow row nearest the route. */
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
/** **Ported.** @see scallopPaints.ts, `lineOfContactPaint`. */
export function lineOfContactStyleFunc(): StyleFunction {
    return asStyleFunction(lineOfContactPaint());
}


/** **Ported.** @see retrogradePaints.ts, `retrogradeTaskPaint`. */
export function retroGradeTaskStyleFunc(label: string): StyleFunction {
    return asStyleFunction(retrogradeTaskPaint(label));
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
/** **Ported.** @see routedTaskPaints.ts, `exfiltratePaint`. */
export function exfiltrateStyleFunc(label: string): StyleFunction {
    return asStyleFunction(exfiltratePaint(label));
}

// ReliefInPlace: top line + curve + bottom line + arrowhead, with the "RIP"
// label carved into a gap on the top line near the non-arrow end.
/** **Ported.** @see routedTaskPaints.ts, `reliefInPlacePaint`. */
export function reliefInPlaceStyleFunc(label: string): StyleFunction {
    return asStyleFunction(reliefInPlacePaint(label));
}

/** **Ported.** @see blockPaints.ts, `breachPaint`. */
export function breachStyleFunc(label: string): StyleFunction {
    return asStyleFunction(breachPaint(label));
}

/** **Ported.** @see blockPaints.ts, `blockPaint`. */
export function blockStyleFunc(label: string): StyleFunction {
    return asStyleFunction(blockPaint(label));
}

/**
 * The whole geometry in one hostility-colored stroke, no label. Both
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
/** **Ported.** @see paintFunctions.ts, `plainOutlinePaint`. */
export function attackByFireStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(plainOutlinePaint(), name);
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

/** **Ported.** @see midLabelLinePaints.ts, `coordinatedFireLinePaint`. */
export function coordinatedFireLineStyle(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(coordinatedFireLinePaint(name), name);
}


/** **Ported.** @see midLabelLinePaints.ts, `engineerWorkLinePaint`. */
export function engineerWorkLineStyle(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(engineerWorkLinePaint(name), name);
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
 * meters, so they grew on screen as the map zoomed in and shrank to nothing zoomed out.
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
 * The generators build their heads in meters — Fix's off the drawn line's length,
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

    let traveled = 0;
    return path.map((point, i) => {
        if (i > 0) traveled += Math.hypot(point[0] - path[i - 1][0], point[1] - path[i - 1][1]);
        const {dir} = pathPointAt(path, Math.min(traveled, total));
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
 * Tooth dimensions in map units for one path, honoring the cap.
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

/** **Ported.** @see scallopPaints.ts, `arrowheadedLinePaint` — the no-letter case. */
export function ferryCrossingStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(arrowheadedLinePaint(), name);
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
/**
 * **Ported.** @see scallopPaints.ts, `arrowheadedLinePaint`.
 *
 * @param label the doctrinal letter. Defaults to "F" so the published signature
 *   stays source-compatible; the table 5-19 obstacle effect passes '' and gets
 *   the same zigzag with no glyph.
 */
export function tacticalFixStyleFunc(label: string = 'F'): StyleFunction {
    return asStyleFunction(arrowheadedLinePaint(label));
}


/** **Ported.** @see paintFunctions.ts, `areaFillPaint`. */
export function defaultStyleFunc(): StyleFunction {
    return asStyleFunction(areaFillPaint());
}

/**
 * BaseDefenseZone label: hardcoded "BDZ" centered on the circle, scaled so
 * the text grows/shrinks with the circle. The circle's radius (in meters)
 * is read from `feature.get('graphicSize')` — `MissionTaskGraphicBase`
 * stamps it on the label feature each time the geometry updates.
 *
 * Scale formula: `radiusPx / SCALE_DIVISOR`, floored so a tiny circle still
 * renders something and capped at `maxGraphicLabelScale()` like every other
 * size-proportional label. Lower the divisor for a larger label, raise it for a
 * smaller one; past a ~68 px radius the cap is what decides, so the divisor
 * only shapes how the label grows on the way there.
 */
/** **Ported.** @see missionTaskPaints.ts, `baseDefenseZoneLabelPaint`. */
export function baseDefenseZoneLabelStyleFn(): StyleFunction {
    return asStyleFunction(baseDefenseZoneLabelPaint());
}

/** **Ported.** @see missionTaskPaints.ts, `pursuitPaint`. */
export function pursuitStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(pursuitPaint(name), name);
}

/** **Ported.** @see missionTaskPaints.ts, `movementToContactPaint`. */
export function movementToContactStyleFunc(): StyleFunction {
    return asStyleFunction(movementToContactPaint());
}

/**
 * FightingPosition: stroke-only render of the 3-sided rectangle (left, top,
 * right walls — open at the bottom). The graphic feature's geometry is a
 * LineString of 4 points produced by `FightingPosition.generateGraphics`,
 * so a single Stroke is enough — no fill, no per-point label.
 */
/** **Ported.** @see paintFunctions.ts, `plainOutlinePaint`. */
export function fightingPositionStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(plainOutlinePaint(), name);
}

/**
 * Abatis: a drawn route carrying one fixed-size chevron. The whole symbol is in the
 * geometry, so a plain stroke draws it.
 *
 * It cannot fall through to `defaultLineStyle`, which returns nothing at all for a
 * MultiLineString — that is what left the obstacle invisible when it stopped being
 * point-anchored. **Ported.** @see paintFunctions.ts, `plainOutlinePaint`.
 */
export function abatisStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(plainOutlinePaint(), name);
}

/**
 * FortifiedLine: a continuous baseline plus rectangular teeth (merlons)
 * bumping up from it. Geometry is a MultiLineString — sub-line [0] is the
 * baseline, sub-lines [1..N] are each tooth as 4 points (leftBase, leftTop,
 * rightTop, rightBase). All sub-lines share one stroke; the name label
 * (when set) sits below the baseline midpoint so the teeth above don't
 * overlap it.
 */
/** The two minimum safe distance zones. @see boundaryBreakPaints.ts, `nestedZonePaint` */
export function nestedZoneStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(nestedZonePaint(), name);
}

/** The point airfield's crossed arms. @see airfieldPaints.ts, `airfieldPointPaint` */
export function airfieldPointStyleFunc(): StyleFunction {
    return asStyleFunction(airfieldPointPaint(), TacticalGraphicName.Airfield);
}

/** Its designation, beside the runway rather than through it. */
export function airfieldPointLabelStyleFn(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(airfieldPointLabelPaint(name), name);
}

/** The three obstacle bypasses. @see obstacleBypassPaints.ts */
export function obstacleBypassStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(obstacleBypassPaint(name), name);
}

/**
 * Escort and demonstration. @see escortAndDemonstrationPaints.ts
 *
 * The escort carries a host-injected unit symbol in the break in its bar, like the security
 * operations carry one between their arms — but sized from the bar rather than from the
 * global setting, so the graphic and the symbol scale together. @see escortSymbolStyle
 */
export function escortOrDemonstrationStyleFunc(name: TacticalGraphicName): StyleFunction {
    const paint = name === TacticalGraphicName.Escort
        ? escortPaint(getLabel(name))
        : demonstrationPaint(getLabel(name));
    const styled = asStyleFunction(paint, name);
    if (name !== TacticalGraphicName.Escort) return styled;

    return (feature, resolution) => {
        const drawn = styled(feature, resolution);
        const styles = Array.isArray(drawn) ? drawn : drawn ? [drawn] : [];
        const symbol = escortSymbolStyle(feature, resolution);
        return symbol ? [...styles, symbol] : styles;
    };
}

/** Capture, evacuate and recover. @see sweptArcTaskPaints.ts */
export function sweptArcTaskStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(sweptArcTaskPaint(getLabel(name)), name);
}

/**
 * Follow and assume, follow and support. @see followTaskPaints.ts
 *
 * Each carries a host-injected unit symbol where field T would go, like the escort carries
 * one in the break in its bar. The paint has already left the space and skipped the
 * designation; this appends the picture. @see followTaskSymbolStyle
 */
export function followTaskStyleFunc(name: TacticalGraphicName): StyleFunction {
    const styled = asStyleFunction(followTaskPaint(name === TacticalGraphicName.FollowAndAssume ? 'assume' : 'support'), name);
    return (feature, resolution) => {
        const drawn = styled(feature, resolution);
        const styles = Array.isArray(drawn) ? drawn : drawn ? [drawn] : [];
        const symbol = followTaskSymbolStyle(feature, resolution);
        return symbol ? [...styles, symbol] : styles;
    };
}

/**
 * Cover, guard and screen: the arms, the two letters, and the host's unit symbol between
 * them.
 *
 * The symbol is placed by `securityOperationSymbol` rather than from anything here — the
 * gap it sits in is cut by the same calculation, and a symbol placed from a second one does
 * not sit in its own hole. @see followTaskStyleFunc, which is the same arrangement.
 */
/** The three the dispatcher above routes here. */
const SECURITY_OPERATION_STYLES: ReadonlySet<TacticalGraphicName> = new Set([
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
]);

export function securityOperationStyleFunc(name: TacticalGraphicName): StyleFunction {
    const styled = asStyleFunction(securityOperationPaint(getLabel(name)), name);
    return (feature, resolution) => {
        const drawn = styled(feature, resolution);
        const styles = Array.isArray(drawn) ? drawn : drawn ? [drawn] : [];
        const symbol = securityOperationCentreSymbolStyle(feature, resolution);
        return symbol ? [...styles, symbol] : styles;
    };
}

/** The two APP-06 lines that stand a glyph on each anchor point. @see endGlyphLinePaints.ts */
export function endGlyphLineStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(
        name === TacticalGraphicName.DecisionLine ? decisionLinePaint() : mobilityCorridorPaint(),
        name,
    );
}

/**
 * APP-06's five protection lines. @see protectionLinePaints.ts
 *
 * One entry point rather than five: the holder switch names the graphic, and every one
 * of these is `asStyleFunction` over a paint of the same name, so a per-graphic wrapper
 * would be five identical lines.
 */
export function protectionLineStyleFunc(name: TacticalGraphicName): StyleFunction {
    switch (name) {
        case TacticalGraphicName.MineCluster:
            return asStyleFunction(mineClusterPaint(), name);
        case TacticalGraphicName.TripWire:
            return asStyleFunction(tripWirePaint(), name);
        case TacticalGraphicName.RaftSite:
            return asStyleFunction(raftSitePaint(), name);
        case TacticalGraphicName.FortifiedPosition:
            return asStyleFunction(fortifiedPositionPaint(), name);
        default:
            return asStyleFunction(minelinePaint(name), name);
    }
}

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
 * All the maths is Euclidean on EPSG:3857 meters. Nothing here may call turf.
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
 * a mine sits in. The run is centered on the route and always starts and ends with a tooth,
 * because a mine with no tooth beside it has no notch to nest in.
 *
 * All the maths is Euclidean on EPSG:3857 meters. Nothing here may call turf.
 */
/** **Ported.** @see obstaclePaints.ts, `antiTankDitchPaint`. */
export function antiTankDitchStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(antiTankDitchPaint(name), name);
}

/** **Ported.** @see missionTaskPaints.ts, `barSymbolPaint`. */
export function barSymbolStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(barSymbolPaint(name), name);
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

/** **Ported.** @see scallopPaints.ts, `forwardLineOfOwnTroopsPaint`. */
export function forwardLineOfOwnTroopsStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(forwardLineOfOwnTroopsPaint(), name);
}


/** **Ported.** @see mobilityPaints.ts, `fieldsOfFirePaint`. */
export function fieldOfFireStyleFunc(): StyleFunction {
    return asStyleFunction(fieldsOfFirePaint());
}


/** **Ported.** @see midLabelLinePaints.ts, `munitionFlightPathPaint`. */
export function munitionFlightPathStyleFunc(): StyleFunction {
    return asStyleFunction(munitionFlightPathPaint());
}


const dashStyle = (labels: GraphicLabels) => {
    return (labels.status === TacticalGraphicStatus.planned ||
        (labels.hostility === TacticalGraphicHostility.hostileFaker
            && labels.confidence === TacticalGraphicConfidence.suspected
        )
    ) ? [12, 8] : undefined;
};

/** **Ported.** @see boundaryPaints.ts, `boundaryPaint`. */
export function boundariesStyleFunc(): StyleFunction {
    return asStyleFunction(boundaryPaint(), TacticalGraphicName.Boundary);
}

function boundariesStyleFromLabels(labels: GraphicLabels): StyleFunction {
    const topLabel = formatFullLabel(labels.designation, labels.countryCode ?? '');
    const botLabel = formatFullLabel(labels.secondDesignation ?? '', labels.secondCountryCode ?? '');
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
                    fill: new Fill({color: labelFillFor(f)}),
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
                    fill: new Fill({color: labelFillFor(f)}),
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

/**
 * The area families whose label layout lives **only** in the shared paint layer.
 *
 * `getAreaLabelStylesFromLabels` below is this engine's own switch, and it is still the
 * route for most areas — the port is not finished. But a layout written for the paint
 * registry and not also written here renders on MapLibre and not on OpenLayers, which is
 * exactly the asymmetry the shared layer exists to prevent: measured on a hostile joint
 * tactical action area, MapLibre drew `JTAA - 02` with `ENY` on both flanks and this
 * engine drew `JTAA 02` with neither.
 *
 * So these names are read from the registry instead. The list is the porting front, and it
 * shrinks to nothing when the switch does. @see areaLabelPainterFor
 */
const PAINT_LAYER_AREA_LABELS: readonly TacticalGraphicName[] = [
    // The three PsyOps zones were the first graphic this list was written for and the
    // first one it missed: the case here passed `psyOpsMarkPaint(() => [])`, an empty
    // base, so the speaker and its amplifiers drew and the date-time group outside the
    // upper-left corner — which the registry's base draws — never appeared on this engine.
    TacticalGraphicName.PsyOpsZoneIrregular,
    TacticalGraphicName.PsyOpsZoneRectangular,
    TacticalGraphicName.PsyOpsZoneCircular,
    TacticalGraphicName.JointTacticalActionArea,
    TacticalGraphicName.SubmarineActionArea,
    TacticalGraphicName.SubmarineGeneratedActionArea,
    TacticalGraphicName.AreaGeneric,
    TacticalGraphicName.HumanTerrain,
    TacticalGraphicName.EnemyPrisonerOfWarHoldingArea,
    // The Sector 1 / Sector 2 / field H stack. @see sectorModifierPaints
    TacticalGraphicName.LimitedAccessArea,
    TacticalGraphicName.RestrictedTerrain,
    TacticalGraphicName.SeverelyRestrictedTerrain,
];

export function getAreaLabelStylesFn(name: TacticalGraphicName): StyleFunction {
    const painted = PAINT_LAYER_AREA_LABELS.includes(name) ? getPaintFunction(name)?.label : undefined;
    if (painted) return asStyleFunction(painted, name);
    return (f, resolution) => getAreaLabelStylesFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function getAreaLabelStylesFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const fullLabel = getFullLabel(name, labels.designation ?? '');
    const dateLabel = getDateLabel(labels);
    switch (name) {
        case TacticalGraphicName.HighDensityAirspaceControlZone:
        case TacticalGraphicName.RestrictedOperationsZone:
        case TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone:
        case TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone:
        case TacticalGraphicName.WeaponEngagementZone:
        // **171400 was missing from this list until 2026-08-26**, so the fighter
        // engagement zone alone among the eleven fell through to `default:` and drew the
        // ordinary area block — `FEZ ALPHA` over a date range, with the altitudes its own
        // dialog collects rendered nowhere. MapLibre had it right the whole time, because
        // it reads `AIR_COORDINATING_ZONES` from the registry. @see airZoneParity.test.ts
        case TacticalGraphicName.FighterEngagementZone:
        case TacticalGraphicName.JointEngagementZone:
        case TacticalGraphicName.MissileEngagementZone:
        case TacticalGraphicName.LowAltitudeMissileEngagementZone:
        case TacticalGraphicName.HighAltitudeMissileEngagementZone:
        case TacticalGraphicName.ShortRangeAirDefenseEngagementZone:
            return airCoordinatingAreaStyleFunc(name);
        case TacticalGraphicName.WeaponsFreeZone:
            return airCoordinatingAreaStyleFunc(name);
        case TacticalGraphicName.AirSpaceCoordinationAreaRectangular:
        case TacticalGraphicName.AirSpaceCoordinationAreaIrregular:
        case TacticalGraphicName.AirSpaceCoordinationAreaCircular:
            return airspaceCoordinationAreaStyle(name);
        case TacticalGraphicName.AirfieldZone:
            return getAirfieldStyle(name);
        // The row of mines rides the label feature, like the loudspeaker below it.
        case TacticalGraphicName.MinefieldDynamicDepiction:
        case TacticalGraphicName.MinedAreaFenced:
            return asStyleFunction(mineFillPaint(), name);
        // The loudspeaker rides the label feature; the outline belongs to the polygon.
        // The dose goes in the break and nowhere else, so there is no centre block under
        // it — the base painter draws nothing rather than repeating the text.
        case TacticalGraphicName.RadiationDoseRateContourLine:
            return asStyleFunction(contourLineLabelPaint(() => []), name);
        case TacticalGraphicName.ArtilleryManeuverArea:
        case TacticalGraphicName.ArtilleryReservedArea:
            return asStyleFunction(
                cardinalLabelPaint(
                    CARDINAL_LABEL_AREAS.find(([area]) => area === name)![1],
                    // No literal in the middle: it is already in the boundary, four times
                    // over. @see areaDefaultLabelPaint
                    areaDefaultLabelPaint(name, false),
                ),
                name,
            );
        case TacticalGraphicName.BiologicalContaminatedArea:
        case TacticalGraphicName.ChemicalContaminatedArea:
        case TacticalGraphicName.NuclearContaminatedArea:
        case TacticalGraphicName.RadiologicalContaminatedArea:
            return asStyleFunction(
                cbrnMarkPaint(
                    CBRN_AREAS.find(([cbrn]) => cbrn === name)![1],
                    areaDefaultLabelPaint(name),
                ),
                name,
            );
        // The three toxic-industrial-material subtypes: the same triangle with a T in the
        // bottom of it. @see CBRN_TOXIC_AREAS
        case TacticalGraphicName.BiologicalContaminatedAreaToxicIndustrialMaterial:
        case TacticalGraphicName.ChemicalContaminatedAreaToxicIndustrialMaterial:
        case TacticalGraphicName.RadiologicalContaminatedAreaToxicIndustrialMaterial:
            return asStyleFunction(
                cbrnMarkPaint(
                    CBRN_TOXIC_AREAS.find(([cbrn]) => cbrn === name)![1],
                    areaDefaultLabelPaint(name),
                    {toxic: true},
                ),
                name,
            );
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
        // **Six more that were missing from this list until 2026-08-26**, found by the
        // routing comparison the fighter engagement zone prompted. @see areaLabelRouting.test.ts
        case TacticalGraphicName.TargetBuildUpAreaRectangular:
        case TacticalGraphicName.TargetBuildUpAreaCircular:
        case TacticalGraphicName.TargetValueAreaRectangular:
        case TacticalGraphicName.TargetValueAreaCircular:
        case TacticalGraphicName.ZoneOfResponsibilityRectangular:
        case TacticalGraphicName.ZoneOfResponsibilityCircular:
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
            // Prefix over name, centered; the two DTGs outside the bounding box's
            // upper-left. A rectangle's corner is a real vertex and a circle has none,
            // so the box is the right anchor for both.
            return asStyleFunction(zoneLabelPaint(name, false), name);
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular:
        case TacticalGraphicName.CriticalFriendlyZoneIrregular:
        // The irregular half of the same six.
        case TacticalGraphicName.TargetBuildUpAreaIrregular:
        case TacticalGraphicName.TargetValueAreaIrregular:
        case TacticalGraphicName.ZoneOfResponsibilityIrregular:
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
            return asStyleFunction(areaLabelStackPaint(name), name);
        // **Ported 2026-08-17.** This branch is where ~60 area graphics land, and it used to
        // call `getAreaLabelFn`, an OpenLayers-only pair of `Text` styles. MapLibre had been
        // reading `areaDefaultLabelPaint` all along, so the two engines were drawing the same
        // label through two implementations — and only one of them could be given the cap
        // that keeps a designation inside its own outline. @see fitLabelScale
        default:
            return asStyleFunction(areaDefaultLabelPaint(name), name);
    }
}


/**
 * Points along the two runway strokes, in unscaled path units, used to test the
 * symbol against the polygon outline. Endpoints alone are not enough: both arms
 * pass through the center, so a notch can cut a stroke without containing either
 * of its ends.
 */

/**
 * Ray-cast point-in-polygon.
 *
 * Deliberately hand-rolled: a style function receives **projected EPSG:3857
 * meters**, and turf expects geographic degrees, so `booleanPointInPolygon`
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
 * it marks rather than a fixed number of meters — a USA-sized airfield used to
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

/** **Ported.** @see airfieldPaints.ts, `airfieldPaint`. */
export function getAirfieldStyle(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(airfieldPaint(areaDefaultLabelPaint(name)), name);
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
/** **Ported.** @see airPaints.ts, `airspaceCoordinationAreaLabelPaint`. */
export function airspaceCoordinationAreaStyle(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(airspaceCoordinationAreaLabelPaint(name), name);
}


/**
 * The designation a point-anchored mission task carries, at its own anchor.
 *
 * **Ported** — one function for the whole family, because the split between the
 * ratio-locked letters and the ordinary 16px ones is a property of the graphic and
 * now lives on `RATIO_LOCKED_MISSION_TASKS` in the core library. There used to be a
 * second style function here for the ratio-locked half and a holder branch choosing
 * between the two; the second renderer could not see either, so it drew the whole
 * family ratio-locked.
 *
 * `rotation` is for Envelopment's "E", which lies along its approach. @see
 * paintFunctions.ts, `missionTaskLabelPaint`.
 */
export function getMissionTaskStyleFn(name: TacticalGraphicName, rotation: number = 0): StyleFunction {
    return asStyleFunction(missionTaskLabelPaint(name, rotation), name);
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
 * Re-exported from the map-agnostic half — see `symbology/missionTaskPaints.ts`.
 *
 * The controller seeds a graphic's stored size from `CROSSED_HALF_WIDTH_PX`, and the
 * scale is the one the label renders at, so both have to be the same number the
 * paint function uses.
 */
export {CROSSED_HALF_WIDTH_PX, crossedMissionTaskLabelScale};

/** **Ported.** @see missionTaskPaints.ts, `crossedMissionTaskLabelPaint`. */
export function crossedMissionTaskLabelStyleFn(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(crossedMissionTaskLabelPaint(name), name);
}

/**
 * Destroy / Interdict / Neutralize / Suppress — two straight lines crossing at
 * a one-letter label, per FM 1-02.2 table 6-1.
 *
 * Sub-line layout, written by `CrossedMissionTask.generateGraphics`:
 *   `[0]` first arm, `[1]` second arm, `[2…]` arrowheads.
 * The arms arrive whole, running right through the center; the gap for the
 * label is opened here, sized from the glyph that actually renders. Baking it
 * into the geometry would be a second place to keep in step with the label's
 * scale formula.
 *
 * The whole symbol is also **scaled about its center onto the screen**, so it
 * renders `CROSSED_HALF_WIDTH_PX × 2` wide at every zoom level — it neither
 * grows on zoom-in nor recedes on zoom-out. Nothing about the stored `size`
 * survives that: the scale factor divides it straight back out. It has to
 * happen here rather than in the geometry because it is a function of the live
 * `resolution`, which the generator never sees.
 *
 * Euclidean EPSG:3857 maths only — no turf, no GeometryService. @see conventions.md
 */
/** **Ported.** @see missionTaskPaints.ts, `crossedMissionTaskPaint`. */
export function crossedMissionTaskStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(crossedMissionTaskPaint(name), name);
}

/**
 * Turn — the bowed curve and its filled arrowhead. The geometry is a
 * GeometryCollection (`[MultiLineString, Polygon]`), so one fill + stroke pair
 * covers both: OpenLayers strokes the sub-lines and fills the arrowhead.
 * The "T" comes off the separate label feature.
 */
/** **Ported.** @see routedTaskPaints.ts, `turnPaint`. */
export function turnStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(turnPaint(getLabel(name)), name);
}

/** Padding either side of the "T", in screen pixels. */
const TURN_LABEL_PAD_PX = 5;

/**
 * Drops `distance` map units off the far end of a polyline, interpolating the
 * new last vertex. Euclidean — these are projected EPSG:3857 meters.
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

/** **Ported.** @see boundaryPaints.ts, `rangeFanLabelPaint`. */
export function getRangeFanLabelStyleFn(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(rangeFanLabelPaint(name), name);
}

function formatAzimuth(deg: number): string {
    let n = Math.round(deg) % 360;
    if (n < 0) n += 360;
    return String(n).padStart(3, '0');
}

function getOffset(distance: number, rotation: number): [number, number] {
    const offsetX = Math.cos(rotation) * distance;
    const offsetY = Math.sin(rotation) * distance;
    return [offsetX, offsetY];
}

/** **Ported.** @see securityPaints.ts, `securityOperationLabelPaint`. */
export function getSecurityOperationLabelStyle(textLabel: string, rotation: number = 0, position: 'left' | 'right' = 'left'): StyleFunction {
    return asStyleFunction(securityOperationLabelPaint(textLabel, rotation, position));
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
/** **Ported.** @see echelonPaints.ts, `strongPointPaint` — the strong point. */
function railroadStyleFunction(feature: FeatureLike, resolution: number) {
    return asStyleFunction(strongPointPaint())(feature, resolution);
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

/** **Ported.** @see echelonPaints.ts, `battlePositionPaint`. */
export function battlePositionStyleFunction(labels: GraphicLabels, feature: FeatureLike, resolution: number): Style[] {
    return asStyleFunction(battlePositionPaint())(feature, resolution) as Style[];
}

/**
 * The affiliation color table, the doctrinal lookup and `withOpacity` now live in the
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
/** **Ported.** @see areaPaints.ts, `freeFireAreaCircularPaint`. */
export function freeFireAreaCircularStyleFunc(): StyleFunction {
    return asStyleFunction(freeFireAreaCircularPaint());
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
    // Cover, guard and screen. They were placed rather than drawn until 2026-08-29 and had
    // no entry here at all, so a host calling `getStyle` for one got nothing back and had
    // to reach past this function. They are ordinary drawn graphics now, and this is where
    // a caller looks. @see securityOperationStyleFunc
    if (SECURITY_OPERATION_STYLES.has(name)) return securityOperationStyleFunc(name)(feature, resolution);
    if (name === TacticalGraphicName.StrongPoint) return railroadStyleFunction(feature, resolution);
    if (name === TacticalGraphicName.BattlePosition) return battlePositionStyleFunction(labels, feature, resolution);
    // APP-06 151202 — the same outline and echelon, broken whatever the status says.
    if (name === TacticalGraphicName.BattlePositionPreparedButNotOccupied) {
        return asStyleFunction(battlePositionPaint({alwaysDashed: true}), name)(feature, resolution);
    }
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
    // APP-06 242600 note 1: broken line in *all* status depictions, so the dash belongs
    // to the symbol rather than to `plannedDash`.
    if (name === TacticalGraphicName.ZoneOfFire) {
        return asStyleFunction(dashedOutlinePaint(), name)(feature, resolution);
    }
    // The yellow hatch; the triangle and its letter ride the label feature below. The
    // toxic-industrial-material subtypes hatch identically — the T is on the label.
    if (CBRN_AREAS.some(([cbrn]) => cbrn === name) || CBRN_TOXIC_AREAS.some(([cbrn]) => cbrn === name)) {
        return asStyleFunction(cbrnContaminatedAreaPaint(), name)(feature, resolution);
    }
    if (name === TacticalGraphicName.MinefieldDynamicDepiction) {
        return asStyleFunction(minefieldAreaPaint(), name)(feature, resolution);
    }
    if (name === TacticalGraphicName.MinedAreaFenced) {
        return asStyleFunction(minedAreaFencedPaint(), name)(feature, resolution);
    }
    if (PSYOPS_ZONES.includes(name)) {
        return asStyleFunction(psyOpsZonePaint(), name)(feature, resolution);
    }
    // One break at the top, holding the dose the operator typed.
    if (name === TacticalGraphicName.RadiationDoseRateContourLine) {
        return asStyleFunction(contourLineBoundaryPaint(), name)(feature, resolution);
    }
    // The outline broken at four cardinal points; the abbreviation fills each break.
    const cardinal = CARDINAL_LABEL_AREAS.find(([area]) => area === name);
    if (cardinal) {
        return asStyleFunction(cardinalBoundaryPaint(cardinal[1]), name)(feature, resolution);
    }
    // The pair APP-06 tells apart by hatch texture alone. @see hatchTileSegments
    if (name === TacticalGraphicName.RestrictedTerrain) {
        return asStyleFunction(restrictedTerrainPaint(), name)(feature, resolution);
    }
    if (name === TacticalGraphicName.SeverelyRestrictedTerrain) {
        return asStyleFunction(restrictedTerrainPaint({dense: true}), name)(feature, resolution);
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

/** **Ported.** @see echelonPaints.ts, `unexplodedOrdnanceAreaPaint`. */
function unexplodedExplosiveOrdenanceStyle(feature: FeatureLike, resolution: number) {
    return asStyleFunction(unexplodedOrdnanceAreaPaint())(feature, resolution);
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
    if (labels.designation?.trim()) nameLines.push(labels.designation.trim());

    // ── Alt / time block — pad label to 11 chars for rough column alignment ───
    const altLines: string[] = [];
    if (labels.minAltitude) altLines.push(`${'MIN ALT:'.padEnd(11)}${formatAltitude(labels.minAltitude, labels.altitudeDatum)}`);
    if (labels.maxAltitude) altLines.push(`${'MAX ALT:'.padEnd(11)}${formatAltitude(labels.maxAltitude, labels.altitudeDatum)}`);
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
            fill: new Fill({color: labelFillFor(feature)}),
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
/** **Ported.** @see airPaints.ts, `airCoordinatingAreaLabelPaint`. */
export function airCoordinatingAreaStyleFunc(name: TacticalGraphicName): StyleFunction {
    return asStyleFunction(airCoordinatingAreaLabelPaint(name), name);
}

