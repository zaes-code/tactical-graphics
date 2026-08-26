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
import {LineGraphic, pivotCoordinate, visiblePathHandles} from '../controllers/LineGraphicController';
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
        this.handles.setGeometry(new MultiPoint(visiblePathHandles(handleCoords.slice(1), pivotCoordinate(this.name, this.base.getGeometry()?.getCoordinates()), this.hidesStartHandle)));
        // Persist the *effective* meter value, not the viewport factor it came from.
        // `size` starts life as `20 x drawingResolution`, but what the generator actually
        // consumed is a distance in meters — and that is what a snapshot can carry and a
        // restore can replay without knowing anything about zoom. Stamped on every
        // rebuild, not just on a width drag, so a graphic the user never touched still
        // describes itself.
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)}, {
            decorationSize: this.size,
        });
    };

    /**
     * `handles` is `handleCoords.slice(1)`: `handleCoords[0]` goes to `offsetHandle`.
     *
     * The generator's contract calls index 0 the `mirror` handle, so without this the
     * manager read the arrow tip — contract index 1 — as the mirror and claimed its drag
     * as a flip, which is why that handle appeared to do nothing.
     * @see TacticalGraphicHandler.handleIndexOffset
     */
    handleIndexOffset = 1;

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
        // so it has to be saved. Persisted as `decorationSize` — it sizes the drawn
        // decoration, and is not a reach from any center. @see TacticalGraphicProperties.
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)}, {
            decorationSize: this.size,
        });
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.handles, this.labels, this.base, this.offsetHandle];
    }
}
