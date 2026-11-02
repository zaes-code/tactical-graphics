/**
 * # A hostile line control measure says ENY at both ends
 *
 * FM 1-02.2 Figure 5-9 is the line template every line control measure shares: field N at
 * the far left and the far right, `N PL T ... PL T N`. APP-06 8.1.4 asks for `ENY` in at
 * least two places when red is not available. Only phase line carried it, and it put the
 * right-hand one on the inner side, next to the line.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {TacticalGraphicsConfig, resetTacticalGraphicsConfig, setTacticalGraphicsConfig} from '../core/config';
import {getPaintFunction} from './registry';

const context: PaintContext = {
    resolution: 100,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** Drawn west to east, long enough that nothing is cut for size. */
const EAST: ProjectedPosition[] = [[0, 0], [200_000, 0]];

const paint = (name: TacticalGraphicName, coords: ProjectedPosition[], hostility: TacticalGraphicHostility): Paint[] =>
    getPaintFunction(name)!.graphic(
        {
            geometry: {type: 'LineString', coordinates: coords},
            properties: {name, designation: 'BLUE', hostility, startDate: 'W', endDate: 'W1'},
        } as PaintFeature,
        context,
    );

/** The text marks, west to east by anchor. */
const texts = (paints: Paint[]): string[] =>
    paints
        .filter(p => p.text && p.geometry.type === 'Point')
        .sort((a, b) => (a.geometry.coordinates as number[])[0] - (b.geometry.coordinates as number[])[0])
        .map(p => p.text!.text);

/** The 22 lines of finding 73, every one drawn by the default line paint or the CFL's. */
const LINES = [
    TacticalGraphicName.ForwardEdgeOfBattleArea,
    TacticalGraphicName.ReleaseLine,
    TacticalGraphicName.BridgeheadLine,
    TacticalGraphicName.FinalCoordinationLine,
    TacticalGraphicName.LimitOfAdvance,
    TacticalGraphicName.LineOfDeparture,
    TacticalGraphicName.LineOfDepartureOrLineOfContact,
    TacticalGraphicName.ProbableLineOfDeployment,
    TacticalGraphicName.HoldingLine,
    TacticalGraphicName.HandoverLine,
    TacticalGraphicName.LightLine,
    TacticalGraphicName.BattlefieldHandoverLine,
    TacticalGraphicName.DelayLine,
    TacticalGraphicName.CommonSensorBoundary,
    TacticalGraphicName.FireSupportCoordinationLine,
    TacticalGraphicName.NoFireLine,
    TacticalGraphicName.RestrictiveFireLine,
    TacticalGraphicName.BattlefieldCoordinationLine,
    TacticalGraphicName.IntelligenceCoordinationLine,
    TacticalGraphicName.LineGeneric,
    TacticalGraphicName.NamedAreaOfInterestLine,
];

// These pin the ENY marks, so they say so rather than lean on the default. @see TacticalGraphicsConfigOptions.enemyLabels
beforeEach(() => setTacticalGraphicsConfig(new TacticalGraphicsConfig({enemyLabels: true})));

describe('ENY on the outer side of each end of a hostile line', () => {
    it.each(LINES)('%s leads its west label and trails its east one', name => {
        const shown = texts(paint(name, EAST, TacticalGraphicHostility.hostileFaker)).filter(t => t.includes('BLUE'));
        expect(shown).toHaveLength(2);
        expect(shown[0].startsWith('ENY ')).toBe(true);
        expect(shown[1].endsWith(' ENY')).toBe(true);
    });

    it.each(LINES)('%s draws no ENY for a friendly line', name => {
        expect(texts(paint(name, EAST, TacticalGraphicHostility.friend)).some(t => t.includes('ENY'))).toBe(false);
    });

    it('keeps ENY outside whichever way the line was drawn', () => {
        const west = [...EAST].reverse() as ProjectedPosition[];
        const shown = texts(paint(TacticalGraphicName.FireSupportCoordinationLine, west, TacticalGraphicHostility.hostileFaker))
            .filter(t => t.includes('BLUE'));
        expect(shown[0].startsWith('ENY ')).toBe(true);
        expect(shown[1].endsWith(' ENY')).toBe(true);
    });

    it('sets phase line ENY outside both ends, N PL T ... PL T N', () => {
        const paints = paint(TacticalGraphicName.PhaseLine, EAST, TacticalGraphicHostility.hostileFaker).filter(p => p.text);
        const left = paints.find(p => (p.text!.offsetXPx ?? 0) < 0)!;
        const right = paints.find(p => (p.text!.offsetXPx ?? 0) > 0)!;
        expect(left.text!.text).toBe('ENY PL BLUE');
        expect(right.text!.text).toBe('PL BLUE ENY');
    });

    it('marks both ends of a hostile coordinated fire line', () => {
        const marks = texts(paint(TacticalGraphicName.CoordinatedFireLine, EAST, TacticalGraphicHostility.hostileFaker));
        expect(marks.filter(t => t === 'ENY')).toHaveLength(2);
        expect(texts(paint(TacticalGraphicName.CoordinatedFireLine, EAST, TacticalGraphicHostility.friend))).not.toContain('ENY');
    });

    it('marks both ends of a hostile boundary (APP-06 110100)', () => {
        expect(texts(paint(TacticalGraphicName.Boundary, EAST, TacticalGraphicHostility.hostileFaker)).filter(t => t === 'ENY')).toHaveLength(2);
        expect(texts(paint(TacticalGraphicName.Boundary, EAST, TacticalGraphicHostility.friend))).not.toContain('ENY');
    });
});

describe("ENY is the host's choice", () => {
    // On by default, and a host content with the red line work alone turns it off
    // (user, 2026-11-02). @see TacticalGraphicsConfigOptions.enemyLabels
    it.each(LINES)('%s writes ENY by default and none when enemyLabels is off', name => {
        resetTacticalGraphicsConfig();
        expect(texts(paint(name, EAST, TacticalGraphicHostility.hostileFaker)).some(t => t.includes('ENY'))).toBe(true);
        setTacticalGraphicsConfig(new TacticalGraphicsConfig({enemyLabels: false}));
        expect(texts(paint(name, EAST, TacticalGraphicHostility.hostileFaker)).some(t => t.includes('ENY'))).toBe(false);
    });
});
