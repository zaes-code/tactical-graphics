import VectorSource from "ol/source/Vector";
import VectorLayer from "ol/layer/Vector";
import openlayersAdapter, {TacticalGraphicHandler} from "./openlayersAdapter";
import {Feature, MapBrowserEvent} from "ol";
import {Draw, Modify, Pointer} from "ol/interaction";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import {FeatureLike} from "ol/Feature";
import {Map} from "ol";
import {DrawEvent} from "ol/interaction/Draw";
import Collection from "ol/Collection";
import {Style} from "ol/style";
import {ModifyEvent} from "ol/interaction/Modify";
import {Point, Polygon} from "ol/geom";
import LineString from "ol/geom/LineString";
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {Coordinate} from "ol/coordinate";

export enum InteractionType {
    'resize',
    'rotate',
    'translate',
    'modify',
    'drawing',
    'view'
}

/*
* Class used for interacting with the openlayers map
* Interactions include
*  - Drawing a new tactical graphic into a vector layer/source,
*  - Calculating the offset value for rotating, resizing, and repositioning a tactical graphic
*  - Adding a modify interaction for polygon/linestring like graphics to add or reposition existing vertices
* */
export class TacticalGraphicsManager {
    // Sample vector source/layer to add tactical graphics to, this can be changed based on implementation.
    renderingVectorSource = new VectorSource();
    renderingVectorLayer = new VectorLayer({source: this.renderingVectorSource});

    // track the last pointer position for offset calculations
    lastPointerPosition: any;

    // track the currently clicked tactical graphic
    activeController: TacticalGraphicHandler | undefined;
    activeFeature: Feature | undefined;

    // store the created tactical graphics, each containing a symbolId for a unique reference
    graphicControllers: TacticalGraphicHandler[] = [];

    // current interaction mode, toggled by an external caller
    currentMode: InteractionType = InteractionType.view;

    // openlayer references.
    map: Map;
    draw: Draw | undefined = undefined;
    modify: Modify | undefined = undefined;
    lastDrawEndedAt: number = 0;
    private escKeyHandler: ((e: KeyboardEvent) => void) | undefined = undefined;
    private dblClickZoom: DoubleClickZoom | undefined = undefined;

    // add layer and pointer interactions to an openlayers map reference.
    constructor(map: Map) {
        this.map = map;
        let pointerInteraction = this.getPointerInteraction();
        this.map.addInteraction(pointerInteraction);
        this.map.addLayer(this.renderingVectorLayer);
    }

    // the interaction modes that display markers on tactical graphics to let the user transform
    enableHandleModes = (): InteractionType[] => {
        return [InteractionType.rotate, InteractionType.resize, InteractionType.modify, InteractionType.translate];
    };

    setInteractionMode = (newMode: InteractionType) => {
        this.currentMode = newMode;
        this.toggleHandleFeatures();
        this.toggleModifyInteraction();
    };

    // display the markers for letting a user drag/resize/modify/rotate a tactical graphic.
    toggleHandleFeatures = (): void => {
        this.getRenderedFeaturesByProp('handle').forEach(feature => {
            feature.set('hidden', !this.enableHandleModes().includes(this.currentMode));
        });
    };

    toggleModifyInteraction = (): void => {
        if (this.currentMode === InteractionType.modify) {
            this.addModifyInteraction();
        } else {
            this.removeModifyInteraction();
        }
    };

    // select features from the tactical graphics based on a property.
    getRenderedFeaturesByProp = (prop: string): Feature[] => {
        return this.renderingVectorSource.getFeatures().filter(feature => feature.get(prop));
    };

    isRotating = (): boolean => {
        return this.currentMode === InteractionType.rotate;
    };

    isResizing = (): boolean => {
        return this.currentMode === InteractionType.resize;
    };

    isTranslating = (): boolean => {
        return this.currentMode === InteractionType.translate;
    };

    isModifying = (): boolean => {
        return this.currentMode === InteractionType.modify;
    };

    isDrawing = (): boolean => {
        return this.currentMode === InteractionType.drawing;
    };

    isViewing = (): boolean => {
        return this.currentMode === InteractionType.view;
    };

    getFeatureController = (feature: Feature): TacticalGraphicHandler | undefined => {
        return this.graphicControllers.find(controller => controller.getFeatures().includes(feature));
    };
    getFeatureControllerBySymbolId = (symbolId: string): TacticalGraphicHandler | undefined => {
        return this.graphicControllers.find(controller => controller.getSymbolId() === symbolId);
    };

