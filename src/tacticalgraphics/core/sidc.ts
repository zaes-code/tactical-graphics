/**
 * # A graphic's symbol identification code
 *
 * MIL-STD-2525D/E and APP-06(D)/(E) Annex A code a control measure in 20 digits, or 30 with
 * the third set: version, context, standard identity, symbol set 25, status, echelon, the
 * six-digit entity, and the two sector modifiers. This library already holds the entity
 * (`GRAPHIC_ENTITY_CODES`); everything else is a property a graphic carries, and the tables
 * below are how each value of those properties is written.
 *
 * The standard-identity table is also what the centre symbol's own code is built from.
 * @see securitySymbolSidc
 */
import {getEntityCode, listNamesByEntityCode, resolveEntityCode} from './entityCodes';
import type {TacticalGraphicProperties} from './render';
import type {TacticalGraphicName} from './type';
import {
    RouteDirection,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicMineType,
    TacticalGraphicMobility,
    TacticalGraphicStatus,
    TacticalGraphicTerrain,
} from './type';

/** MIL-STD-2525E Change 1 Table A-I, digits 1-2: the edition a code is written against. */
export const SIDC_VERSIONS = {
    'MIL-STD-2525D': '10',
    'APP-06(D)(1)': '10',
    'MIL-STD-2525D(1)': '11',
    'MIL-STD-2525E': '13',
    'APP-06(E)(1)': '14',
    'MIL-STD-2525E(1)': '15',
    'APP-06(E)(2)': '16',
} as const;

/** An edition a code can claim to follow. @see SIDC_VERSIONS */
export type SidcStandard = keyof typeof SIDC_VERSIONS;

/** Table A-II, digit 3: the context. Reality, exercise or simulation. */
export const SIDC_CONTEXTS = {reality: '0', exercise: '1', simulation: '2'} as const;

/** A context a code can state. @see SIDC_CONTEXTS */
export type SidcContext = keyof typeof SIDC_CONTEXTS;

/** Table A-IV: the control-measure symbol set, which every graphic here belongs to. */
export const CONTROL_MEASURE_SYMBOL_SET = '25';

/** Table A-II, digit 4: the standard identity of each hostility. */
export const SIDC_STANDARD_IDENTITY: Readonly<Record<TacticalGraphicHostility, string>> = Object.freeze({
    [TacticalGraphicHostility.pending]: '0',
    [TacticalGraphicHostility.unknown]: '1',
    [TacticalGraphicHostility.assumedFriend]: '2',
    [TacticalGraphicHostility.friend]: '3',
    [TacticalGraphicHostility.neutral]: '4',
    [TacticalGraphicHostility.suspectJoker]: '5',
    [TacticalGraphicHostility.hostileFaker]: '6',
});

/** Table A-VI, digit 7: status. This library has present and planned. */
export const SIDC_STATUS: Readonly<Record<TacticalGraphicStatus, string>> = Object.freeze({
    [TacticalGraphicStatus.present]: '0',
    [TacticalGraphicStatus.planned]: '1',
});

/** Table A-VIII, digits 9-10: the echelon amplifier. */
export const SIDC_ECHELON: Readonly<Record<TacticalGraphicEchelon, string>> = Object.freeze({
    [TacticalGraphicEchelon.unknown]: '00',
    [TacticalGraphicEchelon.teamCrew]: '11',
    [TacticalGraphicEchelon.squad]: '12',
    [TacticalGraphicEchelon.section]: '13',
    [TacticalGraphicEchelon.platoonDetachment]: '14',
    [TacticalGraphicEchelon.companyBatteryTroop]: '15',
    [TacticalGraphicEchelon.battalionSquadron]: '16',
    [TacticalGraphicEchelon.regimentGroup]: '17',
    [TacticalGraphicEchelon.brigade]: '18',
    [TacticalGraphicEchelon.division]: '21',
    [TacticalGraphicEchelon.corpsMef]: '22',
    [TacticalGraphicEchelon.army]: '23',
    [TacticalGraphicEchelon.armyGroupFront]: '24',
    [TacticalGraphicEchelon.regionTheater]: '25',
    [TacticalGraphicEchelon.command]: '26',
});

/**
 * Digits 17-18, the control measures' sector 1 modifier. One numbering holds two categories:
 * mobility (00-12 and 51, on limited access areas and restricted terrain) and mine type (13-50,
 * on minefields and mined areas). A graphic here carries one mine type, so only 13-19 arise;
 * 20-50 are combinations.
 */
