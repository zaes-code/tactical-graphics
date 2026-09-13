/**
 * # A bag with a radius and no ranges is the older way of saying the same thing
 *
 * 200700's plate names a start range and a stop range. A saved bag holding only a `radius`
 * predates them, and the radius *is* the outer ring — which is what `RSD_DEFAULT_START_SHARE`
 * exists to complete: the OpenLayers holder has always spent it and reopened such a file as
 * the two-arc sector its plate draws.
 *
 * This engine did not, so the same file opened as a sector on one side and as nothing on the
 * other, and the properties panel read 16,000 m against the input's own 1,000 fallback.
 */
import {TacticalGraphicName, RSD_DEFAULT_START_SHARE, statesShapeAsRangeBands} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from './maplibreAdapter';

const RES = 1200;
const POINT = {type: 'Point' as const, coordinates: [-0.35, 40]};
const RADIUS = 40_000;

describe('a range-band graphic restored from a radius alone', () => {
    it('completes 200700 from the library figure, not from nothing', () => {
        const name = TacticalGraphicName.RadarSearchDoctrine;
        expect(statesShapeAsRangeBands(name)).toBe(true);

        const built = buildTacticalGraphic(name, POINT, {radius: RADIUS, rotation: 0}, RES);
        expect(built).toBeDefined();
        expect(built!.properties.stopRange).toBeCloseTo(RADIUS, 3);
        expect(built!.properties.startRange).toBeCloseTo(RADIUS * RSD_DEFAULT_START_SHARE, 3);
    });

    /** A file that states its own ranges keeps them, radius or no radius. */
    it('leaves stated ranges alone', () => {
        const built = buildTacticalGraphic(
            TacticalGraphicName.RadarSearchDoctrine,
            POINT,
            {radius: RADIUS, rotation: 0, startRange: 5_000, stopRange: 9_000},
            RES,
        );
        expect(built!.properties.startRange).toBe(5_000);
        expect(built!.properties.stopRange).toBe(9_000);
    });

    /** And a graphic that is not described by bands is untouched by the rule. */
    it('does not invent ranges for anything else', () => {
        const built = buildTacticalGraphic(TacticalGraphicName.PhaseLine, {type: 'LineString', coordinates: [[-0.7, 40], [0, 40]]}, {radius: RADIUS}, RES);
        expect(built!.properties.startRange).toBeUndefined();
        expect(built!.properties.stopRange).toBeUndefined();
    });
});
