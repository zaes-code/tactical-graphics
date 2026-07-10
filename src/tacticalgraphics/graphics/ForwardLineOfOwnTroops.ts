import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {IBaseGraphicOptions, TacticalGraphicName} from "../core/type";
import {Feature, LineString, MultiLineString, MultiPoint} from "geojson";
import geometryService from "../core/GeometryService";

export class ForwardLineOfOwnTroops extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.ForwardLineOfOwnTroops;
    type: string = "LineString";

    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<LineString> {
        let size = opts?.size || 1;
        return geometryService.lineStringToWave(base, size * 15, 8 * size, 15);
    }

    generateHandles(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature([baseCoords[0], baseCoords[baseCoords.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        // No labels for FLOT
        return this.asMultiPointFeature([]);
    };
}

export class LineOfContact extends TacticalGraphicsBase {
    name: string = TacticalGraphicName.LineOfContact;
    type: string = "LineString";

    generateGraphics(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiLineString> {
        let size = opts?.size || 1;
        const amplitude = 8 * size;
        const wavelength = size * 15;
        // Offset each wave's baseline perpendicular to the original line so the
        // two wave rows sit on opposite sides of the centerline and bow outward
        // (facing away from each other) rather than forming closed ovals.
        const topBaseCoords = geometryService.computeParallelLineString(base.geometry.coordinates, -amplitude * 2);
        const bottomBaseCoords = geometryService.computeParallelLineString(base.geometry.coordinates, amplitude * 2);
        const topBase = this.asLineStringFeature(topBaseCoords);
        const bottomBase = this.asLineStringFeature(bottomBaseCoords);
        const topWave = geometryService.lineStringToWave(topBase, wavelength, amplitude, 15, true);
        const bottomWave = geometryService.lineStringToWave(bottomBase, wavelength, amplitude, 15, false);
        return this.asMultiLineStringFeature([topWave.geometry.coordinates, bottomWave.geometry.coordinates]);
    }

    generateHandles(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature([baseCoords[0], baseCoords[baseCoords.length - 1]]);
    }

    generateLabels(base: Feature<LineString>, opts: IBaseGraphicOptions | undefined): Feature<MultiPoint> {
        let baseCoords = base.geometry.coordinates;
        return this.asMultiPointFeature([baseCoords[0], baseCoords[baseCoords.length - 1]]);
    };
}
