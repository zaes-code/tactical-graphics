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
import {LINE_WIDTH} from '../core/symbology';
import {echelonMarks} from './echelonPaints';

/** One metre per pixel, so a screen size and a ground size are the same number. */
const RES = 1;
const MID: ProjectedPosition = [0, 0];

/**
 * The glyph drawn along an east-west segment.
 *
 * Long enough that the span cap below never bites, so these measure the layout itself.
 * @see ECHELON_SPAN_SHARE
 */
const marks = (echelon: TacticalGraphicEchelon): Paint[] => echelonMarks(MID, 2_000, 0, RES, echelon, '#000');

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
     * **Side by side with daylight between them.** The X's step by their own width plus a
     * couple of pixels, so the pair reads as `XX` the way the plate draws it — neither two
     * marks with a hole between them nor a lattice of touching arms.
     */
    it('leaves a gap between a division’s two X that survives the stroke', () => {
        const centres = arms(marks(TacticalGraphicEchelon.division)).map(a => (a[0][0] + a[1][0]) / 2);
        const step = Math.max(...centres) - Math.min(...centres);
        const oneX = arms(marks(TacticalGraphicEchelon.brigade)).flat().map(p => p[0]);
        const width = Math.max(...oneX) - Math.min(...oneX);
        /*
         * **Wider than the two pixels asked for, because an arm is a stroke.** A 45-degree
         * stroke of width `w` puts ink `w/√2` past its own endpoint horizontally, from each
         * neighbour, so a step of geometry-plus-two left the X's touching on screen: zero
         * empty columns, measured on the rendered boundary. The allowance is what buys the
         * daylight, and at one metre per pixel these are pixels.
         */
        expect(step - width).toBeCloseTo(2 + LINE_WIDTH() * Math.SQRT2, 6);
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

/**
 * # The glyph may not outgrow the line it sits on
 *
 * Every size in it is screen pixels times the label scale, so it held its size while the
 * symbol shrank under it: measured on a boundary before this, a corps glyph spanned 20 px
 * of a 40 px line and its outer arms lay across the line rather than inside the gap cut for
 * it. (User's report, 2026-09-10.)
 */
describe('the cap against the segment', () => {
    /** The glyph's own width, in screen pixels, along an east-west segment. */
    const widthPx = (echelon: TacticalGraphicEchelon, segmentPx: number, resolution = 1): number => {
        const half = (segmentPx * resolution) / 2;
        const paints = echelonMarks([0, 0], segmentPx * resolution, 0, resolution, echelon, '#000');
        expect(half).toBeGreaterThan(0);
        const xs = paints.flatMap(p => {
            if (p.circle && p.geometry.type === 'Point') {
                const at = (p.geometry as {coordinates: ProjectedPosition}).coordinates[0] / resolution;
                return [at - (p.circle.radiusPx ?? 0), at + (p.circle.radiusPx ?? 0)];
            }
            if (p.geometry.type === 'LineString') {
                return (p.geometry as {coordinates: ProjectedPosition[]}).coordinates.map(c => c[0] / resolution);
            }
            return [];
        });
        return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
    };

    it.each([
        TacticalGraphicEchelon.platoonDetachment,
        TacticalGraphicEchelon.regimentGroup,
        TacticalGraphicEchelon.division,
        TacticalGraphicEchelon.corpsMef,
    ])('%s stays inside the fifth of the segment the gap is cut from', echelon => {
        // A tenth of a pixel of slack: the space between the X's is a stroke allowance and
        // does not shrink with the rest. @see ECHELON_SPAN_SHARE
        for (const segmentPx of [40, 80, 160]) {
            expect(widthPx(echelon, segmentPx)).toBeLessThanOrEqual(segmentPx * 0.2 + 3.1);
        }
    });

    /** Above the cap it is the size it always was, so nothing changes at ordinary zooms. */
    it('leaves a glyph alone on a segment long enough to carry it', () => {
        expect(widthPx(TacticalGraphicEchelon.corpsMef, 1_000)).toBeCloseTo(widthPx(TacticalGraphicEchelon.corpsMef, 400), 6);
    });

    /** The rule is about the shape, so zooming out does what drawing small does. */
    it('reads the segment on screen, not on the ground', () => {
        expect(widthPx(TacticalGraphicEchelon.division, 80, 1)).toBeCloseTo(widthPx(TacticalGraphicEchelon.division, 80, 250), 6);
    });
});
