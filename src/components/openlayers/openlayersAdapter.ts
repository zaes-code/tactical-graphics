import {Feature as OLFeature} from 'ol';
import {Feature as GeoJSONFeature, GeoJsonGeometryTypes, Point, Position} from 'geojson';
import {DrawEvent, GeometryFunction,} from 'ol/interaction/Draw';
import {ObjectEvent} from 'ol/Object';
import {StyleFunction} from "ol/style/Style";
import GeoJSON from "ol/format/GeoJSON";
import {Coordinate} from 'ol/coordinate';
import {toLonLat} from "ol/proj";
import {point as turfPoint} from '@turf/helpers';
import {distance as turfDistance} from '@turf/distance';
import {bearing as turfBearing} from '@turf/bearing';
import {TacticalGraphicsRegistry, rotationAnchor} from '@zaes/tactical-graphics';
import {GraphicOptions, TacticalGraphicName} from '@zaes/tactical-graphics';
import Feature from "ol/Feature";
import {geometryService} from '@zaes/tactical-graphics';
import {getController} from "./controllerRegistry";

export type TacticalGraphicShape = GeoJsonGeometryTypes | 'Circle';

export interface TacticalGraphic {
    base: Feature;
    symbolId: string;

    getFeatures(): Feature[];

    setBaseFeature(base: Feature): void;

    setSymbolId(symbolId: string): void;
}

/**
 * The point an edit gesture turns and scales a graphic about.
 *
 * **`rotationAnchor`, which is the portable rule, rather than
 * `GeometryService.getCenter`.** The two already agree for a point (itself) and a line
 * (its first vertex); they disagree for a polygon, where `getCenter` returns turf's
 * centroid — the mean of the vertices — and `rotationAnchor` returns the extent midpoint.
 * MapLibre has always pivoted on `rotationAnchor`, so the same drag on the same irregular
 * area turned it about two different points and produced two different shapes.
 *
 * Only the *edit* path is redirected. `GeometryService.getCenter` is also what the
 * generators measure from, and moving that would change what graphics look like rather
 * than how they edit. @see rotationAnchor
 */
function editPivot(feature: GeoJSONFeature): Position {
    return rotationAnchor(feature.geometry as unknown as {type: string; coordinates: unknown});
}

export interface TacticalGraphicHandler {
    type: TacticalGraphicShape; // defines how the tactical graphic is drawn in openlayers
    geomHandleType: TacticalGraphicShape; // used to define how the tactical graphic is modified (rotate/translate/resize)
    drawStyleFunc?: StyleFunction; // define some custom draw style when creating a tactical graphic
    onPointerMove?: Function; //
    updateGraphics?: Function;
    geometryFn?: GeometryFunction;
    graphic: TacticalGraphic;
    maxPoints?: number; // defines the max number of points to draw (for a linestring graphic)

    getBaseGeometry(): number[] | number[][] | number[][][];

    setBaseFeature(base: Feature): void;

    getCenter(): number[];

    getFeatures(): OLFeature[];

    onDrawStartFunc(e: DrawEvent): void;

    onDrawEndFunc(e: DrawEvent): void;

    onResolutionChangeFunc(e: ObjectEvent): void;

    getSymbolId(): string;

    setSymbolId(symbolId: string): void;

    handleTranslate(deltaX: number, deltaY: number): void;

    handleRotate(deltaAngle: number): void;

    handleResize(deltaSize: number): void;

    setOffset?(offset: number): void;

    // Multiplier applied to the width-handle drag distance before it reaches
    // setOffset. Omitted means the shared default (see handleOffset).
    offsetScale?: number;

    /**
     * How many contract handles the holder peeled off before the `handles` feature.
     *
     * **`handleRole` is indexed against the generator's list, not against whatever a
     * holder happened to render.** The retrograde family publishes `handleCoords[0]` —
     * which the contract calls the `mirror` handle — as its own offset feature, and puts
     * `slice(1)` in `handles`. So the arrow tip, contract index 1, arrived at
     * `handleRole` as index 0 and was answered "mirror": the manager claimed the drag as
     * a flip and the tip handle did nothing at all. Six graphics, all reported as "a red
     * handle that doesn't resize".
     *
     * Declaring the shift lets the manager convert a feature-local index back to a
     * contract one. A holder that renders the contract list unchanged omits it.
     */
    handleIndexOffset?: number;

    /**
     * Lifts the holder's draw-time minimum-size floor for the duration of a deliberate
     * resize, and puts it back afterwards.
     *
     * **A floor that exists to make a half-drawn graphic legible must not also decide how
     * small a finished one may be.** `Block.MIN_BASE_PX` says so in its own comment —
     * "from the moment the user *starts drawing*, even if the cursor hasn't moved far
     * from the first click" — and `LineGraphicBase`'s guards say the same. Left in place
     * during a resize they stop seven of the block family shrinking below the size they
     * happened to be drawn at, which reads as a handle that gives up.
     *
     * Not the same as `suspendMinimumSize` on the curves: that one is a *readability*
     * floor, not a draw-time one, and it stays.
     */
    suspendSizeFloor?(active: boolean): void;

    /**
     * The graphic's current overall size, in meters — any linear measure of it, as long
     * as the same one is reported every time and a `handleResize(k)` multiplies it by k.
     *
     * A resize is a ratio from where the drag began, and computing it needs the size the
     * graphic has *now*: without it the manager can only multiply per frame, which is
     * the same arithmetic until a holder clamps and silently wrong afterwards.
     * @see TacticalGraphicsManager.handleResize
     */
    currentSize?(): number | undefined;

