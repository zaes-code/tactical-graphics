/**
 * # No graphic may emit an absurd amount of geometry
 *
 * Three of them did: Counterattack and the two fords came back with ~173,000
 * coordinates each, against a catalogue median in the low tens. Their dash period
 * is a fraction of the `radius` *offset* option, which defaults to 20 metres when
 * a caller does not pass one — so a line hundreds of kilometres long was cut into
 * 66,600 sub-pixel dashes per rail.
 *
 * It was invisible in every sense that usually catches a bug: the graphic looked
 * like a plain line, no test failed, and the OpenLayers holder never triggered it
 * because it always supplies a real offset. What it cost was most of a frame.
 *
 * So this asserts a budget rather than a shape. The number is deliberately far
 * above anything doctrinal — the point is to catch a runaway, not to police how
 * many segments a scallop needs.
 */

import {TACTICAL_GRAPHIC_KEY, TacticalGraphicName, listTacticalGraphicNames, renderTacticalGraphic} from '../index';
import type {Feature} from 'geojson';

/**
 * Most coordinates one graphic may produce.
 *
 * A generous ceiling: the heaviest legitimate graphic in the catalogue is around a
 * thousand, so this leaves an order of magnitude of headroom and still catches a
 * runaway three orders out.
 */
const MAX_COORDINATES = 5_000;

/** Every position in a nested coordinate array. */
function countPositions(coordinates: unknown): number {
    let total = 0;
    const walk = (node: unknown): void => {
        if (!Array.isArray(node)) return;
        if (Array.isArray(node[0])) node.forEach(walk);
        else total++;
    };
    walk(coordinates);
    return total;
}

/**
 * A long base line, in degrees. The bug only shows on a line long enough that a
 * metre-scale default period divides into it thousands of times, which is exactly
 * the case a fixed default gets wrong.
 */
const LONG_BASE = {type: 'LineString' as const, coordinates: [[-2, 0], [2, 0]]};
const LONG_POLYGON = {
    type: 'Polygon' as const,
    coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]],
};
const POINT = {type: 'Point' as const, coordinates: [0, 0]};

describe('geometry budget', () => {
    it('no graphic emits more than the budget from a long base', () => {
        const overBudget: Array<{name: string; positions: number}> = [];

        for (const name of listTacticalGraphicNames()) {
            for (const geometry of [LONG_BASE, LONG_POLYGON, POINT]) {
                let rendered;
                try {
                    rendered = renderTacticalGraphic({
                        type: 'Feature',
                        geometry,
                        // Deliberately *only* a radius and a rotation — the shape a caller
                        // going through the public API supplies, and the one that exposed
                        // the defaults nobody had exercised.
                        properties: {[TACTICAL_GRAPHIC_KEY]: {name, radius: 180_000, rotation: 0}},
                    } as Feature);
                } catch {
                    // A generator that refuses this base is not what this is testing.
                    continue;
                }

                const positions =
                    countPositions((rendered.graphic.geometry as {coordinates?: unknown}).coordinates)
                    + countPositions((rendered.labels.geometry as {coordinates?: unknown}).coordinates);
                if (positions > MAX_COORDINATES) overBudget.push({name: String(name), positions});
            }
        }

        expect(overBudget).toEqual([]);
    });

    it('the fords still draw as dashes, not as one solid rail', () => {
        // The other half of the clamp: a period that is too fine gets widened, and a
        // clamp set too aggressively would collapse the rails into single lines.
        for (const name of [TacticalGraphicName.FordEasy, TacticalGraphicName.FordDifficult]) {
            const rendered = renderTacticalGraphic({
                type: 'Feature',
                geometry: LONG_BASE,
                properties: {[TACTICAL_GRAPHIC_KEY]: {name, radius: 180_000, rotation: 0}},
            } as Feature);

            const geometry = rendered.graphic.geometry as {type: string; coordinates: unknown[]};
            expect(geometry.type).toBe('MultiLineString');
            expect(geometry.coordinates.length).toBeGreaterThan(50);
        }
    });
});
