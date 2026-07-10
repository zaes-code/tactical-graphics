import * as Cesium from "cesium";

type PositionType = Cesium.Cartesian3 | Cesium.Cartesian3[] | Cesium.Cartesian3[][];

export interface GraphicHandler {
    getGraphics(baseCoordinates: PositionType): any;

    addEntities(viewer: Cesium.Viewer): void;
}

abstract class BaseFeature {
    protected _viewer?: Cesium.Viewer;

    protected _entity?: Cesium.Entity;

    get entity() {
        return this._entity;
    }

    abstract addToViewer(viewer: Cesium.Viewer): void;

    abstract updatePositions(positions: PositionType): void;

    abstract removeFromViewer(): void;
}

// ------------------- Point -------------------
export class PointFeature extends BaseFeature {
    constructor(private _position: Cesium.Cartesian3) {
        super();
    }

    addToViewer(viewer: Cesium.Viewer) {
        if (this._entity) return;
        this._viewer = viewer;
        this._entity = viewer.entities.add({
            position: this._position,
            point: {pixelSize: 10, color: Cesium.Color.RED},
        });
    }

    updatePositions(position: Cesium.Cartesian3) {
        this._position = position;
        if (this._entity) this._entity.position = new Cesium.ConstantPositionProperty(position);
    }

    removeFromViewer() {
        if (this._entity && this._viewer) {
            this._viewer.entities.remove(this._entity);
            this._entity = undefined;
        }
    }
}

// ------------------- MultiPoint -------------------
export class MultiPointFeature extends BaseFeature {
    private _entities: Cesium.Entity[] = [];

    constructor(private _positions: Cesium.Cartesian3[]) {
        super();
    }

    addToViewer(viewer: Cesium.Viewer) {
        if (this._entities.length) return;
        this._viewer = viewer;
        this._entities = this._positions.map((pos) =>
            viewer.entities.add({
                position: pos,
                point: {pixelSize: 8, color: Cesium.Color.BLUE},
            })
        );
    }

    updatePositions(positions: Cesium.Cartesian3[]) {
        this._positions = positions;
        this._entities.forEach((e, i) => {
            if (positions[i]) e.position = new Cesium.ConstantPositionProperty(positions[i]);
        });
    }

    removeFromViewer() {
        if (this._viewer) {
            this._entities.forEach((e) => this._viewer!.entities.remove(e));
            this._entities = [];
        }
    }
}

// ------------------- LineString -------------------
export class LineStringFeature extends BaseFeature {
    constructor(private _positions: Cesium.Cartesian3[]) {
        super();
    }

    addToViewer(viewer: Cesium.Viewer) {
        if (this._entity) return;
        this._viewer = viewer;
        const positions = this._positions;
        this._entity = viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => positions, false),
                width: 3,
                material: Cesium.Color.GREEN,
            },
        });
    }

    updatePositions(positions: Cesium.Cartesian3[]) {
        this._positions.splice(0, this._positions.length, ...positions);
    }

    removeFromViewer() {
        if (this._entity && this._viewer) {
            this._viewer.entities.remove(this._entity);
            this._entity = undefined;
        }
    }
}

// ------------------- MultiLineString -------------------
export class MultiLineStringFeature extends BaseFeature {
    private _entities: Cesium.Entity[] = [];

    constructor(private _positionsArray: Cesium.Cartesian3[][]) {
        super();
    }

    addToViewer(viewer: Cesium.Viewer) {
        if (this._entities.length) return;
        this._viewer = viewer;
        this._entities = this._positionsArray.map((positions) =>
            viewer.entities.add({
                polyline: {
                    positions: new Cesium.CallbackProperty(() => positions, false),
                    width: 2,
                    material: Cesium.Color.ORANGE,
                },
            })
        );
    }

    updatePositions(positionsArray: Cesium.Cartesian3[][]) {
        this._positionsArray.forEach((positions, i) => {
            positions.splice(0, positions.length, ...positionsArray[i]);
        });
    }

    removeFromViewer() {
        if (this._viewer) {
            this._entities.forEach((e) => this._viewer!.entities.remove(e));
            this._entities = [];
        }
    }
}

// ------------------- Polygon -------------------
export class PolygonFeature extends BaseFeature {
    constructor(private _positions: Cesium.Cartesian3[]) {
        super();
    }

    addToViewer(viewer: Cesium.Viewer) {
        if (this._entity) return;
        this._viewer = viewer;
        const positions = this._positions;
        this._entity = viewer.entities.add({
            polygon: {
                hierarchy: new Cesium.CallbackProperty(() => new Cesium.PolygonHierarchy(positions), false),
                material: Cesium.Color.YELLOW.withAlpha(0.5),
            },
        });
    }

    updatePositions(positions: Cesium.Cartesian3[]) {
        this._positions.splice(0, this._positions.length, ...positions);
    }

    removeFromViewer() {
        if (this._entity && this._viewer) {
            this._viewer.entities.remove(this._entity);
            this._entity = undefined;
        }
    }
}

// ------------------- MultiPolygon -------------------
export class MultiPolygonFeature extends BaseFeature {
    private _entities: Cesium.Entity[] = [];

    constructor(private _positionsArray: Cesium.Cartesian3[][]) {
        super();
    }

    addToViewer(viewer: Cesium.Viewer) {
        if (this._entities.length) return;
        this._viewer = viewer;
        this._entities = this._positionsArray.map((positions) =>
            viewer.entities.add({
                polygon: {
                    hierarchy: new Cesium.CallbackProperty(() => new Cesium.PolygonHierarchy(positions), false),
                    material: Cesium.Color.PURPLE.withAlpha(0.5),
                },
            })
        );
    }

    updatePositions(positionsArray: Cesium.Cartesian3[][]) {
        this._positionsArray.forEach((positions, i) => {
            positions.splice(0, positions.length, ...positionsArray[i]);
        });
    }

    removeFromViewer() {
        if (this._viewer) {
            this._entities.forEach((e) => this._viewer!.entities.remove(e));
            this._entities = [];
        }
    }
}