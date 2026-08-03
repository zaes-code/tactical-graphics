/**
 * `@zaes/tactical-graphics/openlayers` — the OpenLayers renderer.
 *
 * The root package is deliberately map-agnostic: it turns a GeoJSON feature into
 * more GeoJSON and stops there, so the geometry stays portable. That leaves the
 * part every consumer still has to write — reprojecting into EPSG:3857, stamping
 * the amplifiers a style function reads, choosing the right style per graphic,
 * and wiring draw/modify interactions. This entry point is that part, extracted
 * from the demo app.
 *
 * `ol` is a **peer** dependency: you bring your own OpenLayers and share the one
 * copy the rest of your map already uses. `milsymbol` is peer for the same
 * reason — one controller renders a unit symbol with it.
 *
 * ```ts
 * import {renderTacticalGraphic, TacticalGraphicName} from '@zaes/tactical-graphics';
 * import {TacticalGraphicsManager} from '@zaes/tactical-graphics/openlayers';
 *
 * const manager = new TacticalGraphicsManager(map, source);
 * manager.startDrawing(TacticalGraphicName.PhaseLine);
 * ```
 *
 * Not exported here: the React demo (`MapControls`, `OpenLayers.tsx`) and the
 * sample gallery, which exist to exercise the library rather than to be
 * consumed.
 */

// The entry point: wires draw / modify / pointer interactions onto a map.
export {TacticalGraphicsManager} from './TacticalGraphicsManager';

// Generator → OpenLayers features, including the 4326 → 3857 reprojection.
export {default as openLayersTacticalGraphics} from './openlayersAdapter';
export type {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from './openlayersAdapter';

// name → controller. Call this if you are driving graphics yourself instead of
// through the manager.
export {getController} from './controllerRegistry';

// The bridge between an OpenLayers feature and the library's amplifier schema.
// Style functions read amplifiers through `readGraphicLabels`; publish them with
// `writeGraphicProperties`, never `feature.set`, or the map can keep drawing the
// old label.
export {TACTICAL_GRAPHIC_KEY, readGraphicLabels, writeGraphicProperties} from './graphicProperties';

// Which amplifier inputs a graphic accepts — drives a properties dialog.
export {getGraphicFields, supportsHostility} from './graphicFieldRegistry';
export type {GraphicFieldSet} from './graphicFieldRegistry';

// Every style function, plus the colour and width constants they share.
export * from './openlayerStyles';

// Configuration — label size, line width, colours. These are **re-exports**: the config
// is defined in the root entry point (`@zaes/tactical-graphics`), because none of it is
// specific to OpenLayers. Pixel sizes and affiliation colours mean the same thing to any
// renderer, so a second one inherits them rather than reinventing them.
//
// Mirrored here as a convenience, so a host wiring up this renderer does not need a
// second import line for the config it is about to apply. Same symbols, same singleton —
// `import {configureTacticalGraphics} from '@zaes/tactical-graphics'` is equivalent and
// is the canonical path if you are not using this renderer at all.
//
// After changing the config, invalidate your features
// (`source.forEachFeature(f => f.changed())`) so the style functions re-evaluate.
export {
    BASE_FONT_SIZE_PX,
    DEFAULT_LINE_WIDTH,
    DEFAULT_PALETTE,
    MAX_LABEL_SIZE,
    MAX_LINE_WIDTH,
    MIN_LABEL_SIZE,
    MIN_LINE_WIDTH,
    TacticalGraphicsConfig,
    configureTacticalGraphics,
    getDefaultLabelSize,
    getDefaultLineWidth,
    getTacticalGraphicsConfig,
    resetTacticalGraphicsConfig,
    setDefaultLabelSize,
    setDefaultLineWidth,
    setTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';
export type {TacticalGraphicsConfigOptions} from '@zaes/tactical-graphics';

// Editor-chrome colours, resolved. Handle dots, the inert centre and the draw marker —
// the affordances this renderer draws so a user can edit a graphic. Each falls back to
// `DEFAULT_PALETTE` until the host overrides it through the config.
//
// The library has no concept of light or dark: it has colours, and the host decides
// them. Keep whatever sets your app needs and send one on a mode change — that is the
// whole of it. `defaultDrawStyleFunc` is the draw-time style built from the marker pair;
// the manager installs it for every graphic, and it is exported for a host driving the
// `Draw` interaction itself.
export {
    defaultDrawStyleFunc,
    drawMarkerStyle,
    getDrawMarkerColor,
    getDrawMarkerOutlineColor,
    getHandleColor,
    getInertHandleColor,
} from './openlayerStyles';

// Save and restore. `serializeTacticalGraphics` emits one GeoJSON feature per graphic —
// the base — and `restoreTacticalGraphics` rebuilds them editable. Each record carries
// two objects: `tacticalGraphic` (the portable description any renderer understands) and
// `renderer` (this renderer's bookkeeping, chiefly the drawing resolution decoration
// sizes were derived from). Keep both; see persistence.ts for why.
export {
    SNAPSHOT_VERSION,
    applyRestoredGeometry,
    restoreTacticalGraphics,
    serializeTacticalGraphics,
} from './persistence';
export type {
    RestoreFailure,
    RestoreReport,
    SerializeOptions,
    TacticalGraphicRendererState,
    TacticalGraphicsSnapshot,
} from './persistence';

// Feature-property helpers for hosts that build or inspect graphics themselves.
export {ROLE_KEY, assignRole, readGraphicGeometryState, readRole} from './graphicProperties';
export type {GraphicGeometryState} from './graphicProperties';

// The feature holders: subclass one to add a graphic without forking the package.
export {AirCorridor} from './graphics/AirCorridor';
export {AreaGraphicBase} from './graphics/AreaGraphicBase';
export {Block} from './graphics/Block';
export {Boundary} from './graphics/Boundary';
export {Exfiltrate} from './graphics/Exfiltrate';
export {LineGraphicBase} from './graphics/LineGraphicBase';
export {CircularAreaGraphicBase, MissionTaskGraphicBase} from './graphics/MissionTaskGraphicBase';
export {MovementGraphicBase} from './graphics/MovementGraphicBase';
export {RangeFanGraphicBase} from './graphics/RangeFanGraphicBase';
export {ReliefInPlace} from './graphics/ReliefInPlace';
export {RetrogradeTask} from './graphics/RetrogradeTask';
export {SecurityOperationGraphicBase} from './graphics/SecurityOperationGraphicBase';

// The controllers: they translate pointer events into translate / rotate /
// resize calls on a holder.
export {LineGraphicController, SAME_POINT_EPSILON_M} from './controllers/LineGraphicController';
// `PointDropController` is the click-to-place variant — a graphic with no
// draggable dimension is placed by one click rather than drawn. Exported
// alongside its base for the same reason the others are: a host registering its
// own graphic needs to be able to name the controller it routes through.
export {MissionTaskController, PointDropController} from './controllers/MissionTaskController';
export {PolygonGraphicController, RectangularAreaGraphicController} from './controllers/PolygonGraphicController';
export {SecurityOperationsController} from './controllers/SecurityOperationsController';

// Route-direction arrows, inlined as data URIs so no asset loader is needed.
export {ALTERNATING_ARROW, ONE_WAY_ARROW, TWO_WAY_ARROW} from './assets/routeDirectionIcons';
