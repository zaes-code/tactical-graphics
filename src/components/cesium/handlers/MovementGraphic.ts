import {Cartesian3} from "cesium";
import cesiumAdapter from "../cesiumAdapter";
import {GraphicHandler} from "../types";
import {MovementGraphicOptions, TacticalGraphicName} from '@zaes/tactical-graphics';
import * as Cesium from 'cesium';

export class MovementGraphic implements GraphicHandler {
    primaryLabel: string = '';
    radius: number;
    name: TacticalGraphicName;

    constructor(graphicName: TacticalGraphicName, options: MovementGraphicOptions) {
        this.name = graphicName;
        this.radius = options.radius;
    }

    getGraphics = (baseCoordinates: Cartesian3[]): Cartesian3[] => {
        if (baseCoordinates.length < 2) return [];
        let tacticalGraphic = cesiumAdapter.getTacticalGraphic(this.name, baseCoordinates, {radius: this.radius});
        if (!tacticalGraphic) return [];
        let {graphic, handles, labels} = tacticalGraphic;
        // Flatten nested arrays (multi-segments)
        return (<Cartesian3[][]>graphic).flat();
    };

    addEntities(viewer: Cesium.Viewer) {
    }

}
