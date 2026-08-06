import openlayersAdapter from '../openlayersAdapter';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
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
import {LineGraphic, visiblePathHandles} from '../controllers/LineGraphicController';
import {assignRole, readGraphicLabels, writeGraphicProperties} from '../graphicProperties';

export class ReliefInPlace implements LineGraphic {
    rotation: number = 0;
    size: number = 1;
    name: TacticalGraphicName;

    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphic: Feature = createFeature();
    labels: Feature = assignRole(new Feature<MultiPoint>(), 'label');
    handles: Feature = <Feature<MultiPoint>>createHandleFeature();
    offsetHandle: Feature = <Feature<Point>>createOffsetHandleFeature();

    features: Feature[] = [];
    symbolId: string = '';
    /** @see LineGraphic.hidesStartHandle — set by LineGraphicController. */
    hidesStartHandle?: boolean;

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
        this.handles.setGeometry(new MultiPoint(visiblePathHandles(handleCoords.slice(1), this.base.getGeometry()?.getCoordinates()[0], this.hidesStartHandle)));
        // Persist the *effective* metre value, not the viewport factor it came from.
        // `size` starts life as `20 x drawingResolution`, but what the generator actually
        // consumed is a distance in metres — and that is what a snapshot can carry and a
        // restore can replay without knowing anything about zoom. Stamped on every
        // rebuild, not just on a width drag, so a graphic the user never touched still
        // describes itself.
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)}, {
            radius: this.size,
        });
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
        // `size` here is the width the user dragged, not a construction-time constant,
        // so it has to be saved. Persisted as `radius` — the schema's name for an
        // offset-style scalar — to keep it distinct from a generator `size` default.
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)}, {
            radius: this.size,
        });
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.handles, this.labels, this.base, this.offsetHandle];
    }
}
