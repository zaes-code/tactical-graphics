import Feature from 'ol/Feature';
import {Coordinate} from 'ol/coordinate';
import {MultiLineString, MultiPoint, Point} from 'ol/geom';
import {createFeature, createHandleFeature, getSecurityOperationLabelStyle} from '../openlayerStyles';
import {_scaleAndRotateCoordinates} from '../../../utils/scaleAndRotateCoordinates';
import {StyleFunction} from 'ol/style/Style';
import {SecurityOperationGraphic} from "../controllers/SecurityOperationsController";
import openlayersAdapter from "../openlayersAdapter";
import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';


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
        this.centerPadding = 75 * this.resolution;

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
    scaleCoordinates = (coordinates: Coordinate[]) => {
        return coordinates.map(coord => {
            return _scaleAndRotateCoordinates(coord, this.base.getGeometry()!.getCoordinates(), this.scale, this.rotation);
        });
    }
    updateFeatures = () => {
        let arrowLength = 75 * this.resolution;
        let arrowDepth = 20 * this.resolution
        let arrowHeadLength = this.resolution * 10;
        let arrowHeadDegree = 60;

        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            {centerPadding: this.centerPadding, arrowLength, arrowDepth, arrowHeadLength, arrowHeadDegree}
        );
        if (!tacticalGraphic) return;

        let {graphic, handles, labels} = tacticalGraphic;
        let scaledGraphicCoordinates = (graphic as MultiLineString).getCoordinates().map(this.scaleCoordinates);
        (graphic as MultiLineString).setCoordinates(scaledGraphicCoordinates);

        let scaledHandleCoordinates = (handles as MultiPoint).getCoordinates().map(coord => {
            return _scaleAndRotateCoordinates(coord, this.base.getGeometry()!.getCoordinates(), this.scale, this.rotation);
        });
        (handles as MultiPoint).setCoordinates(scaledHandleCoordinates);

        let scaledLabelPoints = (labels as MultiPoint).getCoordinates().map(coord => {
            return _scaleAndRotateCoordinates(coord, this.base.getGeometry()!.getCoordinates(), this.scale, this.rotation);
        });
        this.graphic.setGeometry(graphic);
        this.handles.setGeometry(handles);
        this.leftLabelFeature.setGeometry(new Point(scaledLabelPoints[0]));
        this.rightLabelFeature.setGeometry(new Point(scaledLabelPoints[1]));

    };

    // handle resolution changes
    updateCenterPadding(resolution: number) {
        this.centerPadding = 75 * resolution;
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
        this.scale = scale;
        this.updateFeatures();
    };

    getBaseFeature(): Feature<Point> {
        return this.base;
    }

}