export const SIDC_MOBILITY: Readonly<Record<TacticalGraphicMobility, string>> = Object.freeze({
    [TacticalGraphicMobility.unspecified]: '00',
    [TacticalGraphicMobility.standardMobility]: '01',
    [TacticalGraphicMobility.highMobility]: '02',
    [TacticalGraphicMobility.tracked]: '03',
    [TacticalGraphicMobility.trackedAndWheeled]: '04',
    [TacticalGraphicMobility.towed]: '05',
    [TacticalGraphicMobility.railway]: '06',
    [TacticalGraphicMobility.overSnow]: '07',
    [TacticalGraphicMobility.sled]: '08',
    [TacticalGraphicMobility.packAnimal]: '09',
    [TacticalGraphicMobility.barge]: '10',
    [TacticalGraphicMobility.amphibious]: '11',
    [TacticalGraphicMobility.noVehicles]: '12',
    [TacticalGraphicMobility.dismounted]: '51',
});

/** Digits 17-18 for a mine type. @see SIDC_MOBILITY */
export const SIDC_MINE_TYPE: Readonly<Record<TacticalGraphicMineType, string>> = Object.freeze({
    [TacticalGraphicMineType.unspecified]: '13',
    [TacticalGraphicMineType.antipersonnel]: '14',
    [TacticalGraphicMineType.antipersonnelDirectional]: '15',
    [TacticalGraphicMineType.antitank]: '16',
    [TacticalGraphicMineType.antitankAntihandling]: '17',
    [TacticalGraphicMineType.wideAreaAntitank]: '18',
    [TacticalGraphicMineType.mineCluster]: '19',
});

/** Digits 19-20, the control measures' sector 2 modifier: terrain. */
export const SIDC_TERRAIN: Readonly<Record<TacticalGraphicTerrain, string>> = Object.freeze({
    [TacticalGraphicTerrain.unspecified]: '00',
    [TacticalGraphicTerrain.urban]: '01',
    [TacticalGraphicTerrain.water]: '02',
    [TacticalGraphicTerrain.ground]: '03',
    [TacticalGraphicTerrain.vegetation]: '04',
    [TacticalGraphicTerrain.obstacles]: '05',
});

/** The properties a graphic's code is built from. */
export type SidcProperties = Pick<
    TacticalGraphicProperties,
    'name' | 'hostility' | 'exercise' | 'status' | 'echelon' | 'mobility' | 'mineType' | 'terrain' | 'direction'
>;

/** How {@link buildGraphicSidc} writes a code. */
export interface SidcOptions {
    /** The edition the code claims to follow, which sets digits 1-2. Default `MIL-STD-2525E`. */
    standard?: SidcStandard;
    /** 20 digits, or 30 with the third set (all zero: no common modifier, no country). Default 20. */
    length?: 20 | 30;
    /**
     * The identity written for a graphic that states none. A graphic with no `hostility` is drawn
     * unaffiliated and a code has no such value, so the caller chooses. Default friend.
     */
    defaultIdentity?: TacticalGraphicHostility;
    /** Digit 3. Default exercise for a graphic whose `exercise` is set, otherwise reality. */
    context?: SidcContext;
}

/**
 * A graphic's symbol identification code, or `undefined` when nothing codes the graphic.
 *
 * ```ts
 * buildGraphicSidc({name: TacticalGraphicName.PhaseLine, hostility: TacticalGraphicHostility.hostileFaker});
 * // '13062500001403000000': MIL-STD-2525E, reality, hostile, control measure, present, phase line 140300
 * ```
 *
 * A route's traffic direction is its entity subtype (`getEntityCode(name, {direction})`).
 * Headquarters, task force and dummy (digit 8) do not apply to a control measure and are `0`.
 */
