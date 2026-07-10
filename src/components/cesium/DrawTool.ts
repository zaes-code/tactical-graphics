import * as Cesium from "cesium";
import cesiumAdapter from "./cesiumAdapter";
import {TacticalGraphicName} from '@zaes/tactical-graphics';

export type DrawType = "LineString" | "Polygon";

export interface DrawToolOptions {
    viewer: Cesium.Viewer;
    type: DrawType;
    onDrawStart?: () => void;
    onDrawEnd?: (positions: Cesium.Cartesian3[]) => void;
    selectedGraphic: TacticalGraphicName;
}

export class DrawTool {
    private viewer: Cesium.Viewer;
    private handler: Cesium.ScreenSpaceEventHandler | null = null;
    private positions: Cesium.Cartesian3[] = [];
    private hoverPosition: Cesium.Cartesian3 | null = null;
    private entity: Cesium.Entity | null = null;

    private graphicsPositions: Cesium.Cartesian3[] = [];
    private graphics: Cesium.Entity | null = null;

    private onDrawStart?: () => void;
    private onDrawEnd?: (positions: Cesium.Cartesian3[]) => void;
    private type: DrawType;

    private previewColor: Cesium.Color = Cesium.Color.BLUE;
    private renderColor: Cesium.Color = Cesium.Color.BLUE;
    private drawGraphic: TacticalGraphicName;

    constructor(options: DrawToolOptions) {
        this.viewer = options.viewer;
        this.type = options.type;
        this.onDrawStart = options.onDrawStart;
        this.onDrawEnd = options.onDrawEnd;
        this.drawGraphic = options.selectedGraphic;
    }

    start() {
        const scene = this.viewer.scene;
        if (!scene) return;

        this.positions = [];
        this.hoverPosition = null;

        // Create entity immediately
        // add the entities associated with the handlers.
        this.entity = this.viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => {
                    if (this.hoverPosition && this.positions.length > 0) {
                        return [...this.positions, this.hoverPosition];
                    }
                    return [...this.positions];
                }, false),
                width: 3,
                material: this.previewColor,
            },
        });
        let handler = cesiumAdapter.getGraphicHandler(this.drawGraphic, {
            radius: 100000
        });
        handler.addEntities(this.viewer);

        this.graphics = this.viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => {
                    let currPositions = [...this.positions]
                    if (this.hoverPosition && this.positions.length > 0) {
                        currPositions.push(this.hoverPosition);
                    }
                    this.graphicsPositions = handler.getGraphics(currPositions);
                    return this.graphicsPositions;
                }, false),
                width: 3,
                material: this.previewColor,
            },
        });

        this.handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);

        // Mouse move → update hover position
        this.handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
            let pos: Cesium.Cartesian3 | undefined;

            if (scene.mode === Cesium.SceneMode.SCENE2D) {
                pos = scene.camera.pickEllipsoid(movement.endPosition, scene.globe.ellipsoid) || undefined;
            } else {
                pos = scene.pickPosition(movement.endPosition) as Cesium.Cartesian3 | undefined;
            }

            if (!pos) return;
            this.hoverPosition = pos;
        }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

        // Click → commit point
        let lastClickTime = 0;
        let clickTimeout: any = null;
        let clickThreshold: number = 300;

        this.handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
            let cartesian: Cesium.Cartesian3 | undefined;
            if (scene.mode === Cesium.SceneMode.SCENE2D) {
                cartesian = scene.camera.pickEllipsoid(click.position, scene.globe.ellipsoid) || undefined;
            } else {
                cartesian = scene.pickPosition(click.position) as Cesium.Cartesian3 | undefined;
            }

            if (!cartesian) return;

            const now = Date.now();
            if (now - lastClickTime < clickThreshold) {
                // Double click → finish drawing
                if (this.hoverPosition) {
                    this.positions.push(this.hoverPosition); // commit last hover
                }
                this.finish();
                clearTimeout(clickTimeout);
                lastClickTime = 0;
                return;
            }

            lastClickTime = now;
            this.positions.push(cartesian);

            clickTimeout = setTimeout(() => {
                lastClickTime = 0;
            }, clickThreshold);

        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }

    remove() {
        this.finish();
    }

    private finish() {
        if (this.handler) {
            this.handler.destroy();
            this.handler = null;
        }

        if (!this.positions.length) return;

        // Remove preview entity
        if (this.entity) {
            this.viewer.entities.remove(this.entity);
            this.entity = null;
        }

        if (this.graphics) {
            this.viewer.entities.remove(this.graphics);
            this.graphics = null;
        }
        // Add permanent entity
        if (this.type === "LineString") {
            // create a graphic object
            // add the entities associated with the handlers.
            this.viewer.entities.add({
                polyline: {
                    positions: [...this.positions], // final positions
                    width: 3,
                    material: this.renderColor,
                },
            });
            this.viewer.entities.add({
                polyline: {
                    positions: [...this.graphicsPositions], // final positions
                    width: 3,
                    material: this.renderColor,
                },
            });

        } else if (this.type === "Polygon") {
            this.viewer.entities.add({
                polygon: {
                    hierarchy: new Cesium.PolygonHierarchy([...this.positions]),
                    material: this.renderColor,
                },
            });
        }

        this.hoverPosition = null;
        this.positions = [];
    }
}

export default DrawTool;