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
        /*
         * **All four grips are ordinary vertices now.** `handleCoords[0]` used to be the
         * U-height offset — a number beside the base — and the rest were the base's own two
         * ends. 341900 names four anchor points and each is placed, so there is no offset to
         * peel off and nothing for `offsetHandle` to hold. (User's call, 2026-09-06.)
         */
        const handleCoords = (handles as MultiPoint).getCoordinates();
        this.handles.setGeometry(new MultiPoint(visiblePathHandles(handleCoords, pivotCoordinate(this.name, this.base.getGeometry()?.getCoordinates()), this.hidesStartHandle)));
        // Persist the *effective* meter value, not the viewport factor it came from.
        // `size` starts life as `20 x drawingResolution`, but what the generator actually
        // consumed is a distance in meters — and that is what a snapshot can carry and a
        // restore can replay without knowing anything about zoom. Stamped on every
        // rebuild, not just on a width drag, so a graphic the user never touched still
        // describes itself.
        /*
         * **Nothing beside the points.** `decorationSize` carried the U's height, which is
         * where points 3 and 4 are now, and the arrowheads are sized as a share of the arrows
         * they end — so every number this symbol has is in its coordinates. A stamp beside
         * them would be a second copy, which is how the two drift. A file written before
         * 2026-09-06 still carries one and still restores: the generator reads it in its
         * two-point fallback. @see ReliefInPlace.points
         */
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)});
    };

    /*
     * **No shift any more.** This declared 1 while `handleCoords[0]` was peeled off to the
     * offset handle, so a published index was one behind the contract's. All four grips are
     * published together now, so the two index spaces are the same one.
     * @see TacticalGraphicHandler.handleIndexOffset
     */

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
