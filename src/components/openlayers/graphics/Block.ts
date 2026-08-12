import openlayersAdapter from "../openlayersAdapter";
import {getLabel, ratioLockOf, TacticalGraphicName} from '@zaes/tactical-graphics';
import Feature from 'ol/Feature';
import {
    attackByFireStyleFunc,
    blockStyleFunc,
    breachStyleFunc,
    clearStyleFunc,
    createBaseFeature,
    createFeature,
    createHandleFeature,
    createOffsetHandleFeature, defaultStyleFunc,
    supportByFireStyleFunc,
} from '../openlayerStyles';
import {MultiPoint, Point} from "ol/geom";
import LineString from "ol/geom/LineString";
import {LineGraphic, visiblePathHandles} from "../controllers/LineGraphicController";
import {assignRole, readGraphicLabels, writeGraphicProperties} from '../graphicProperties';

/**
 * Drag sensitivity for the width handle, where the shared 0.5 default is wrong.
 * `TacticalGraphicsManager.handleOffset` sets `offset = perpendicularDistance ×
 * offsetScale`, so the factor must be the reciprocal of however many `size`s out
 * the generator draws the handle — otherwise it runs away from the cursor.
 */
const OFFSET_SCALE: Partial<Record<TacticalGraphicName, number>> = {
    // Handle is the end of the front line, drawn at 3 × size (`frontHalf`).
    [TacticalGraphicName.Penetration]: 1 / 3,
    // Handle is the end of the crossbar, drawn at 1 × size by `getBlockArrow`.
    [TacticalGraphicName.TacticalBlock]: 1,
    [TacticalGraphicName.Block]: 1,
    // Handle is an arrowhead wing, `size × sin 45°` off the base line.
    [TacticalGraphicName.Exploitation]: Math.SQRT2,
};

/**
 * Per-name override of the perpendicular size the `block` factory hands every
 * member of the family (20 px at the drawing zoom), in the same screen-pixel unit.
 *
 * `TacticalBlock` needs one because it and `Penetration` must look and behave
 * identically (user's call, 2026-07-29) and their generators spend `size`
 * differently: `getPenetrationArrowGraphic` draws its front line at ±3 × size —
 * 120 px across at the default — while `getBlockArrow` draws its crossbar at
 * ±1 × size, which would be 40 px. 60 px puts block's crossbar at the same 120 px
 * as penetration's front line on a fresh draw. Raising it here rather than in
 * `getBlockArrow` is deliberate: that helper is shared, and was left alone so
 * the excluded FollowAndAssume / FollowAndSupport come back unchanged.
 */
const DEFAULT_SIZE_PX: Partial<Record<TacticalGraphicName, number>> = {
    [TacticalGraphicName.TacticalBlock]: 60,
    [TacticalGraphicName.Block]: 60,
};


export class Block implements LineGraphic {
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
    /** @see LineGraphic.offsetScale — read off the controller by the manager. */
    offsetScale?: number;
    private ratioLock: number | undefined;
    /**
     * Suspends the `MIN_BASE_PX` floor below while a snapshot is rebuilt.
     *
     * That floor *extends the base geometry*, and it is a screen-pixel constant times
     * the map resolution — right on a draw (it keeps a barely-dragged graphic legible)
     * and wrong on a restore, where the geometry is already final and re-applying a
     * larger floor silently lengthens the line the user drew. Set by
     * `applyRestoredGeometry` for the rebuild only. @see LineGraphicBase for the twin.
     */
    suspendMinimumLength = false;
    // Minimum base-length in screen pixels at the drawing zoom — forces the
    // graphic to render at a recognisable size from the moment the user starts
    // drawing, even if the cursor hasn't moved far from the first click.
    private static MIN_BASE_PX = 100;

    constructor(name: TacticalGraphicName, size: number, drawingResolution?: number) {
        this.name = name;
        // `size` arrives as 20 × drawingResolution; an override is expressed in the
        // same screen pixels, so rescale rather than replace.
        const sizePx = DEFAULT_SIZE_PX[name];
        this.size = sizePx !== undefined && drawingResolution ? sizePx * drawingResolution : size;
        this.ratioLock = ratioLockOf(name);
        this.offsetScale = OFFSET_SCALE[name];
        if (drawingResolution !== undefined) {
            this.graphic.set('drawingResolution', drawingResolution);
        }
        this.setSymbolId('');
        this.graphic.setStyle((feature, resolution) => {
            switch (name) {
                case TacticalGraphicName.AttackByFire:
                    return attackByFireStyleFunc(name)(feature, resolution);
                case TacticalGraphicName.SupportByFire:
                    return supportByFireStyleFunc()(feature, resolution);
                case TacticalGraphicName.TacticalBlock:
                case TacticalGraphicName.Penetration:
                // The table 5-19 twin: getLabel returns '' for it, and
                // blockStyleFunc reads that as "no letter, no gap".
                case TacticalGraphicName.Block:
                    return blockStyleFunc(getLabel(name))(feature, resolution);
                case TacticalGraphicName.Bypass:
                case TacticalGraphicName.Canalize:
                case TacticalGraphicName.Breach:
                    return breachStyleFunc(getLabel(name))(feature, resolution);
                case TacticalGraphicName.Clear:
                    return clearStyleFunc(getLabel(name))(feature, resolution);
                case TacticalGraphicName.TacticalDisrupt:
                case TacticalGraphicName.Disrupt:
                    // 0.75 places the D at the center of the middle trident
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
        this.handles.setGeometry(new MultiPoint(visiblePathHandles(handleCoords.slice(1), this.base.getGeometry()?.getCoordinates()[0], this.hidesStartHandle)));
        this.offsetHandle.setGeometry(new Point(handleCoords[0]));

        // Persist the *effective* meter value rather than the viewport factor behind it.
        // A ratio-locked name re-derives `size` from the base length on restore and
        // ignores this; the rest have no other record of the size they were built with.
        writeGraphicProperties(this.getFeatures(), this.name, {...readGraphicLabels(this.graphic)}, {
            decorationSize: this.size,
        });
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
                if (len > 0 && len < minLen && !this.suspendMinimumLength) {
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
