import Feature from 'ol/Feature';
import {Coordinate} from 'ol/coordinate';
import {MultiLineString, MultiPoint, Point} from 'ol/geom';
import {createCenterBaseFeature, createFeature, createHandleFeature, getSecurityOperationLabelStyle} from '../openlayerStyles';
import {_scaleAndRotateCoordinates} from '../../../utils/scaleAndRotateCoordinates';
import {StyleFunction} from 'ol/style/Style';
import {SecurityOperationGraphic} from "../controllers/SecurityOperationsController";
import openlayersAdapter from "../openlayersAdapter";
import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';
import {assignRole, readGraphicLabels, writeGraphicProperties} from '../graphicProperties';


/**
 * Screen-pixel sizes at scale 1. Every one is multiplied by the map resolution,
 * which is what keeps the graphic a constant size on screen as you zoom.
 */
/** Where the label anchor sits, measured from the centre. Unchanged. */
const LABEL_PADDING_PX = 50;
/**
 * Clear space between the label and the line that runs away from it.
 *
 * The two used to be locked together: the label was placed at
 * `centerPadding / 1.5`, so the gap was always a third of the padding — 25px,
 * changeable only by moving the arms too. Naming the gap lets the line come in to
 * meet the label without the label or the arrowheads moving at all.
 */
const LABEL_GAP_PX = 20;
/**
 * Where each arm's line begins — just past the label. Was 75px, which left the
 * 25px gap described above.
 */
const CENTER_PADDING_PX = LABEL_PADDING_PX + LABEL_GAP_PX;
const ARROW_LENGTH_PX = 75;
const ARROW_DEPTH_PX = 20;
const ARROW_HEAD_LENGTH_PX = 10;
const ARROW_HEAD_DEGREE = 60;

/**
 * Smallest scale factor.
 *
 * Each line runs from `centerPadding` out to `2 * arrowLength * scale`. With
 * `centerPadding` pinned, a scale that brings the outer end back to the padding
 * collapses that run to nothing, and anything below folds the line back through
 * the 2525E symbol. The floor leaves a quarter of the padding as visible line.
 *
 * The interactive resize that used to reach this is gone — see
 * `SecurityOperationsController.handleResize`. It still guards `setScale`, which
 * restore calls with a `renderer.scale` off an older snapshot.
 */
const MIN_SCALE = (CENTER_PADDING_PX * 1.25) / (2 * ARROW_LENGTH_PX);

export class SecurityOperationGraphicBase implements SecurityOperationGraphic {
    primaryLabel: string;
    /**
     * The centre point. Published from `getFeatures()` so it survives a save — it is
     * the only part of this graphic that cannot be regenerated.
     *
     * `base: false` keeps it out of the Modify interaction, which has no vertices to
     * offer here; see the same note on `MissionTaskGraphicBase.base`.
     */
    base: Feature<Point> = createCenterBaseFeature();
    centroid: Coordinate = [0, 0];
    rotation: number;
    scale: number;
    resolution: number;
    leftLabelFeature: Feature<Point> = assignRole(new Feature<Point>(), 'label');
    rightLabelFeature: Feature<Point> = assignRole(new Feature<Point>(), 'label');
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
        // The base is the feature a restore starts from, so it carries the resolution.
        this.base.set('drawingResolution', resolution);

        this.leftLabelFeature.setStyle(this.getLabelStyle('left'));
        this.rightLabelFeature.setStyle(this.getLabelStyle('right'));
        this.name = name;
    }

    setSymbolId(symbolId: string) {
        this.symbolId = symbolId;
        // Every feature, not just the graphic. A restore resolves the holder from the
        // symbolId on the base feature, which used not to carry one at all.
        this.getFeatures().forEach(f => f.set('symbolId', symbolId));
    }

    /**
     * Built fresh on each call rather than once in the constructor, because the
     * style closes over `this.rotation` and the constructor runs while that is
     * still 0. `updateFeatures` reinstalls them.
     *
     * The rotation no longer tips the letter — see `getSecurityOperationLabelStyle`,
     * where it survives only as a sub-pixel nudge. What moves the label around the
     * graphic is `placeCoordinates` rotating its anchor about the centre.
     */
    getLabelStyle = (position: 'left' | 'right'): StyleFunction => {
        return getSecurityOperationLabelStyle(this.primaryLabel, this.rotation, position);
    };

    getFeatures(): Feature[] {
        return [this.leftLabelFeature, this.rightLabelFeature, this.graphic, this.handles, this.base];
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
        // generator returns. `centerPadding` — where the lines begin — and
        // `labelPadding` are left unscaled, which pins the inner end of each line
        // and the labels. `arrowDepth` and `arrowHeadLength` are unscaled too: the
        // arrowheads move, they don't grow.
        let arrowLength = ARROW_LENGTH_PX * this.resolution * this.scale;
        let arrowDepth = ARROW_DEPTH_PX * this.resolution
        let arrowHeadLength = ARROW_HEAD_LENGTH_PX * this.resolution;
        let arrowHeadDegree = ARROW_HEAD_DEGREE;
        // Passed explicitly rather than left to the generator's `centerPadding / 1.5`
        // fallback, which is what tied the label-to-line gap to the padding.
        let labelPadding = LABEL_PADDING_PX * this.resolution;

        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            {centerPadding: this.centerPadding, labelPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree}
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

        // Reinstall the label styles so they pick up the current rotation — they close
        // over it, and the pair installed in the constructor is frozen at 0.
        this.leftLabelFeature.setStyle(this.getLabelStyle('left'));
        this.rightLabelFeature.setStyle(this.getLabelStyle('right'));

        // `rotation` is portable geometry, so it goes in the doctrinal bag. `scale` does
        // not: it is a multiplier on screen-pixel arrow lengths and means nothing without
        // the drawing resolution it multiplies. Persistence reads it off this holder and
        // files it under the snapshot's `renderer` object instead.
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)}, {
            rotation: this.rotation,
        });
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
