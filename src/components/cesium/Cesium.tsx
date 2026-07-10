// src/MapComponent.jsx
import React, {useEffect, useRef, useState} from 'react';
import {Viewer} from 'resium';
import {SceneMode} from "cesium";
import DrawTool from "./DrawTool";

import * as Cesium from "cesium";
import MapControls from "../MapControls";
import {InteractionType} from "../openlayers/TacticalGraphicsManager";

import {TacticalGraphicName} from '@zaes/tactical-graphics';

const CesiumMap = () => {
    const drawToolRef = useRef<DrawTool | null>(null);
    const viewerRef = useRef<{ cesiumElement: Cesium.Viewer } | null>(null);
    const [interactionMode, setInteractionMode] = useState<InteractionType>(InteractionType.view);
    const selectedShape = useRef<TacticalGraphicName>(TacticalGraphicName.AirCorridor);
    const modeRef = useRef(interactionMode);

    const setSelectedShape = (value: TacticalGraphicName) => {
        selectedShape.current = value;
    };

    // keep ref in sync with React state
    useEffect(() => {
        modeRef.current = interactionMode;
    }, [interactionMode]);

    const startDrawing = () => {
        if (!viewerRef.current) return;

        drawToolRef.current = new DrawTool({
            viewer: viewerRef.current.cesiumElement,
            type: "LineString",
            onDrawStart: () => console.log("Draw started"),
            onDrawEnd: (positions) => console.log("Draw finished", positions),
            selectedGraphic: selectedShape.current
        });

        drawToolRef.current.start();
    };

    const removeDrawing = () => {
        drawToolRef.current?.remove();
        drawToolRef.current = null;
    };

    return (
        <>
            <div style={{width: '100%', height: '100vh'}}>
                <Viewer
                    ref={viewerRef}
                    animation={false}
                    timeline={false}
                    baseLayerPicker={true} // Allows user to select different base layers
                    geocoder={false} // Disables the search bar
                    navigationHelpButton={false}
                    sceneModePicker={true} // Allows user to toggle between 2D, 3D, and Columbus View
                    full={true}
                    sceneMode={SceneMode.SCENE2D} // <-- set default to 2D
                />
            </div>
            <MapControls
                onDrawTacticalGraphics={startDrawing}
                onToggleInteraction={setInteractionMode}
                onShapeChange={setSelectedShape}
                onReset={removeDrawing}
                interactionMode={interactionMode}
                isRotating={modeRef.current === InteractionType.rotate}
                isResizing={modeRef.current === InteractionType.resize}
                isRepositioning={modeRef.current === InteractionType.translate}
                isModifying={modeRef.current === InteractionType.modify}
                defaultShape={selectedShape.current}
            />
        </>

    );
};

export default CesiumMap;
