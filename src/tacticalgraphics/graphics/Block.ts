import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {Feature, LineString, MultiLineString, MultiPoint, Position} from "geojson";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import geometryService from "../core/GeometryService";

export class Block extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    type: string = 'Point';

    /**
     * Two names, one shape. FM 1-02.2 draws the Chapter 6 tactical mission task
     * and the Chapter 5 table 5-19 obstacle effect identically apart from the
     * "B", and that letter is a renderer concern (`blockStyleFunc`), so the
     * geometry is shared outright. Defaults to the mission task, the older name.
     */
    constructor(name: TacticalGraphicName = TacticalGraphicName.TacticalBlock) {
        super();
        this.name = name;
    }

    /**
     * `getBlockArrow`'s raw path, `[...base, top, bottom]`. Shared by graphics,
     * handles and labels so the three cannot drift apart.
     *
     * A 2-point graphic in practice — the `block` factory passes `maxPoints: 2`,
     * and `getBlockArrow` only reads `coordinates[0]`/`[1]` anyway — but the
     * indices below are written from the end so a longer base would not silently
     * grab a crossbar point.
     */
    private arrowPath(base: Feature<LineString>, opts: PointGraphicOptions): Position[] {
        return geometryService.getBlockArrow(base, opts.size).geometry.coordinates;
    }

    /**
     * Shaft and crossbar as **separate sub-lines**, matching how
     * `getPenetrationArrowGraphic` reports its own front line.
     *
     * This is load-bearing for the label, not cosmetic. `blockStyleFunc` takes the
     * baseline it centres the "B" on from `getCoordinates()[0]` when handed a
     * MultiLineString, but from the whole coordinate array when handed a plain
     * LineString — and this graphic used to be a plain LineString, so `end` was the
     * crossbar's far tip rather than the shaft's. The label then sat at
     * `0.5 * (1 + crossbarHalf² / shaftLen²)` along the shaft and slid every time
     * either length changed. The old ratio lock pinned that quotient at 0.09, which
     * hid it; un-ratio-locking block (2026-07-29) exposed it as a "B" that crept
     * when the shaft was resized and jumped from 0.51 to 0.64 when the crossbar was
     * widened. Reporting the shaft on its own puts the label at a flat 0.5, exactly
     * as penetration's "P" has always been.
     *
     * Also drops a doubled stroke: the old path ran p1 → top → bottom, retracing
     * p1 → top on the way back down.
     */
    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiLineString> {
        const arrow = this.arrowPath(base, opts);
        const shaft = arrow.slice(0, -2);
        const crossbar = arrow.slice(-2);
        return this.asMultiLineStringFeature([shaft, crossbar]);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        const arrow = this.arrowPath(base, opts);
        // [width handle (the crossbar's far end), p0, shaft end] — the block-family
        // order the OpenLayers holder splits `handles[0]` off from.
        return this.asMultiPointFeature([arrow[arrow.length - 1], arrow[0], arrow[arrow.length - 3]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        return this.asMultiPointFeature([this.arrowPath(base, opts)[0]]);
    }

}
