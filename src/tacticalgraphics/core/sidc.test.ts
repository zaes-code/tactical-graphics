/**
 * # A graphic's symbol identification code
 *
 * Pinned to MIL-STD-2525E Change 1 Appendix A: Table A-I (version), A-II (context and standard
 * identity), A-IV (symbol set 25), A-VI (status), A-VIII (echelon), the entity from
 * `GRAPHIC_ENTITY_CODES`, and the control measures' sector 1 and 2 modifiers.
 */
import {
    RouteDirection,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicMineType,
    TacticalGraphicMobility,
    TacticalGraphicName,
    TacticalGraphicStatus,
    TacticalGraphicTerrain,
} from './type';
import {getEntityCode} from './entityCodes';
import {securitySymbolSidc} from './securitySymbol';
import {
    SIDC_ECHELON,
    SIDC_MINE_TYPE,
    SIDC_MOBILITY,
    SIDC_STANDARD_IDENTITY,
    SIDC_TERRAIN,
    SIDC_VERSIONS,
    buildGraphicSidc,
} from './sidc';
import * as barrel from '../index';

const {listTacticalGraphicNames} = barrel;

/** Digit positions as the standard numbers them, from 1. */
const digits = (sidc: string, from: number, to = from) => sidc.slice(from - 1, to);

describe('buildGraphicSidc', () => {
    it('writes a hostile phase line', () => {
        expect(buildGraphicSidc({name: TacticalGraphicName.PhaseLine, hostility: TacticalGraphicHostility.hostileFaker})).toBe('13062500001403000000');
    });

    it('lays out every field where Appendix A puts it', () => {
        const sidc = buildGraphicSidc(
            {
                name: TacticalGraphicName.MinedArea,
                hostility: TacticalGraphicHostility.neutral,
                status: TacticalGraphicStatus.planned,
                echelon: TacticalGraphicEchelon.brigade,
                mineType: TacticalGraphicMineType.antitank,
                terrain: TacticalGraphicTerrain.water,
            },
            {standard: 'APP-06(E)(2)'},
        )!;
        expect(sidc).toHaveLength(20);
        expect(digits(sidc, 1, 2)).toBe('16');
        expect(digits(sidc, 3)).toBe('0');
        expect(digits(sidc, 4)).toBe('4');
        expect(digits(sidc, 5, 6)).toBe('25');
        expect(digits(sidc, 7)).toBe('1');
        expect(digits(sidc, 8)).toBe('0');
        expect(digits(sidc, 9, 10)).toBe('18');
        expect(digits(sidc, 11, 16)).toBe(getEntityCode(TacticalGraphicName.MinedArea));
        expect(digits(sidc, 17, 18)).toBe('16');
        expect(digits(sidc, 19, 20)).toBe('02');
    });

    it.each(Object.entries(SIDC_VERSIONS))('writes %s as version %s', (standard, version) => {
        const sidc = buildGraphicSidc({name: TacticalGraphicName.PhaseLine}, {standard: standard as keyof typeof SIDC_VERSIONS})!;
        expect(digits(sidc, 1, 2)).toBe(version);
    });

    it('follows Table A-I, where 2525D and APP-06(D)(1) share a version and 12 was withdrawn', () => {
        expect(SIDC_VERSIONS['MIL-STD-2525D']).toBe(SIDC_VERSIONS['APP-06(D)(1)']);
        expect(Object.values(SIDC_VERSIONS)).not.toContain('12');
        expect(SIDC_VERSIONS['MIL-STD-2525E(1)']).toBe('15');
    });

    it('writes the exercise context for an exercise graphic, and any context asked for', () => {
        const exercise = buildGraphicSidc({name: TacticalGraphicName.PhaseLine, hostility: TacticalGraphicHostility.unknown, exercise: true})!;
        expect(digits(exercise, 3, 4)).toBe('11');
        expect(digits(buildGraphicSidc({name: TacticalGraphicName.PhaseLine})!, 3)).toBe('0');
        expect(digits(buildGraphicSidc({name: TacticalGraphicName.PhaseLine, exercise: true}, {context: 'simulation'})!, 3)).toBe('2');
    });

    it('writes the default identity for a graphic that states none', () => {
        expect(digits(buildGraphicSidc({name: TacticalGraphicName.PhaseLine})!, 4)).toBe('3');
        expect(digits(buildGraphicSidc({name: TacticalGraphicName.PhaseLine}, {defaultIdentity: TacticalGraphicHostility.pending})!, 4)).toBe('0');
    });

    it('pads a 30-digit code with an empty third set', () => {
        const sidc = buildGraphicSidc({name: TacticalGraphicName.PhaseLine}, {length: 30})!;
        expect(sidc).toHaveLength(30);
        expect(sidc.slice(0, 20)).toBe(buildGraphicSidc({name: TacticalGraphicName.PhaseLine}));
        expect(sidc.slice(20)).toBe('0000000000');
    });

    it("writes a route's traffic direction as its entity subtype", () => {
        const sidc = buildGraphicSidc({name: TacticalGraphicName.MainSupplyRoute, direction: RouteDirection.oneWay})!;
        expect(digits(sidc, 11, 16)).toBe(getEntityCode(TacticalGraphicName.MainSupplyRoute, {direction: RouteDirection.oneWay}));
        expect(digits(sidc, 11, 16)).not.toBe(getEntityCode(TacticalGraphicName.MainSupplyRoute));
    });

    it('writes mobility in the sector 1 digits, ahead of any mine type', () => {
        const sidc = buildGraphicSidc({name: TacticalGraphicName.PhaseLine, mobility: TacticalGraphicMobility.dismounted, mineType: TacticalGraphicMineType.antitank})!;
        expect(digits(sidc, 17, 18)).toBe('51');
    });

    it('codes every graphic that has an entity code, and nothing else', () => {
        for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
            const sidc = buildGraphicSidc({name});
            if (getEntityCode(name) == null) expect(sidc).toBeUndefined();
            else expect(sidc).toMatch(/^\d{20}$/);
        }
    });

    it('gives every value of every property a distinct code', () => {
        for (const table of [SIDC_STANDARD_IDENTITY, SIDC_ECHELON, SIDC_MOBILITY, SIDC_MINE_TYPE, SIDC_TERRAIN]) {
            const values = Object.values(table);
            expect(new Set(values).size).toBe(values.length);
        }
        // Mobility and mine type share digits 17-18, so they must not overlap either.
        expect(Object.values(SIDC_MOBILITY).filter(v => Object.values(SIDC_MINE_TYPE).includes(v))).toEqual([]);
    });

    it("writes the centre symbol's identity from the same table", () => {
        for (const hostility of Object.values(TacticalGraphicHostility)) {
            expect(digits(securitySymbolSidc(hostility), 4)).toBe(SIDC_STANDARD_IDENTITY[hostility]);
        }
    });

    it('is exported from the package root', () => {
        expect(barrel.buildGraphicSidc).toBe(buildGraphicSidc);
        expect(barrel.SIDC_VERSIONS).toBe(SIDC_VERSIONS);
    });
});
