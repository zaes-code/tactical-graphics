import Feature from 'ol/Feature';
import {Coordinate} from 'ol/coordinate';
import {MultiLineString, MultiPoint, Point} from 'ol/geom';
import {createFeature, createHandleFeature, getSecurityOperationLabelStyle} from '../openlayerStyles';
import {_scaleAndRotateCoordinates} from '../../../utils/scaleAndRotateCoordinates';
import {StyleFunction} from 'ol/style/Style';
import {SecurityOperationGraphic} from "../controllers/SecurityOperationsController";
import openlayersAdapter from "../openlayersAdapter";
import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';


/**
 * Screen-pixel sizes at scale 1. Every one is multiplied by the map resolution,
 * which is what keeps the graphic a constant size on screen as you zoom.
 */
const CENTER_PADDING_PX = 75;
const ARROW_LENGTH_PX = 75;
const ARROW_DEPTH_PX = 20;
const ARROW_HEAD_LENGTH_PX = 10;
const ARROW_HEAD_DEGREE = 60;

/**
 * Smallest resize factor.
 *
 * Each line runs from `centerPadding` out to `2 * arrowLength * scale`. With
 * `centerPadding` pinned, a scale of 0.5 collapses that run to nothing and
 * anything below folds the line back through the 2525E symbol. The floor leaves
 * a quarter of the padding as visible line.
 */
const MIN_SCALE = (CENTER_PADDING_PX * 1.25) / (2 * ARROW_LENGTH_PX);

export class SecurityOperationGraphicBase implements SecurityOperationGraphic {
    primaryLabel: string;
    base: Feature<Point> = new Feature<Point>();
    centroid: Coordinate = [0, 0];
    rotation: number;
    scale: number;
    resolution: number;
    leftLabelFeature: Feature<Point> = new Feature<Point>();
    rightLabelFeature: Feature<Point> = new Feature<Point>();
    graphic: Feature = createFeature();
    symbolId: string = '';
    handles: Feature = createHandleFeature();
    name: TacticalGraphicName;
    centerPadding: number;

    // to do: make the geometry revolve around the center instead of centroid.
    constructor(name: TacticalGraphicName, resolution: number) {
        this.primaryLabel = getLabel(name);
        this.rotation = 0;
        this.scale = 1;
        this.resolution = resolution;
        this.centerPadding = CENTER_PADDING_PX * this.resolution;

        this.leftLabelFeature.set('drawingResolution', resolution);
        this.rightLabelFeature.set('drawingResolution', resolution);
        this.graphic.set('drawingResolution', resolution);

        this.leftLabelFeature.setStyle(this.getLabelStyle('left'));
        this.rightLabelFeature.setStyle(this.getLabelStyle('right'));
        this.name = name;
    }

    setSymbolId(symbolId: string) {
        this.symbolId = symbolId;
        this.graphic.set('symbolId', symbolId);

    }

    getLabelStyle = (position: 'left' | 'right'): StyleFunction => {
        return getSecurityOperationLabelStyle(this.primaryLabel, this.rotation, position);
    };

    getFeatures(): Feature[] {
        return [this.leftLabelFeature, this.rightLabelFeature, this.graphic, this.handles];
    }

    setBaseFeature = (base: Feature<Point>): void => {
        this.base = base;
        this.updateFeatures();
    };
    /**
     * Rotates a generator-local offset into place around the base point.
     *
     * Deliberately passes scale 1: resize must NOT be applied to finished
     * coordinates, or it drags the inner ends of the lines and the labels
     * outward with everything else. See `updateFeatures`.
     */
    placeCoordinates = (coordinates: Coordinate[]) => {
        return coordinates.map(coord => this.placeCoordinate(coord));
    }
    placeCoordinate = (coord: Coordinate) => {
        return _scaleAndRotateCoordinates(coord, this.base.getGeometry()!.getCoordinates(), 1, this.rotation);
    }
    updateFeatures = () => {
        // Resize lengthens the arrows outward and moves nothing else, so `scale`
        // is spent on the arrow's length rather than on the coordinates the
        // generator returns. `centerPadding` — the gap between the 2525E symbol
        // and where the lines begin — is left unscaled, which pins both the inner
        // end of each line and the labels (placed at `centerPadding / 1.5`).
        // `arrowDepth` and `arrowHeadLength` are unscaled too: the arrowheads
        // move, they don't grow.
        let arrowLength = ARROW_LENGTH_PX * this.resolution * this.scale;
        let arrowDepth = ARROW_DEPTH_PX * this.resolution
        let arrowHeadLength = ARROW_HEAD_LENGTH_PX * this.resolution;
        let arrowHeadDegree = ARROW_HEAD_DEGREE;

        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            {centerPadding: this.centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree}
        );
        if (!tacticalGraphic) return;

        let {graphic, handles, labels} = tacticalGraphic;
        let placedGraphicCoordinates = (graphic as MultiLineString).getCoordinates().map(this.placeCoordinates);
        (graphic as MultiLineString).setCoordinates(placedGraphicCoordinates);

        let placedHandleCoordinates = this.placeCoordinates((handles as MultiPoint).getCoordinates());
        (handles as MultiPoint).setCoordinates(placedHandleCoordinates);

        let placedLabelPoints = this.placeCoordinates((labels as MultiPoint).getCoordinates());
        this.graphic.setGeometry(graphic);
        this.handles.setGeometry(handles);
        this.leftLabelFeature.setGeometry(new Point(placedLabelPoints[0]));
        this.rightLabelFeature.setGeometry(new Point(placedLabelPoints[1]));

    };

    /**
     * Re-anchor to a new map resolution, i.e. a zoom change.
     *
     * Every size in this class is a screen-pixel constant multiplied by the
     * resolution, so the whole graphic holds a constant on-screen size only if
     * they are all recomputed together. This used to refresh `centerPadding`
     * alone and leave `this.resolution` at whatever it was when the graphic was
     * drawn, so `arrowLength` / `arrowDepth` / `arrowHeadLength` kept spending
     * the draw-time resolution: the gap to the 2525E symbol held its pixel size
     * while the arrows grew and shrank with the zoom.
     */
    updateResolution(resolution: number) {
        this.resolution = resolution;
        this.centerPadding = CENTER_PADDING_PX * resolution;
        this.updateFeatures();
    }

    getRotation = (): number => {
        return this.rotation;
    };

    setRotation = (rotation: number) => {
        this.rotation = rotation;
        this.updateFeatures();
    };

    getScale = (): number => {
        return this.scale;
    };

    setScale = (scale: number) => {
        this.scale = Math.max(MIN_SCALE, scale);
        this.updateFeatures();
    };

    getBaseFeature(): Feature<Point> {
        return this.base;
    }

}