export function buildGraphicSidc(props: SidcProperties, options: SidcOptions = {}): string | undefined {
    const entity = getEntityCode(props.name, {direction: props.direction});
    if (entity == null) return undefined;
    const context = options.context ?? (props.exercise ? 'exercise' : 'reality');
    const sector1 = props.mobility ? SIDC_MOBILITY[props.mobility] : props.mineType ? SIDC_MINE_TYPE[props.mineType] : '00';
    const code = [
        SIDC_VERSIONS[options.standard ?? 'MIL-STD-2525E'],
        SIDC_CONTEXTS[context],
        SIDC_STANDARD_IDENTITY[props.hostility ?? options.defaultIdentity ?? TacticalGraphicHostility.friend],
        CONTROL_MEASURE_SYMBOL_SET,
        SIDC_STATUS[props.status ?? TacticalGraphicStatus.present],
        '0',
        SIDC_ECHELON[props.echelon ?? TacticalGraphicEchelon.unknown],
        entity,
        sector1,
        SIDC_TERRAIN[props.terrain ?? TacticalGraphicTerrain.unspecified],
    ].join('');
    return (options.length ?? 20) === 30 ? `${code}0000000000` : code;
}


/**
 * The editions whose digits 21-22 can make digits 17-20 a common modifier (Annex A.13):
 * MIL-STD-2525E, APP-06(E)(1), MIL-STD-2525E(1) and APP-06(E)(2). A 2525D or APP-06(D)(1) code,
 * version 10 or 11, holds a national set C in digits 21-30 (2525D A.5.5), which leaves 17-20 as
 * they are.
 */
const COMMON_MODIFIER_VERSIONS = new Set(['13', '14', '15', '16']);

/**
 * The properties a code gives a graphic, ready to hand to `startDrawing` or to put on a feature.
 * Only what the code states is set: an unknown echelon, unspecified mobility and unspecified
 * terrain are left out, as a graphic drawn without them would have them.
 */
export type SidcGraphicProperties = Pick<
    TacticalGraphicProperties,
    'hostility' | 'identityStated' | 'exercise' | 'status' | 'echelon' | 'mobility' | 'mineType' | 'terrain' | 'direction'
>;

/**
 * A 20- or 30-digit code read field by field, by {@link parseGraphicSidc}. Digit positions count
 * from 1. A field read as one of this library's values is `undefined` when the code holds a value
 * the library has no name for.
 */
export interface ParsedGraphicSidc {
    /** Digits 1-2: the edition the code was written against, such as `13`. @see SIDC_VERSIONS */
    version: string;
    /** Digit 3, as written: `0` reality, `1` exercise, `2` simulation. @see SIDC_CONTEXTS */
    context: string;
    /** Digit 4, the standard identity, as a hostility. */
    identity: TacticalGraphicHostility | undefined;
    /** Digits 5-6: the symbol set, `25` for a control measure. */
    symbolSet: string;
    /** Digit 7, planned or present. */
    status: TacticalGraphicStatus | undefined;
    /** Digit 8, as written: headquarters, task force or dummy, which a control measure does not use. */
    headquartersTaskForceDummy: string;
    /** Digits 9-10, the echelon. */
    echelon: TacticalGraphicEchelon | undefined;
    /** Digits 11-16, the entity code. A route's traffic-direction subtype reads as the route's own code. */
    entity: string;
    /** Digits 17-18, sector 1 modifier, as written. */
    sector1: string;
    /** Digits 19-20, sector 2 modifier, as written. */
    sector2: string;
    /** Digits 17-18 read as mobility; `undefined` for 00, for a mine type, and for a common modifier. */
    mobility: TacticalGraphicMobility | undefined;
    /** Digits 17-18 read as a single mine type (13-19), unless digit 21 makes them a common modifier. */
    mineType: TacticalGraphicMineType | undefined;
    /** Digits 19-20 read as terrain; `undefined` for 00 and for a common modifier (digit 22). */
    terrain: TacticalGraphicTerrain | undefined;
    /** A supply route's traffic direction, from its entity subtype. */
    direction: RouteDirection | undefined;
    /** The graphic, when the code is a control measure this library draws and names exactly one. */
    name: TacticalGraphicName | undefined;
    /** Every graphic this library draws for the code. One for every code today. */
    candidates: TacticalGraphicName[];
    /** What the code gives the graphic. @see SidcGraphicProperties */
    properties: SidcGraphicProperties;
}

const invert = <K extends string>(table: Readonly<Record<K, string>>) =>
    Object.fromEntries(Object.entries(table).map(([k, v]) => [v, k])) as Record<string, K | undefined>;
