import {GRAPHIC_CATEGORIES} from './categories';
import {GRAPHIC_SPECIFICATIONS, TacticalGraphicSpecification, getSpecifications, hasSpecification, listNamesBySpecification} from './specifications';
import {TacticalGraphicName} from './type';

/**
 * The seven graphics FM 1-02.2 defines and APP-06 Edition E does not. Pinned by
 * name rather than by count so that moving one in or out of APP-06 has to be a
 * deliberate edit to this list, with the Table A-32 lookup that justifies it.
 */
const FM_ONLY_GRAPHICS: TacticalGraphicName[] = [
    TacticalGraphicName.CommonSensorBoundary,
    TacticalGraphicName.DelayLine,
    TacticalGraphicName.FightingPosition,
    TacticalGraphicName.KillZone,
    TacticalGraphicName.ObstacleGroup,
    TacticalGraphicName.PassageLane,
    TacticalGraphicName.UnmannedAircraftCorridor,
];

describe('graphic specifications', () => {
    const names = Object.keys(GRAPHIC_SPECIFICATIONS) as TacticalGraphicName[];

    it('classifies exactly the graphics the category table classifies', () => {
        // Both are exhaustive Records over TacticalGraphicName, so they cannot
        // disagree without one of them having been hand-edited wrongly.
        expect(names.slice().sort()).toEqual(Object.keys(GRAPHIC_CATEGORIES).sort());
    });

    it('gives every graphic at least one specification', () => {
        for (const name of names) {
            expect(getSpecifications(name).length).toBeGreaterThan(0);
        }
    });

    it('puts every graphic in FM 1-02.2, which is the catalogue the library was built from', () => {
        for (const name of names) {
            expect(hasSpecification(name, TacticalGraphicSpecification.FM1_02_2)).toBe(true);
        }
    });

    it('lists only the pinned exceptions as absent from APP-06', () => {
        const absent = names.filter((name) => !hasSpecification(name, TacticalGraphicSpecification.APP6));
        expect(absent.sort()).toEqual(FM_ONLY_GRAPHICS.slice().sort());
    });

    it('partitions the registry between APP-06 and the FM-only exceptions', () => {
        const inApp6 = listNamesBySpecification(TacticalGraphicSpecification.APP6);
        expect(inApp6.length + FM_ONLY_GRAPHICS.length).toBe(names.length);
        expect(listNamesBySpecification(TacticalGraphicSpecification.FM1_02_2).length).toBe(names.length);
    });

    it('returns names in enum declaration order', () => {
        const inApp6 = listNamesBySpecification(TacticalGraphicSpecification.APP6);
        const expected = names.filter((name) => !FM_ONLY_GRAPHICS.includes(name));
        expect(inApp6).toEqual(expected);
    });

    it('does not hand out a mutable specification array', () => {
        // getSpecifications returns one of two shared consts, so a caller that
        // pushed into it would corrupt every other graphic sharing that value.
        const first = getSpecifications(TacticalGraphicName.PhaseLine);
        const second = getSpecifications(TacticalGraphicName.Boundary);
        expect(first).toBe(second);
        expect(Object.isFrozen(first) || first === second).toBe(true);
    });
});