    // define what happens on mouse down, drag and mouse up events.
    getPointerInteraction = () => {
        return new Pointer({
            handleDownEvent: this.handleDownEvent,
            handleDragEvent: this.handleDragEvent,
            handleUpEvent: (): boolean => {
                this.lastPointerPosition = null;
                this.activeController = undefined;
                return false;
            },
        });
    };

    // set the state of the manager based on what feature is clicked
    // return true if the rotate, translate or resize mode is enabled to proceed with the Drag event.
    handleDownEvent = (evt: MapBrowserEvent): boolean => {
        const featureLike = this.map?.forEachFeatureAtPixel(evt.pixel, function (feature) {
            return feature;
        });
        if (!featureLike) return false;

        let feature = this.asFeature(featureLike);
        if (!feature) return false;
        this.activeFeature = feature;

        // check if any controller owns the feature;
        this.activeController = this.getFeatureController(feature);
        if (!this.activeController) return false;

        this.lastPointerPosition = evt.coordinate;

        return this.isRotating() || this.isTranslating() || this.isResizing();
    };

    handleDragEvent = (evt: MapBrowserEvent): void => {
        if (!this.lastPointerPosition || !this.activeController) return;

        // handle point vs linestring vs polygon vs circular graphics differently.
        let geomType = this.activeController.geomHandleType;
        switch (geomType) {
            case 'Point':
                this.handlePointDrag(evt);
                break;
            case 'LineString':
                this.handleLineStringDrag(evt);
                break;
            case 'Polygon':
                this.handlePolygonDrag(evt);
                break;
            case 'Circle':
                this.handleCircleDrag(evt);
                break;
        }
    };

    defaultTranslateFunction = (evt: MapBrowserEvent) => {
        const deltaX = evt.coordinate[0] - this.lastPointerPosition[0];
        const deltaY = evt.coordinate[1] - this.lastPointerPosition[1];
        this.activeController?.handleTranslate(deltaX, deltaY);
        this.lastPointerPosition = evt.coordinate;
    };

    handlePointDrag = (evt: MapBrowserEvent) => {
        if (!this.activeController) return;
        let center = this.activeController.getBaseGeometry() as number[];
        switch (this.currentMode) {
            case InteractionType.translate:
                this.defaultTranslateFunction(evt);
                break;
            case InteractionType.rotate:
                let deltaAngle = this.calculateDeltaAngle(evt, center);
                this.activeController.handleRotate(deltaAngle);
                this.lastPointerPosition = evt.coordinate;
                break;
            case InteractionType.resize:
                // Calculate distance to center for scaling
                this.handleResize(evt);
                this.lastPointerPosition = evt.coordinate;
                break;
        }
    };

