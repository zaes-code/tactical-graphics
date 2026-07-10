import React from 'react';
import '../styles/MapControl.css';

import {MapLibrary} from "./mapLibrary";

interface props {
    onMapStateChange: any;
    mapState: any;
}

const RenderingControls = ({onMapStateChange, mapState}: props) => {
    const handleSelect = (e: any) => {
        const value = e.target.value;
        onMapStateChange(value);
    };

    function capitalize(word: string) {
        if (!word) return '';
        return word.charAt(0).toUpperCase() + word.slice(1);
    }

    return (
        <div className="rendering-controls">
            <h3>Mapping Library</h3>
            <select className="control-select" onChange={handleSelect} defaultValue={mapState}>
                {Object.values(MapLibrary).map(val => {
                    return (
                        <option key={val} value={val}>
                            {capitalize(val)}
                        </option>
                    );
                })}
            </select>
        </div>
    );
};

export default RenderingControls;
