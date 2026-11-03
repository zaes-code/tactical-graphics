/**
 * # Where the capture arrow leaves its circle
 *
 * APP-06 343000 (and 342300, 344500, 344600, which print the same rule): "Point 2 defines the
 * radius of the circle", and the Template's PT.2 leader marks the rim exactly where the arc
 * leaves it. So the arc starts at point 2. Until 2026-10-31 it left on the bearing toward
 * point 3, and point 2 only set the radius.
 */
import type {Feature, LineString, MultiLineString, Position} from 'geojson';
import {renderTacticalGraphic, TacticalGraphicName} from '../index';

const NAMES = [TacticalGraphicName.Capture, TacticalGraphicName.Seize, TacticalGraphicName.Evacuate, TacticalGraphicName.Recover];

// Point 2 straight north of the centre, and the arc swinging away east.
const BASE: Position[] = [[0, 0], [0, 0.01], [0.03, 0.005], [0.05, -0.02]];

const arcOf = (name: TacticalGraphicName): Position[] => {
    const out = renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: BASE},
        properties: {tacticalGraphic: {name}},
    } as Feature<LineString>);
    return (out.graphic.geometry as MultiLineString).coordinates[1];
};

describe('the swept-arc tasks', () => {
    it.each(NAMES.map(n => [n]))('%s starts its arc at point 2', name => {
        const arc = arcOf(name);
        expect(arc[0][0]).toBeCloseTo(BASE[1][0], 9);
        expect(arc[0][1]).toBeCloseTo(BASE[1][1], 9);
        expect(arc[arc.length - 1][0]).toBeCloseTo(BASE[3][0], 9);
    });
});
