import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {PointGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

/**
 * Block-arrow mission task graphic with a configurable name.
 *
 * AttackByFire renders as the standard MIL-STD-2525E AttackByFire symbol —
 * backward "<" feathers at the start plus a shaft ending in an arrowhead.
 * All other names render the plain T-shape block arrow.
 *
 * Used for: AttackByFire, Destroy, Neutralize, SupportByFire, Suppress,
 *           Interdict, FollowAndAssume, FollowAndSupport.
 */
export class NamedBlockArrow extends TacticalGraphicsBase<PointGraphicOptions> {
    name: string;
    type: string = 'Point';

    constructor(name: TacticalGraphicName) {
        super();
        this.name = name;
    }

    private isAttackByFire(): boolean {
        return this.name === TacticalGraphicName.AttackByFire;
    }

    generateGraphics(base: Feature<LineString>, opts: PointGraphicOptions): Feature<LineString | MultiLineString> {
        if (this.isAttackByFire()) {
            return geometryService.getAttackByFireSymbol(base.geometry.coordinates, opts.size);
        }
        return geometryService.getBlockArrow(base, opts.size);
    }

    generateHandles(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        if (this.isAttackByFire()) {
            // [offsetHandle (hidden by openlayers Block class), startHandle, endHandle]
            const coords = base.geometry.coordinates;
            return this.asMultiPointFeature([coords[0], coords[0], coords[coords.length - 1]]);
        }
        const arrow = geometryService.getBlockArrow(base, opts.size).geometry.coordinates;
        return this.asMultiPointFeature([arrow[3], arrow[0], arrow[1]]);
    }

    generateLabels(base: Feature<LineString>, opts: PointGraphicOptions): Feature<MultiPoint> {
        if (this.isAttackByFire()) {
            // Anchor at shaft start; the style function offsets the label above the shaft.
            return this.asMultiPointFeature([base.geometry.coordinates[0]]);
        }
        const arrow = geometryService.getBlockArrow(base, opts.size).geometry.coordinates;
        return this.asMultiPointFeature([arrow[0]]);
    }
}
