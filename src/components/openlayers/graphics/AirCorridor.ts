import {
    airCorridorCircleStyleFunc
} from '../openlayerStyles';

import {MovementGraphicBase} from './MovementGraphicBase';
import openlayersAdapter from "../openlayersAdapter";
import {TacticalGraphicName} from '@zaes/tactical-graphics';

export class AirCorridor extends MovementGraphicBase {
    constructor(name: TacticalGraphicName, offset: number, resolution: number = 0) {
        super(name, offset, resolution);

        this.graphic.setStyle(feature => {
            return airCorridorCircleStyleFunc(feature);
        });
    }

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.graphicName,
            this.base,
            {radius: this.offset}
        );
        if (!tacticalGraphic) return;

        const {graphic, handles, labels} = tacticalGraphic;

        this.graphic.setGeometry(graphic);
        this.handles.setGeometry(handles);
        this.labels.setGeometry(labels);
    };

}
