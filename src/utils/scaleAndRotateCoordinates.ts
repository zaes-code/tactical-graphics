import {Coordinate} from 'ol/coordinate';


const _scaleAndRotateCoordinates = (coordinate: Coordinate, center: Coordinate, scale: number, rotation: number): Coordinate => {
    const x = coordinate[0] * scale;
    const y = coordinate[1] * scale;

    // Apply rotation
    const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
    const rotatedY = x * Math.sin(rotation) + y * Math.cos(rotation);
    return [center[0] + rotatedX, center[1] + rotatedY];
};

export {_scaleAndRotateCoordinates};