const IDENTITY_BY_DIGIT = invert(SIDC_STANDARD_IDENTITY);
const STATUS_BY_DIGIT = invert(SIDC_STATUS);
const ECHELON_BY_DIGITS = invert(SIDC_ECHELON);
const MOBILITY_BY_DIGITS = invert(SIDC_MOBILITY);
const MINE_TYPE_BY_DIGITS = invert(SIDC_MINE_TYPE);
const TERRAIN_BY_DIGITS = invert(SIDC_TERRAIN);

const SIDC_PATTERN = /^[0-9A-Fa-f]{20}([0-9A-Fa-f]{10})?$/;

/** Whether a string is a 20- or 30-digit code {@link parseGraphicSidc} reads. */
export function isGraphicSidc(sidc: string): boolean {
    return SIDC_PATTERN.test(sidc.trim());
}

/**
 * Reads a 20- or 30-digit MIL-STD-2525D/E or APP-06(D)/(E) code: which graphic it names, and the
 * properties it gives that graphic. The reverse of {@link buildGraphicSidc}.
 *
 * ```ts
 * const parsed = parseGraphicSidc('13062500001403000000');
 * // parsed.name: PhaseLine
 * // parsed.properties: {hostility: hostileFaker, identityStated: true, status: present}
 * if (parsed.name) engine.startDrawing(parsed.name, parsed.properties);
 * ```
 *
 * `name` is `undefined` for a code outside the control measures (symbol set `25`) or for an
 * entity this library does not draw; the fields are read all the same. The 15-character codes
 * of MIL-STD-2525C and APP-6(A)/(B) are not read here.
 * @throws When `sidc` is not 20 or 30 hexadecimal digits.
 */
export function parseGraphicSidc(sidc: string): ParsedGraphicSidc {
    const code = sidc.trim();
    if (!SIDC_PATTERN.test(code)) throw new Error(`SIDC: expected 20 or 30 hexadecimal digits, got "${sidc}"`);
    const symbolSet = code.slice(4, 6);
    const coded = code.slice(10, 16);
    const controlMeasure = symbolSet === CONTROL_MEASURE_SYMBOL_SET;
    // A route's direction subtype names the route: the direction is an amplifier, not a separate graphic.
    const resolved = controlMeasure ? resolveEntityCode(coded) : undefined;
    const direction = resolved?.direction;
    const entity = direction ? getEntityCode(resolved!.name)! : coded;
    const [sector1, sector2] = [code.slice(16, 18), code.slice(18, 20)];
    // A.13: in a 2525E or APP-06(E) code, a nonzero digit 21 (22) makes digits 17-18 (19-20) a
    // common modifier, read with it, not the control measure's own sector modifier.
    const common = code.length === 30 && COMMON_MODIFIER_VERSIONS.has(code.slice(0, 2));
    const own1 = !common || code[20] === '0';
    const own2 = !common || code[21] === '0';

    const identity = IDENTITY_BY_DIGIT[code[3]];
    const status = STATUS_BY_DIGIT[code[6]];
    const echelon = ECHELON_BY_DIGITS[code.slice(8, 10)];
    const mobility = !own1 || sector1 === '00' ? undefined : MOBILITY_BY_DIGITS[sector1];
    const mineType = own1 ? MINE_TYPE_BY_DIGITS[sector1] : undefined;
    const terrain = !own2 || sector2 === '00' ? undefined : TERRAIN_BY_DIGITS[sector2];

    const properties: SidcGraphicProperties = {
        // A code always states an identity, so an unknown one is the unknown identity, drawn yellow.
        ...(identity ? {hostility: identity, identityStated: true} : {}),
        ...(code[2] === SIDC_CONTEXTS.exercise ? {exercise: true} : {}),
        ...(status ? {status} : {}),
        ...(echelon && echelon !== TacticalGraphicEchelon.unknown ? {echelon} : {}),
        ...(mobility ? {mobility} : {}),
        ...(mineType ? {mineType} : {}),
        ...(terrain ? {terrain} : {}),
        ...(direction ? {direction} : {}),
    };
    return {
        version: code.slice(0, 2),
        context: code[2],
        identity,
        symbolSet,
        status,
        headquartersTaskForceDummy: code[7],
        echelon,
        entity,
        sector1,
        sector2,
        mobility,
        mineType,
        terrain,
        direction,
        name: resolved?.name,
        candidates: controlMeasure ? [...listNamesByEntityCode(entity)] : [],
        properties,
    };
}
