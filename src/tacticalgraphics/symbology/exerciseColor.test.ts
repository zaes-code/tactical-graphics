/**
 * # A stated Unknown draws yellow; an unset one stays black
 *
 * MIL-STD-2525E L.5.1.1.1 colours control measures "yellow (unknown ...)", and MIL-STD-2525C
 * Table XIII-1 gives unknown and pending one yellow. A graphic with no affiliation is drawn
 * black. This library long saved an unchosen affiliation as `Unknown`, so `Unknown` alone keeps
 * meaning "not set"; `identityStated`, or an exercise, makes it the unknown identity.
 *
 * MIL-STD-2525C Table II draws EXERCISE UNKNOWN (W) in yellow, beside EXERCISE PENDING (G),
 * and Table XIII gives "Unknown, Pending" one yellow. 5.5.1.1 asks a graphic's colour to be
 * "consistent with the standard identity of the associated tactical symbol". So an exercise
 * graphic whose identity is unknown takes the pending yellow, where an unknown graphic outside
 * an exercise keeps the default line colour this library has always given it.
 */
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {configureTacticalGraphics, resetTacticalGraphicsConfig} from '../core/config';
import {getColorByHostility, getColorByIdentity, getDefaultLineColor, statesUnknownIdentity} from '../core/symbology';
import type {PaintContext, PaintFeature} from '../core/paint';
import {affiliationColorOf, identityColorOf, lineColorOf} from './paintFunctions';
import {getPaintFunction} from './registry';

const PENDING = getColorByHostility(TacticalGraphicHostility.pending);

const feature = (name: TacticalGraphicName, properties: Record<string, unknown> = {}): PaintFeature =>
    ({geometry: {type: 'LineString', coordinates: [[0, 0], [50_000, 0]]}, properties: {name, ...properties}}) as unknown as PaintFeature;

const context = {resolution: 100, measureText: (t: string) => t.length * 9} as unknown as PaintContext;

afterEach(() => resetTacticalGraphicsConfig());

describe('the colour of an identity inside an exercise', () => {
    it('draws exercise unknown in the pending yellow', () => {
        expect(getColorByIdentity(TacticalGraphicHostility.unknown, true)).toBe(PENDING);
    });

    it('keeps unknown outside an exercise in the default line colour', () => {
        expect(getColorByIdentity(TacticalGraphicHostility.unknown)).toBe(getDefaultLineColor());
        expect(getColorByIdentity(TacticalGraphicHostility.unknown, false)).toBe(getDefaultLineColor());
    });

    it.each(Object.values(TacticalGraphicHostility).filter(h => h !== TacticalGraphicHostility.unknown))(
        'leaves %s as it is outside an exercise',
        hostility => {
            expect(getColorByIdentity(hostility, true)).toBe(getColorByHostility(hostility));
        },
    );

    it("follows a host's pending override, as suspect/joker does", () => {
        configureTacticalGraphics({hostilityColors: {[TacticalGraphicHostility.pending]: '#ccaa00'}});
        expect(getColorByIdentity(TacticalGraphicHostility.unknown, true)).toBe('#ccaa00');
    });

    it("takes a host's unknown override first", () => {
        configureTacticalGraphics({hostilityColors: {[TacticalGraphicHostility.unknown]: '#aaaa00', [TacticalGraphicHostility.pending]: '#ccaa00'}});
        expect(getColorByIdentity(TacticalGraphicHostility.unknown, true)).toBe('#aaaa00');
    });
});

describe('a stated Unknown, exercise or not', () => {
    const phase = TacticalGraphicName.PhaseLine;

    it('reads as stated only with identityStated or an exercise', () => {
        expect(statesUnknownIdentity({hostility: TacticalGraphicHostility.unknown, identityStated: true})).toBe(true);
        expect(statesUnknownIdentity({hostility: TacticalGraphicHostility.unknown, exercise: true})).toBe(true);
        expect(statesUnknownIdentity({hostility: TacticalGraphicHostility.unknown})).toBe(false);
        expect(statesUnknownIdentity({identityStated: true})).toBe(false);
        expect(statesUnknownIdentity({hostility: TacticalGraphicHostility.friend, identityStated: true})).toBe(false);
    });

    it('draws yellow when set on purpose, outside any exercise', () => {
        expect(lineColorOf(feature(phase, {hostility: TacticalGraphicHostility.unknown, identityStated: true}))).toBe(PENDING);
    });

    it('keeps saved data that wrote Unknown for an unset affiliation in the default line colour', () => {
        expect(lineColorOf(feature(phase, {hostility: TacticalGraphicHostility.unknown}))).toBe(getDefaultLineColor());
    });

    it('leaves a graphic with no affiliation in the default line colour, stated or not', () => {
        expect(lineColorOf(feature(phase, {identityStated: true}))).toBe(getDefaultLineColor());
        expect(lineColorOf(feature(phase))).toBe(getDefaultLineColor());
    });

    it('changes nothing for the other identities', () => {
        for (const hostility of Object.values(TacticalGraphicHostility).filter(h => h !== TacticalGraphicHostility.unknown)) {
            expect(lineColorOf(feature(phase, {hostility, identityStated: true}))).toBe(lineColorOf(feature(phase, {hostility})));
        }
    });
});

describe('a graphic marked as an exercise', () => {
    const phase = TacticalGraphicName.PhaseLine;

    it('draws its line work yellow when its identity is unknown', () => {
        const f = feature(phase, {hostility: TacticalGraphicHostility.unknown, exercise: true});
        expect(lineColorOf(f)).toBe(PENDING);
        expect(affiliationColorOf(f)).toBe(PENDING);
        expect(identityColorOf(f)).toBe(PENDING);
    });

    it('paints the yellow, end to end', () => {
        const paint = getPaintFunction(phase)!.graphic!;
        const strokes = (props: Record<string, unknown>) =>
            new Set(paint(feature(phase, props), context).flatMap(p => (p.stroke ? [p.stroke.color] : [])));
        expect(strokes({hostility: TacticalGraphicHostility.unknown, exercise: true})).toEqual(new Set([PENDING]));
        expect(strokes({hostility: TacticalGraphicHostility.unknown})).toEqual(new Set([getDefaultLineColor()]));
    });

    it('stays unaffiliated when it states no identity at all', () => {
        expect(lineColorOf(feature(phase, {exercise: true}))).toBe(getDefaultLineColor());
    });

    it('takes no colour on a graphic whose symbol has no standard identity', () => {
        // A tactical mission task is drawn the same whatever identity arrives with it.
        const f = feature(TacticalGraphicName.Seize, {hostility: TacticalGraphicHostility.unknown, exercise: true});
        expect(lineColorOf(f)).toBe(getDefaultLineColor());
    });

    it('keeps the obstacle green, which beats every identity', () => {
        const f = feature(TacticalGraphicName.Abatis, {hostility: TacticalGraphicHostility.unknown, exercise: true});
        expect(lineColorOf(f)).not.toBe(PENDING);
    });
});
