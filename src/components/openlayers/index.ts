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

// Light/dark mode. Every colour accessor above reads this flag, so without it a host
// got a two-mode palette and no way to choose between the modes. Default is light —
// call `setDarkModeFlag(true)` when your map background is dark, then invalidate your
// features (`feature.changed()`) so the style functions re-evaluate.
export {isDarkMode, setDarkModeFlag} from '../../settings';

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
