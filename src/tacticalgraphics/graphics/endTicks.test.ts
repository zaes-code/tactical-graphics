/**
 * Breach and canalize cap each arm with a short tick about a letter tall (MIL-STD-2525E
 * Table L-XXI 340200 / 340400): 0.2 of the half-opening either side of the arm's end.
 */
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';
import * as turf from '../core/turf';

it.each([TacticalGraphicName.Breach, TacticalGraphicName.Canalize])('%s draws short end ticks', name => {
    // [opening 1, opening 2, rear]: a 2 km opening, the rear 3 km back.
    const base = [[0.03, 0.009], [0.03, -0.009], [0, 0]];
    const lines = (renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: base},
        properties: {tacticalGraphic: {name}},
    } as never).graphic.geometry as {coordinates: number[][][]}).coordinates;
    const opening = turf.distance(turf.point(base[0]), turf.point(base[1]), {units: 'meters'});
    // Sub-lines [arm, tick, arm, tick, back].
    for (const tick of [lines[1], lines[3]]) {
        const length = turf.distance(turf.point(tick[0]), turf.point(tick[1]), {units: 'meters'});
        expect(length / (opening / 2)).toBeCloseTo(0.4, 2);
    }
});
