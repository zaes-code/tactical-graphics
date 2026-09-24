/**
 * The MapLibre names for the renderer-neutral graphic builder, which lives in the root now
 * that more than one renderer builds from it. Kept so nothing importing the old names, in
 * this repo or through the `/maplibre` barrel, has to change. @see buildPaintedGraphic
 */
export {
    buildPaintedGraphic as buildTacticalGraphic,
    carryPaintFlags,
    DEFAULT_OFFSET_PX,
    descriptionOf,
    paintGraphic as paintTacticalGraphic,
    projectToMercator as projectGeometry,
    withDrawingResolution,
} from '@zaes/tactical-graphics';
export type {PaintedGraphic as MapLibreTacticalGraphic} from '@zaes/tactical-graphics';
export type {Position} from 'geojson';
