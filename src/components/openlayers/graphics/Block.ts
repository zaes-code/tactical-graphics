import openlayersAdapter from "../openlayersAdapter";
import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';
import Feature from 'ol/Feature';
import {
    attackByFireStyleFunc,
    blockStyleFunc,
    breachStyleFunc,
    clearStyleFunc,
    createBaseFeature,
    createFeature,
    createHandleFeature,
    createOffsetHandleFeature, defaultStyleFunc
} from '../openlayerStyles';
import {MultiPoint, Point} from "ol/geom";
import LineString from "ol/geom/LineString";
import {LineGraphic} from "../controllers/LineGraphicController";

// Graphics that lock the perpendicular size to a fixed fraction of the base length
// so the user can only rotate and resize, not change the aspect ratio. The value
// is the perpendicular-size / base-length ratio.
const RATIO_LOCK: Partial<Record<TacticalGraphicName, number>> = {
    [TacticalGraphicName.AttackByFire]: 0.4,
    [TacticalGraphicName.TacticalBlock]: 0.3,
    [TacticalGraphicName.Breach]: 0.3,
    [TacticalGraphicName.Bypass]: 0.3,
    [TacticalGraphicName.Canalize]: 0.3,
    [TacticalGraphicName.Clear]: 0.3,
    [TacticalGraphicName.TacticalDisrupt]: 0.3,
};


export class Block implements LineGraphic {
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
    private ratioLock: number | undefined;
    // Minimum base-length in screen pixels at the drawing zoom — forces the
    // graphic to render at a recognisable size from the moment the user starts
    // drawing, even if the cursor hasn't moved far from the first click.
    private static MIN_BASE_PX = 100;

    constructor(name: TacticalGraphicName, size: number, drawingResolution?: number) {
        this.name = name;
        this.size = size;
        this.ratioLock = RATIO_LOCK[name];
        if (drawingResolution !== undefined) {
            this.graphic.set('drawingResolution', drawingResolution);
        }
        this.setSymbolId('');
        this.graphic.setStyle((feature, resolution) => {
            switch (name) {
                case TacticalGraphicName.AttackByFire:
                    return attackByFireStyleFunc()(feature, resolution);
                case TacticalGraphicName.TacticalBlock:
                case TacticalGraphicName.Penetration:
                    return blockStyleFunc(getLabel(name))(feature, resolution);
                case TacticalGraphicName.Bypass:
                case TacticalGraphicName.Canalize:
                case TacticalGraphicName.Breach:
                    return breachStyleFunc(getLabel(name))(feature, resolution);
                case TacticalGraphicName.Clear:
                    return clearStyleFunc(getLabel(name))(feature, resolution);
                case TacticalGraphicName.TacticalDisrupt:
                    // 0.75 places the D at the centre of the middle trident
                    // prong (which spans 0.5 → 1.0 of the user's base line).
                    return clearStyleFunc(getLabel(name), 0.75)(feature, resolution);
                default:
                    return defaultStyleFunc()(feature, resolution);
            }
        })


    }

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            {size: this.size}
        );
        if (!tacticalGraphic) return;

        let {graphic, handles, labels} = tacticalGraphic;

        this.graphic.setGeometry(graphic);
        let handleCoords = (handles as MultiPoint).getCoordinates();
        this.handles.setGeometry(new MultiPoint(handleCoords.slice(1, handleCoords.length)));
        this.offsetHandle.setGeometry(new Point(handleCoords[0]));
    };

    setSymbolId = (symbolId: string) => {
        this.symbolId = symbolId;
        this.getFeatures().forEach(feature => {
            feature.set('symbolId', this.symbolId);
        })
    }

    setBaseFeature(base: Feature<LineString>) {
        const incoming = base.getGeometry();
        if (this.ratioLock !== undefined && incoming) {
            const coords = incoming.getCoordinates();
            if (coords.length >= 2) {
                const start = coords[0];
                const end = coords[coords.length - 1];
                const dx = end[0] - start[0];
                const dy = end[1] - start[1];
                const len = Math.hypot(dx, dy);
                const drawingRes = (this.graphic.get('drawingResolution') as number | undefined) || 1;
                const minLen = Block.MIN_BASE_PX * drawingRes;

                let workingCoords: number[][] = coords;
                if (len > 0 && len < minLen) {
                    const ux = dx / len;
                    const uy = dy / len;
                    workingCoords = [start, [start[0] + ux * minLen, start[1] + uy * minLen]];
                }
                const finalDx = workingCoords[workingCoords.length - 1][0] - workingCoords[0][0];
                const finalDy = workingCoords[workingCoords.length - 1][1] - workingCoords[0][1];
                const finalLen = Math.hypot(finalDx, finalDy);
                if (finalLen > 0) {
                    this.size = finalLen * this.ratioLock;
                    this.graphic.set('graphicSize', this.size);
                }
                this.base.setGeometry(new LineString(workingCoords));
                this.updateGeometry();
                return;
            }
        }
        this.base.setGeometry(incoming!);
        this.updateGeometry();
    }

    setOffset(offset: number) {
        if (this.ratioLock !== undefined) return; // ratio is locked — width handle disabled
        this.size = offset;
        this.updateGeometry();
    }

    getFeatures(): Feature[] {
        if (this.ratioLock !== undefined) {
            // Drop the offset handle entirely so it never renders or accepts drags.
            return [this.graphic, this.handles, this.labels, this.base];
        }
        return [this.graphic, this.handles, this.labels, this.base, this.offsetHandle];
    }

}