    /**
     * The width this graphic currently has, in meters — whatever `setOffset` last set.
     *
     * Needed because a width drag applies a **change**: without a starting value the
     * manager has to infer one from where the cursor happens to be, which is exactly
     * the absolute reading that made the width snap on grab. A controller that cannot
     * answer falls back to that inference, so this stays optional.
     * @see TacticalGraphicsManager.handleOffset
     */
    currentOffset?(): number | undefined;

    // Whether an edit ("modify vertices") drag should stretch this graphic the
    // way a resize drag does. Set for fixed-vertex graphics, which have no
    // vertices for OpenLayers' Modify to offer. See LineGraphicController.
    editStretches?: boolean;

    // Drags the dimension owned by handle `bandIndex` to `coordinate`, for
    // graphics whose handles each mean something different (the range fans, one
    // rim per band). Present means "do this instead of a uniform resize".
    handleBandResize?(bandIndex: number, coordinate: Coordinate): void;

    /**
     * Moves the base vertex at `vertexIndex` to `coordinate`.
     *
     * For graphics whose shape is the positions of its own vertices — the legs of a
     * fields-of-fire V — rather than a size scaled about a center. Present means "drag
     * this vertex instead of resizing the whole graphic".
     *
     * The index is into the **base geometry**, not the handle feature: `visiblePathHandles`
     * drops handles that would be redundant, so the two do not line up. The manager
     * latches it at pointer-down against the base.
     */
    handleVertexDrag?(vertexIndex: number, coordinate: Coordinate): void;

    /**
     * Base vertex that moves the whole graphic rather than reshaping it, if any.
     *
     * The manager skips it under a reshape drag, so it is inert except in translate mode —
     * where the ordinary translate path already moves everything, grabbed point included.
     */
    anchorVertex?: number;

    /**
     * Hangs an asymmetric graphic's hook on the other side of its line.
     *
     * Driven by the **sign** of the same perpendicular distance that sets the width from
     * its magnitude, so one handle carries both: how far out you drag sets the width, which
     * side you drag to sets the side.
     */
    setMirrored?(mirrored: boolean): void;
}

/**
 * Class used to generate tactical graphics and format it into openlayers features.
 * Provides the handlers used for rotating, translating, resizing and modifying tactical graphics
 * and graphic classes for applying openlayer styles for graphic labels.
 */
class OpenlayersAdapter {

    // Delegates to the declarative controllerRegistry — no switch needed here.
    getTacticalGraphicController = (graphicName: TacticalGraphicName, resolution: number): TacticalGraphicHandler =>
        getController(graphicName, resolution);


    // generate the tactical graphics from the tactical graphics library
    getTacticalGraphic(graphicName: TacticalGraphicName, base: OLFeature, opts?: GraphicOptions) {
        let tacticalGraphic = TacticalGraphicsRegistry
            .get(graphicName)
            ?.generate(this.olFeatureToTurf(base), opts);

        if (!tacticalGraphic) return;
        let {graphic, handles, labels} = tacticalGraphic;
        return {
            graphic: this.turfToOlFeature(graphic).getGeometry(),
            handles: this.turfToOlFeature(handles).getGeometry(),
            labels: this.turfToOlFeature(labels).getGeometry()
        }
    }

    // translate TurfJs feature into openlayers feature
    turfToOlFeature(turfFeature: GeoJSONFeature): OLFeature {
        const geojsonFormat = new GeoJSON();
        return <OLFeature>geojsonFormat.readFeature(turfFeature, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
        });
    }

    // transform openlayers feature into TurfJs feature
    olFeatureToTurf(feature: OLFeature, sourceProj = 'EPSG:3857'): GeoJSONFeature {
        const geojsonFormat = new GeoJSON();

        // Convert to GeoJSON and reproject to EPSG:4326 for Turf
        const turfFeature = geojsonFormat.writeFeatureObject(feature, {
            dataProjection: 'EPSG:4326',
            featureProjection: sourceProj,
        });

        return turfFeature as GeoJSONFeature;
    }

    coordinateToTurfPoint = (coord: number[]): GeoJSONFeature<Point> => {
        let coordinate = toLonLat(coord);
        return turfPoint(coordinate);
    }

    getTurfDistance = (start: GeoJSONFeature<Point>, stop: GeoJSONFeature<Point>) => {
        return turfDistance(start, stop, {units: 'kilometers'});
    }

    getTurfBearing = (start: GeoJSONFeature<Point>, stop: GeoJSONFeature<Point>) => {
        return turfBearing(start, stop);
    }

    resizeFeature(feat: Feature, deltaSize: number): Feature {
        let turfFeature = this.olFeatureToTurf(feat);
        let center = editPivot(turfFeature);
        let scaledBase = geometryService.scale(<any>turfFeature, deltaSize, center);
        return this.turfToOlFeature(scaledBase);
    }

    rotateFeature(feat: Feature, deltaAngle: number): Feature {
        let turfFeature = this.olFeatureToTurf(feat);
        let center = editPivot(turfFeature);
        let rotatedBase = geometryService.rotate(<any>turfFeature, -deltaAngle * (180 / Math.PI), center);
        return this.turfToOlFeature(rotatedBase);
    }

    translateFeature(feat: Feature, deltaX: number, deltaY: number): Feature {
        let turfFeature = this.olFeatureToTurf(feat);
        let rotatedBase = geometryService.translate(<any>turfFeature, deltaX, deltaY);
        return this.turfToOlFeature(rotatedBase);
    }
}

const openLayersTacticalGraphics = new OpenlayersAdapter();
export default openLayersTacticalGraphics;
