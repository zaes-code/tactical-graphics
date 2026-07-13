import openlayersAdapter from '../openlayersAdapter';
import {TacticalGraphicName} from '@zaes-code/tactical-graphics';
import Feature from 'ol/Feature';
import {
    createBaseFeature,
    createFeature,
    createHandleFeature,
    createOffsetHandleFeature,
    reliefInPlaceStyleFunc,
} from '../openlayerStyles';
import {MultiPoint, Point} from 'ol/geom';
import LineString from 'ol/geom/LineString';
import {LineGraphic} from '../controllers/LineGraphicController';

export class ReliefInPlace implements LineGraphic {
    rotation: number = 0;
    size: number = 1;
    name: TacticalGraphicName;

    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphic: Feature = createFeature();
    labels: Feature = new Feature<MultiPoint>();
    handles: Feature = <Feature<MultiPoint>>createHandleFeature();
    offsetHandle: Feature = <Feature<Point>>createOffsetHandleFeature();

    features: Feature[] = [];
    symbolId: string = '';

    constructor(name: TacticalGraphicName, size: number, drawingResolution?: number) {
        this.name = name;
        this.size = size;
        if (drawingResolution !== undefined) {
            this.graphic.set('drawingResolution', drawingResolution);
        }
        this.setSymbolId('');
        this.graphic.setStyle(reliefInPlaceStyleFunc('RIP'));
    }

    updateGeometry = () => {
        const tg = openlayersAdapter.getTacticalGraphic(this.name, this.base, {size: this.size});
        if (!tg) return;
        const {graphic, handles} = tg;
        this.graphic.setGeometry(graphic);
        const handleCoords = (handles as MultiPoint).getCoordinates();
        this.offsetHandle.setGeometry(new Point(handleCoords[0]));
        this.handles.setGeometry(new MultiPoint(handleCoords.slice(1)));
    };

    getBaseGraphicFeature = (): Feature<LineString> => this.base;

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.getFeatures().forEach(f => f.set('symbolId', this.symbolId));
    };

    setBaseFeature(base: Feature<LineString>) {
        this.base.setGeometry(base.getGeometry());
        this.updateGeometry();
    }

    setOffset(offset: number) {
        this.size = offset;
        this.updateGeometry();
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.handles, this.labels, this.base, this.offsetHandle];
    }
}
