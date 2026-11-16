/**
 * # Exercise unknown draws yellow
 *
 * MIL-STD-2525C Table II draws EXERCISE UNKNOWN (W) in yellow, beside EXERCISE PENDING (G),
 * and Table XIII gives "Unknown, Pending" one yellow. 5.5.1.1 asks a graphic's colour to be
 * "consistent with the standard identity of the associated tactical symbol". So an exercise
 * graphic whose identity is unknown takes the pending yellow, where an unknown graphic outside
 * an exercise keeps the default line colour this library has always given it.
 */
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {configureTacticalGraphics, resetTacticalGraphicsConfig} from '../core/config';
import {getColorByHostility, getColorByIdentity, getDefaultLineColor} from '../core/symbology';
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
