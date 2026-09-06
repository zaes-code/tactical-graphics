/**
 * # A graphic whose base carries three points states its shape once
 *
 * The three-point family — the demolition block, the infiltration lane and APP-06 152800
 * mobile defence — puts the separation *and* the side in point 3. Anything stamped beside
 * those coordinates is a second copy of what they already say, and the two drift: that is
 * what the block's `width` was until 2026-09-05, what 200700's `radius` was, and what
 * `mirrored` still was on all three until a user asked why 152800 saved one.
 * (User's calls, 2026-09-05 and 2026-09-06.)
 *
 * Asserted against the **generator**, which is the only thing that decides what the symbol
 * looks like: if rendering with a field and without it gives the same geometry, the field is
 * not describing the picture and does not belong in the file.
 */
import {TacticalGraphicName, carriesSeparationInBase, renderTacticalGraphic} from '../index';
import type {Feature, LineString, Position} from 'geojson';

/** A centreline running due east with point 3 off to one side. */
const BASE: Position[] = [
    [-0.05, 0],
    [0.05, 0],
    [0, 0.02],
];

const drawnWith = (name: TacticalGraphicName, props: Record<string, unknown>): string => {
    const base = {
        type: 'Feature' as const,
        geometry: {type: 'LineString' as const, coordinates: BASE},
        properties: {tacticalGraphic: {name, ...props}},
    } as unknown as Feature<LineString>;
    return JSON.stringify(renderTacticalGraphic(base)?.graphic?.geometry ?? null);
};

/** Every graphic that says its separation lives in its base. */
const family = (Object.keys(TacticalGraphicName) as TacticalGraphicName[]).filter(carriesSeparationInBase);

describe('the three-point family states its shape in its coordinates', () => {
    it('includes 152800, which is not a movement graphic', () => {
        /*
         * `carriesSeparationInBase` was derived as `isMovementGraphic && >= 3 base points`,
         * and `isMovementGraphic` is false for 152800 — so the derivation missed the one
         * member that is not in that family, and it went on stamping a `width` its generator
         * ignores. Named explicitly now. @see MobileDefense.frame
         */
        expect(family).toContain(TacticalGraphicName.MobileDefense);
        expect(family).toContain(TacticalGraphicName.InfiltrationLane);
        expect(family).toContain(TacticalGraphicName.ExplosivesPlannedStateOfReadiness);
    });

    it('draws the same picture whichever side `mirrored` claims', () => {
        // Which side the symbol falls on *is* where point 3 was placed, so the flag says
        // nothing the coordinates do not. A renderer stamping it keeps a second copy.
        for (const name of family) {
            expect(drawnWith(name, {mirrored: true})).toBe(drawnWith(name, {mirrored: false}));
        }
    });

    it('draws the same picture whatever `width` claims', () => {
        // The separation is the across-axis distance to point 3. This is the fact the
        // block's own `halfWidthFromSide` measures. @see carriesSeparationInBase
        for (const name of family) {
            expect(drawnWith(name, {width: 400_000})).toBe(drawnWith(name, {}));
        }
    });
});