    handleCircleDrag = (evt: MapBrowserEvent) => {
        if (!this.activeController) return;
        let center = this.activeController.getBaseGeometry() as number[];
        switch (this.currentMode) {
            case InteractionType.translate:
                this.defaultTranslateFunction(evt);
                break;
            case InteractionType.rotate:
                let deltaAngle = this.calculateDeltaAngle(evt, center);
                // normalize to [-PI, PI]
                deltaAngle = ((deltaAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
                // convert to degrees if your internal rotation is in deg
                const deltaDeg = (deltaAngle * 180) / Math.PI;
                this.activeController.handleRotate(deltaDeg);
                this.lastPointerPosition = evt.coordinate;
                break;
            case InteractionType.resize:
                // Calculate distance to center for scaling
                this.handleResize(evt);
                this.lastPointerPosition = evt.coordinate;
                break;
        }
    };

    // delta in radians
    calculateDeltaAngle(evt: MapBrowserEvent, center: Coordinate) {
        const lastAngle = Math.atan2(this.lastPointerPosition[1] - center[1], this.lastPointerPosition[0] - center[0]);
        const currentAngle = Math.atan2(evt.coordinate[1] - center[1], evt.coordinate[0] - center[0]);
        return currentAngle - lastAngle;
    }

    handleLineStringDrag = (evt: MapBrowserEvent) => {
        if (!this.activeController) return;
        switch (this.currentMode) {
            case InteractionType.translate:
                this.handleDragForLineAndPolygon(evt, this.activeController);
                break;
            case InteractionType.rotate:
                this.handleRotateForLineAndPolygon(evt, this.activeController);
                break;
            case InteractionType.resize:
                if (!this.activeFeature) return;

                if (this.activeFeature.get('offsetHandler')) {
                    this.handleOffset(evt);
                } else {
                    this.handleResize(evt);
                }
                this.lastPointerPosition = evt.coordinate;
                break;
        }
    };

    // update the length of a graphic
    handleResize(evt: MapBrowserEvent) {
        if (!this.activeController) return;
        let center = this.activeController.getCenter();
        const currentDistance = Math.sqrt(Math.pow(evt.coordinate[0] - center[0], 2) + Math.pow(evt.coordinate[1] - center[1], 2));
        const lastDistance = Math.sqrt(
            Math.pow(this.lastPointerPosition[0] - center[0], 2) + Math.pow(this.lastPointerPosition[1] - center[1], 2),
        );
        if (lastDistance > 0) {
            const scaleFactor = currentDistance / lastDistance;
            this.activeController.handleResize(scaleFactor);
        }
    }

    // update the width of a graphic
    handleOffset(evt: MapBrowserEvent): void {
        if (!this.activeController) return;
        let coords = <number[][]>this.activeController.getBaseGeometry();
        if (!coords) return;
        const lastSegment = [
            coords[coords.length - 2],
            coords[coords.length - 1]
        ];

        const dx = lastSegment[1][0] - lastSegment[0][0];
        const dy = lastSegment[1][1] - lastSegment[0][1];
        const lineAngle = Math.atan2(dy, dx);

        const widthAxis = [
            Math.cos(lineAngle + Math.PI / 2),
            Math.sin(lineAngle + Math.PI / 2)
        ];

        const toMouse = [
            evt.coordinate[0] - lastSegment[0][0],
            evt.coordinate[1] - lastSegment[0][1]
        ];

        const perpendicularDistance =
            toMouse[0] * widthAxis[0] +
            toMouse[1] * widthAxis[1];

        const scaleFactor = .5; // Adjust this to control sensitivity
        const baseWidth = Math.abs(perpendicularDistance) * scaleFactor;
        this.activeController.setOffset?.(baseWidth);
    }

    handleDragForLineAndPolygon(evt: MapBrowserEvent, controller: TacticalGraphicHandler) {
        let turfCurrent = openlayersAdapter.coordinateToTurfPoint(evt.coordinate);
        let turfLast = openlayersAdapter.coordinateToTurfPoint(this.lastPointerPosition);
        let distance = openlayersAdapter.getTurfDistance(turfLast, turfCurrent);
        let bearing = openlayersAdapter.getTurfBearing(turfLast, turfCurrent);
        controller.handleTranslate(distance, bearing);
        this.lastPointerPosition = evt.coordinate;
    }

    handleRotateForLineAndPolygon(evt: MapBrowserEvent, controller: TacticalGraphicHandler) {
        if (!this.activeController) return;
        let center = controller.getCenter();
        // Rotate around center
        const lastAngle = Math.atan2(this.lastPointerPosition[1] - center[1], this.lastPointerPosition[0] - center[0]);
        const currentAngle = Math.atan2(evt.coordinate[1] - center[1], evt.coordinate[0] - center[0]);
        // Update rotation
        const deltaAngle = currentAngle - lastAngle;
        controller.handleRotate(deltaAngle);
        this.lastPointerPosition = evt.coordinate;
    }

    handlePolygonDrag = (evt: MapBrowserEvent) => {
        if (!this.activeController) return;
        switch (this.currentMode) {
            case InteractionType.translate:
                this.handleDragForLineAndPolygon(evt, this.activeController);
                break;
            case InteractionType.rotate:
                this.handleRotateForLineAndPolygon(evt, this.activeController);
                break;
            case InteractionType.resize:
                this.handleResize(evt);
                this.lastPointerPosition = evt.coordinate;
                break;
        }
    };
    asFeature = (feature: FeatureLike): Feature | undefined => {
        return feature instanceof Feature ? feature : undefined;
    };

    private stopDrawing = (tacticalGraphicHandler: TacticalGraphicHandler, cancelled: boolean) => {
        if (this.escKeyHandler) {
            document.removeEventListener('keydown', this.escKeyHandler);
            this.escKeyHandler = undefined;
        }
        if (this.dblClickZoom) {
            const dblClickZoom = this.dblClickZoom;
            this.dblClickZoom = undefined;
            setTimeout(() => this.map.addInteraction(dblClickZoom), 0);
        }
        if (cancelled) {
            tacticalGraphicHandler.getFeatures().forEach(f => this.renderingVectorSource.removeFeature(f));
        }
        if (this.draw) {
            this.map.removeInteraction(this.draw);
            this.draw = undefined;
        }
        this.setInteractionMode(InteractionType.view);
    };

    handleDrawTacticalGraphic = (name: TacticalGraphicName) => {
        if (this.draw) this.map.removeInteraction(this.draw);

        // create a new source for drawing, this can be modified per application
        let drawingVectorSource = new VectorSource();

        // Fetch a tactical graphic & handler based on the tactical graphic name, use the resolution to scale the graphic
        let resolution = this.map.getView().getResolution() || 1;
        let tacticalGraphicHandler: TacticalGraphicHandler = openlayersAdapter.getTacticalGraphicController(name, resolution);

        this.renderingVectorSource.addFeatures(tacticalGraphicHandler.getFeatures());
        this.map.getView().on('change:resolution', tacticalGraphicHandler.onResolutionChangeFunc);

        // Disable double-click zoom so finishing a draw with double-click doesn't zoom the map
        this.dblClickZoom = this.map.getInteractions().getArray()
            .find((i): i is DoubleClickZoom => i instanceof DoubleClickZoom);
        if (this.dblClickZoom) this.map.removeInteraction(this.dblClickZoom);

        this.draw = new Draw({
            source: drawingVectorSource,
            type: tacticalGraphicHandler.type,
            style: tacticalGraphicHandler.drawStyleFunc ?? undefined,
            maxPoints: tacticalGraphicHandler.maxPoints ?? undefined,
            geometryFunction: tacticalGraphicHandler.geometryFn ?? undefined,
        });

        this.map.addInteraction(this.draw);

        // ESC cancels the active drawing
        this.escKeyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.draw) {
                this.draw.abortDrawing();
                this.stopDrawing(tacticalGraphicHandler, true);
            }
        };
        document.addEventListener('keydown', this.escKeyHandler);

        this.draw.on('drawstart', (e: DrawEvent) => {
            this.setInteractionMode(InteractionType.drawing);

            const originalFeature = e.feature;

            // add a unique id to the graphic
            let symbolId = crypto.randomUUID();
            originalFeature.set('symbolId', symbolId);
            originalFeature.setStyle(new Style({}));

            tacticalGraphicHandler.setSymbolId(symbolId);
            tacticalGraphicHandler.getFeatures().forEach(f => f.set('graphicName', name));

            this.map.on('pointermove', evt => {
                tacticalGraphicHandler.onPointerMove?.(evt);
            });
            tacticalGraphicHandler.onDrawStartFunc(e);
        });

        this.draw.on('drawend', (e: DrawEvent) => {
            this.lastDrawEndedAt = Date.now() + 1000;
            tacticalGraphicHandler.onDrawEndFunc(e);
            drawingVectorSource.clear();
            this.graphicControllers.push(tacticalGraphicHandler);
            this.stopDrawing(tacticalGraphicHandler, false);
        });
    };

