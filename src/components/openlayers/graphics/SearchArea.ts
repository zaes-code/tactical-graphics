import {SearchAreaGraphic} from "../../../components/openlayers/controllers/SearchAreaController";
import {Coordinate} from "ol/coordinate";
import Feature from "ol/Feature";
import {createFeature, createHandleFeature} from "../openlayerStyles";
import {MultiLineString, MultiPoint, Point} from "ol/geom";
import {_scaleAndRotateCoordinates} from "../../../utils/scaleAndRotateCoordinates";
import openlayersAdapter from "../openlayersAdapter";

import {TacticalGraphicName} from '@zaes/tactical-graphics';

export class SearchArea implements SearchAreaGraphic {
    base: Feature<Point> = new Feature<Point>();
    centroid: Coordinate = [0, 0];
    graphics: Feature = createFeature();
    handles: Feature = createHandleFeature();
    rotation: number = 0;
    size: number = 1;
    symbolId: string = '';
    name: TacticalGraphicName;

    constructor(name: TacticalGraphicName) {
        this.name = name;
    }

    getFeatures(): Feature[] {
        return [this.graphics, this.handles];
    }

    setSymbolId(symbolId: string): void {
        this.symbolId = symbolId;
        this.graphics.set('symbolId', this.symbolId);
        this.handles.set('symbolId', this.symbolId);
    }

    setBaseFeature(base: Feature<Point>): void {
        this.base = base;
        this.updateGeometry();
    }

    scaleCoordinates = (coordinates: Coordinate[]) => {
        return coordinates.map(coord => {
            return _scaleAndRotateCoordinates(coord, this.base.getGeometry()!.getCoordinates(), this.size, this.rotation);
        });
    }

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
        );
        if (!tacticalGraphic) return;

        let {graphic, handles, labels} = tacticalGraphic;
        let scaledGraphicCoordinates = (graphic as MultiLineString).getCoordinates().map(this.scaleCoordinates);

        (graphic as MultiLineString).setCoordinates(scaledGraphicCoordinates);

        let scaledHandleCoordinates = (handles as MultiPoint).getCoordinates().map(coord => {
            return _scaleAndRotateCoordinates(coord, this.base.getGeometry()!.getCoordinates(), this.size, this.rotation);
        });
        (handles as MultiPoint).setCoordinates(scaledHandleCoordinates);

        this.graphics.setGeometry(graphic);
        this.handles.setGeometry(handles);
    };

    getRotation(): number {
        return this.rotation;
    }

    getScale(): number {
        return this.size;
    }

    setRotation(rotation: number): void {
        this.rotation = rotation;
        this.updateGeometry();
    }

    setScale(scale: number): void {
        this.size = scale;
        this.updateGeometry();
    }

}