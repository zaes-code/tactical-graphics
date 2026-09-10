/**
 * # X, XX, XXX
 *
 * The echelon glyph runs dots for squad through platoon, bars for company through
 * regiment, and X's above that. It stopped at one X — brigade — so a division or a corps
 * boundary could not be drawn at all, which is most of what a boundary is for at those
 * levels. FM 1-02.2's table 5-3 draws the division case: two X's side by side on the
 * break in the line, and the brigade row below it draws one.
 *
 * A glyph is counted here in strokes rather than compared as a picture: an X is two arms,
 * so a division is four and a corps is six, and each X sits on the segment a glyph's width
 * from its neighbour.
 */
import type {Paint, ProjectedPosition} from '../core/paint';
import {TacticalGraphicEchelon} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {echelonMarks} from './echelonPaints';

/** One metre per pixel, so a screen size and a ground size are the same number. */
const RES = 1;
const MID: ProjectedPosition = [0, 0];

/** The glyph drawn along an east-west segment. */
const marks = (echelon: TacticalGraphicEchelon): Paint[] => echelonMarks(MID, 100, 0, RES, echelon, '#000');

/** Every stroked arm, as its two ends. */
const arms = (paints: Paint[]): ProjectedPosition[][] =>
    paints
        .filter(p => p.stroke && p.geometry.type === 'LineString')
        .map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);

beforeEach(() => resetTacticalGraphicsConfig());

describe('the echelons drawn as X', () => {
    it.each([
        {echelon: TacticalGraphicEchelon.brigade, crosses: 1},
        {echelon: TacticalGraphicEchelon.division, crosses: 2},
        {echelon: TacticalGraphicEchelon.corpsMef, crosses: 3},
    ])('$echelon draws $crosses of them', ({echelon, crosses}) => {
        expect(arms(marks(echelon))).toHaveLength(crosses * 2);
    });

    /** Centred on the break, whichever way the line runs, or the glyph slides off it. */
    it.each([TacticalGraphicEchelon.division, TacticalGraphicEchelon.corpsMef])('%s stays centred on the gap', echelon => {
        const xs = arms(marks(echelon)).flat().map(p => p[0]);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 6);
    });

    /**
     * **Side by side, not spaced out.** The X's step by their own width, so the pair reads
     * as `XX` the way the plate draws it rather than as two marks with a hole between them.
     */
    it('steps a division’s two X by one glyph width', () => {
        const centres = arms(marks(TacticalGraphicEchelon.division)).map(a => (a[0][0] + a[1][0]) / 2);
        const left = Math.min(...centres);
        const right = Math.max(...centres);
        const oneX = arms(marks(TacticalGraphicEchelon.brigade));
        const width = Math.max(...oneX.flat().map(p => p[0])) - Math.min(...oneX.flat().map(p => p[0]));
        expect(right - left).toBeCloseTo(width, 6);
    });

    /** The dots and bars are untouched, and still say what they said. */
    it.each([
        {echelon: TacticalGraphicEchelon.squad, dots: 1, bars: 0},
        {echelon: TacticalGraphicEchelon.platoonDetachment, dots: 3, bars: 0},
        {echelon: TacticalGraphicEchelon.regimentGroup, dots: 0, bars: 3},
    ])('$echelon is unchanged', ({echelon, dots, bars}) => {
        const paints = marks(echelon);
        expect(paints.filter(p => p.circle)).toHaveLength(dots);
        expect(arms(paints)).toHaveLength(bars);
    });
});