    addModifyInteraction = () => {
        // Only allow the base feature (linestring/polygon) for a tactical graphic to be modified
        // once the graphic is modified, the underlying graphic will re-render the tactical graphic from the geometry library.
        let baseFeatures = this.getRenderedFeaturesByProp('base');
        baseFeatures.forEach(feature => feature.set('hidden', false));

        this.modify = new Modify({
            source: this.renderingVectorSource,
            features: new Collection(baseFeatures),
        });
        this.map.addInteraction(this.modify);
        this.modify.on('modifyend', (e: ModifyEvent) => {
            e.features.forEach(feature => {
                let symbolId = feature.get('symbolId');
                if (!symbolId) return;
                let geom = feature.getGeometry();
                if (geom instanceof Point || geom instanceof LineString || geom instanceof Polygon) {
                    let graphicController = this.getFeatureControllerBySymbolId(symbolId);
                    if (!graphicController) return;

                    // re-renders the tactical graphic based on the new geometry.
                    graphicController.setBaseFeature(feature);
                }

            });
        });
    };

    removeModifyInteraction = () => {
        let baseFeatures = this.getRenderedFeaturesByProp('base');
        baseFeatures.forEach(feature => feature.set('hidden', true));
        if (this.modify) this.map.removeInteraction(this.modify);
    };
}