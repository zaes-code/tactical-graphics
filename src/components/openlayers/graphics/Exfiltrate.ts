import openlayersAdapter from "../openlayersAdapter";
import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';
import Feature from 'ol/Feature';
import {createBaseFeature, createFeature, createHandleFeature, exfiltrateStyleFunc} from '../openlayerStyles';
import {MultiPoint} from "ol/geom";
import LineString from "ol/geom/LineString";
import {LineGraphic, visiblePathHandles} from "../controllers/LineGraphicController";
import {readGraphicLabels, writeGraphicProperties} from '../graphicProperties';

/**
 * Holder for Exfiltrate.
 *
 * Its own holder rather than a branch in `RetrogradeTask` because the two agree
 * on nothing that matters: Exfiltrate has no cane arc to size, so it publishes no
 * offset handle, and it keeps every vertex the user drew rather than exactly two.
 * What is left is the plain line-graphic contract, plus the arrowhead size the
 * generator needs.
 *
 * `size` is the arrowhead length in map units, fixed at construction (20 px at the
 * drawing zoom) exactly as the retrograde tasks size their cane. It does not track
 * a resize — `handleResize` scales the base line, not this.
 */
export class Exfiltrate implements LineGraphic {
    rotation: number = 0;
    size: number;
    name: TacticalGraphicName;

    base: Feature<LineString> = <Feature<LineString>>createBaseFeature();
    graphic: Feature = createFeature();
    handles: Feature = <Feature<MultiPoint>>createHandleFeature();

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
        this.graphic.setStyle(exfiltrateStyleFunc(getLabel(name)));
    }

    updateGeometry = () => {
        const tacticalGraphic = openlayersAdapter.getTacticalGraphic(this.name, this.base, {size: this.size});
        if (!tacticalGraphic) return;

        const {graphic, handles} = tacticalGraphic;
        this.graphic.setGeometry(graphic);
        this.handles.setGeometry(new MultiPoint(visiblePathHandles(
            (handles as MultiPoint).getCoordinates(),
            this.base.getGeometry()?.getCoordinates()[0],
            this.hidesStartHandle,
        )));

        // Persist the *effective* metre value rather than the viewport factor behind it,
        // so a restore replays a distance instead of re-deriving one from whatever zoom
        // the loading session happens to be at.
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)}, {
            radius: this.size,
        });
    };

    /**
     * Replays a stamped size. This graphic has no width handle — the hook exists so
     * restore, which calls `setOffset` for the whole line family, can hand the size back.
     */
    setOffset(size: number) {
        this.size = size;
        this.updateGeometry();
    }

    getBaseGraphicFeature = (): Feature<LineString> => this.base;

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.getFeatures().forEach(feature => {
            feature.set('symbolId', this.symbolId);
        });
    };

    setBaseFeature(base: Feature<LineString>) {
        this.base.setGeometry(base.getGeometry());
        this.updateGeometry();
    }

    getFeatures(): Feature[] {
        return [this.graphic, this.handles, this.base];
    }
}
