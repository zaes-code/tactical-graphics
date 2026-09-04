/**
 * # APP-06 330100 / 330200 — the convoys
 *
 * Two things this suite exists for, and neither is "does it draw a shape".
 *
 * **The two convoys must not be one picture.** They were both `Phaseline` until 2026-09-04
 * and therefore *were* one picture, on a note claiming that was "the right shape". A block
 * arrow and a bodied open triangle are two symbols; the first test refuses the shortcut
 * that would make them one again.
 *
 * **The head lands on point 1.** Both plates number the arrowhead first, so both are in
 * `TIP_FIRST_GRAPHICS` and the base is reversed on the way into the generator. Getting that
 * backwards points every convoy the way it came from, which is a defect no test that only
 * counts marks can see.
 */
import {TacticalGraphicName} from '../core/type';
import {renderTacticalGraphic} from '../core/render';
import type {Feature} from 'geojson';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {getPaintFunction, isPaintable} from './registry';
import {convoyPaint} from './convoyPaints';
import {fontStyle} from '../core/symbology';

const RESOLUTION = 10;
const context = {resolution: RESOLUTION, measureText: (t: string) => t.length * 9} as unknown as PaintContext;

/** A west-to-east run, in projected metres, as the generator hands it over: rear then tip. */
function runFeature(
    name: TacticalGraphicName,
    properties: Record<string, unknown> = {},
    coordinates: ProjectedPosition[] = [[0, 0], [4000, 0]],
): PaintFeature {
    return {
        geometry: {type: 'LineString', coordinates},
        properties: {name, ...properties},
    } as unknown as PaintFeature;
}

const linesOf = (paints: Paint[]): ProjectedPosition[][] =>
    paints
        .filter(p => p.geometry.type === 'LineString')
        .map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);

const textsOf = (paints: Paint[]): string[] =>
    paints.filter(p => p.text?.text).map(p => String(p.text!.text));

describe('the two convoys are two symbols', () => {
    it('both are registered, with painters of their own', () => {
        for (const name of [TacticalGraphicName.MovingConvoy, TacticalGraphicName.HaltedConvoy]) {
            expect(isPaintable(name)).toBe(true);
            expect(getPaintFunction(name)?.graphic).toBeDefined();
        }
    });

    it('does not draw the same picture for both', () => {
        /*
         * Output, not painter identity — they legitimately *share* one painter factory, so
         * an identity check would pass on the defect this guards. What has to differ is the
         * drawing: 330100 is one continuous outline, 330200 is a closed body plus a
         * separate open triangle.
         */
        const moving = linesOf(convoyPaint(TacticalGraphicName.MovingConvoy)(runFeature(TacticalGraphicName.MovingConvoy), context));
        const halted = linesOf(convoyPaint(TacticalGraphicName.HaltedConvoy)(runFeature(TacticalGraphicName.HaltedConvoy), context));
        expect(moving).toHaveLength(1);
        expect(halted).toHaveLength(2);
        expect(JSON.stringify(moving)).not.toBe(JSON.stringify(halted));
    });

    it('gives the moving convoy barbs that stand clear of its body', () => {
        // The block arrow's whole shape: the head is wider across than the body it flares
        // from. Equal widths would draw a rectangle with a point on it.
        const [ring] = linesOf(convoyPaint(TacticalGraphicName.MovingConvoy)(runFeature(TacticalGraphicName.MovingConvoy), context));
        const across = ring.map(p => Math.abs(p[1]));
        const bodyHalf = Math.min(...across.filter(v => v > 0));
        const headHalf = Math.max(...across);
        expect(headHalf).toBeGreaterThan(bodyHalf * 1.4);
    });

    it('opens the halted convoy toward point 1 rather than closing it', () => {
        // Its apex sits **on the axis** at the body's leading edge and its base spans the
        // full head width at the tip — the opposite of the moving convoy's solid point.
        const [, triangle] = linesOf(convoyPaint(TacticalGraphicName.HaltedConvoy)(runFeature(TacticalGraphicName.HaltedConvoy), context));
        const [apex, first, second] = triangle;
        expect(apex[1]).toBeCloseTo(0, 6);
        expect(first[0]).toBeCloseTo(4000, 6);
        expect(second[0]).toBeCloseTo(4000, 6);
        expect(Math.abs(first[1] - second[1])).toBeGreaterThan(0);
    });
});

describe('which end the head lands on', () => {
    /*
     * The check that matters, and it goes through `renderTacticalGraphic` rather than
     * calling the paint directly — the reversal happens in `TacticalGraphicsBase.generate`,
     * so a paint-only test cannot see it at all. Point 1 is the operator's *first* click.
     */
    const base = (name: TacticalGraphicName): Feature => ({
        type: 'Feature',
        // Point 1 east, point 2 west: the operator clicked the arrowhead first.
        geometry: {type: 'LineString', coordinates: [[10, 0], [0, 0]]},
        properties: {tacticalGraphic: {name}},
    });

    it.each([TacticalGraphicName.MovingConvoy, TacticalGraphicName.HaltedConvoy])(
        '%s builds its head at the first clicked point',
        name => {
            const rendered = renderTacticalGraphic(base(name));
            const coords = (rendered.graphic!.geometry as {coordinates: number[][]}).coordinates;
            // The generator is handed rear-to-tip, so the geometry it returns ends at the
            // point the operator clicked first.
            expect(coords[coords.length - 1][0]).toBeCloseTo(10, 6);
            expect(coords[0][0]).toBeCloseTo(0, 6);
        },
    );
});

describe('the amplifiers', () => {
    const properties = {
        weapon: 'M1A2',
        additionalInfo: '5',
        startDate: '240500ZMAY2026',
        endDate: '260800ZMAY2026',
    };

    it('draws V, H and the joined date-time group', () => {
        const drawn = textsOf(convoyPaint(TacticalGraphicName.MovingConvoy)(
            runFeature(TacticalGraphicName.MovingConvoy, properties), context,
        ));
        expect(drawn).toContain('M1A2');
        expect(drawn).toContain('5');
        expect(drawn).toContain('240500ZMAY2026 - 260800ZMAY2026');
    });

    it('sets V and H inside the body, on the axis', () => {
        const paints = convoyPaint(TacticalGraphicName.MovingConvoy)(
            runFeature(TacticalGraphicName.MovingConvoy, properties), context,
        );
        const at = (text: string) =>
            (paints.find(p => p.text?.text === text)!.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at('M1A2')[1]).toBeCloseTo(0, 6);
        expect(at('5')[1]).toBeCloseTo(0, 6);
        // V toward the rear, H toward the head — the Template's order.
        expect(at('M1A2')[0]).toBeLessThan(at('5')[0]);
    });

    it('hangs the dates below the body whichever way the convoy runs', () => {
        /*
         * **The one that catches a plain negative offset.** The left normal of a run flips
         * when the same convoy is drawn east-to-west, so a `-across` offset would put the
         * dates *above* the body on half the bearings — and `uprightRotation` has already
         * turned the text the right way up, so nothing else gives it away.
         */
        const dates = '240500ZMAY2026 - 260800ZMAY2026';
        const yOf = (coordinates: ProjectedPosition[]) => {
            const paints = convoyPaint(TacticalGraphicName.MovingConvoy)(
                runFeature(TacticalGraphicName.MovingConvoy, properties, coordinates), context,
            );
            return (paints.find(p => p.text?.text === dates)!.geometry as {coordinates: ProjectedPosition}).coordinates[1];
        };
        expect(yOf([[0, 0], [4000, 0]])).toBeLessThan(0);
        expect(yOf([[4000, 0], [0, 0]])).toBeLessThan(0);
    });
});

describe('a resize scales the symbol; lengthening the line does not', () => {
    /*
     * **Two gestures, two answers, and the round trip between them is the history here.**
     *
     * The first version made every cross-axis dimension a screen constant. The user asked
     * for *"resize should wholesomely affect the shape and labels"*, which was read as "make
     * the body a share of the run" — and that made **dragging the red handle** fatten the
     * convoy, because lengthening the line is not resizing the symbol. The user's correction
     * (2026-09-04): *"The user should be able to make line pt1-pt2 longer w/o affecting the
     * width of the graphic. Resize icon should resize wholesomely though."*
     *
     * `decorationSize` is the mechanism for exactly that split: a vertex drag leaves it
     * alone and the resize gesture multiplies it. So the assertions come in pairs — what a
     * longer run must *not* change, and what a larger `decorationSize` must.
     */
    const drawn = (length: number, decorationSize?: number) =>
        convoyPaint(TacticalGraphicName.MovingConvoy)(
            runFeature(TacticalGraphicName.MovingConvoy, decorationSize === undefined ? {} : {decorationSize}, [[0, 0], [length, 0]]),
            context,
        );
    const outline = (length: number, decorationSize?: number) => linesOf(drawn(length, decorationSize))[0];
    const across = (ring: ProjectedPosition[]) => Math.max(...ring.map(p => Math.abs(p[1])));

    it('leaves the body and the head alone when the run is lengthened', () => {
        expect(across(outline(8000))).toBeCloseTo(across(outline(4000)), 6);
    });

    it('grows the body and the head with the decoration size', () => {
        expect(across(outline(40_000, 4000)) / across(outline(40_000, 2000))).toBeCloseTo(2, 6);
    });

    it('holds the plate proportions at every decoration size', () => {
        // 50/448 across the body against 114/448 along the head, off the Template at 300
        // dpi -- so the head is 2.28 body half-heights long whatever the body is.
        for (const size of [500, 2000, 8000]) {
            const ring = outline(200_000, size);
            const bodyHalf = Math.min(...ring.map(p => Math.abs(p[1])).filter(v => v > 0));
            const neck = Math.max(...ring.filter(p => Math.abs(p[1]) > 0).map(p => p[0]));
            expect(bodyHalf).toBeCloseTo(size, 6);
            expect((200_000 - neck) / bodyHalf).toBeCloseTo(2.28, 2);
        }
    });

    it('scales the labels with the decoration, not with the run, and caps them', () => {
        const scaleAt = (length: number, decorationSize?: number) =>
            drawn(length, decorationSize).find(p => p.text?.text === 'M1A2')?.text?.scale
            ?? convoyPaint(TacticalGraphicName.MovingConvoy)(
                runFeature(TacticalGraphicName.MovingConvoy,
                    decorationSize === undefined ? {weapon: 'M1A2'} : {weapon: 'M1A2', decorationSize},
                    [[0, 0], [length, 0]]),
                context,
            ).find(p => p.text?.text === 'M1A2')!.text!.scale!;
        // A longer run leaves the lettering where it was...
        expect(scaleAt(8000)).toBeCloseTo(scaleAt(4000), 6);
        // ...a bigger symbol grows it, measured **below the ceiling**, since two sizes that
        // both reach it are equal for a reason that says nothing about the rule...
        expect(scaleAt(200_000, 100)).toBeGreaterThan(scaleAt(200_000, 60));
        // ...and it stops, rather than reaching the 448 px line of text an uncapped
        // span-proportional scale produced on the avenue of approach. @see scaleOf
        expect(scaleAt(4_000_000, 400_000)).toBeLessThanOrEqual(scaleAt(4_000_000, 40_000) * 1.0001);
        expect(scaleAt(4_000_000, 400_000)).toBeLessThan(10);
    });

    it('shrinks rather than overhanging when the run is shorter than the head', () => {
        // The cap: at the limit one body-half of shaft is left, so the neck stays ahead of
        // the rear and the outline cannot cross itself. @see convoyPaint
        const ring = outline(2000, 100_000);
        expect(Math.min(...ring.map(p => p[0]))).toBeGreaterThanOrEqual(-1e-6);
        expect(Math.max(...ring.map(p => p[0]))).toBeLessThanOrEqual(2000 + 1e-6);
    });

    it('renders V and H at one size, not two', () => {
        /*
         * **The user's report, 2026-09-04: "H is bigger on zoomout".**
         *
         * The two fields sit side by side inside the same body at the same nominal size, and
         * each was capped against its half of it by `capLabelToSpan` — which shrinks by the
         * text's *own* width. So two fields of different lengths came out at two sizes, and
         * the gap opened as the map zoomed out: the span shrinks in pixels, so the longer
         * label starts being capped while the shorter one is still at full size.
         *
         * Asserted at two resolutions, because one is exactly the condition under which the
         * old code looked fine — at a wide enough span neither is capped and both sit at the
         * shared scale by accident.
         */
        const sizes = (resolution: number) => {
            const paints = convoyPaint(TacticalGraphicName.MovingConvoy)(
                runFeature(TacticalGraphicName.MovingConvoy,
                    {weapon: 'M1A2 ABRAMS HEAVY BRIGADE', additionalInfo: '5'},
                    [[0, 0], [4000, 0]]),
                {...context, resolution} as PaintContext,
            );
            return ['M1A2 ABRAMS HEAVY BRIGADE', '5'].map(t => paints.find(p => p.text?.text === t)!.text!.scale!);
        };
        for (const resolution of [1, 10]) {
            const [v, h] = sizes(resolution);
            expect(h).toBeCloseTo(v, 10);
        }
        // ...and the shared size is the tighter of the two, so the long one still fits.
        expect(sizes(10)[0]).toBeLessThan(sizes(1)[0] * 1.0001);
    });

    it('never lets V and H meet in the middle of the body', () => {
        // Each has half the body; a long equipment type shrinks rather than colliding.
        const paints = convoyPaint(TacticalGraphicName.MovingConvoy)(
            runFeature(TacticalGraphicName.MovingConvoy,
                {weapon: 'M1A2 ABRAMS HEAVY BRIGADE', additionalInfo: 'SERIAL 27 OF 31'},
                [[0, 0], [4000, 0]]), context,
        );
        const mark = (text: string) => paints.find(p => p.text?.text === text)!;
        const widthOf = (text: string) =>
            context.measureText(text, fontStyle) * mark(text).text!.scale!;
        const gap = Math.abs(
            (mark('SERIAL 27 OF 31').geometry as {coordinates: ProjectedPosition}).coordinates[0]
            - (mark('M1A2 ABRAMS HEAVY BRIGADE').geometry as {coordinates: ProjectedPosition}).coordinates[0],
        ) / context.resolution;
        expect((widthOf('M1A2 ABRAMS HEAVY BRIGADE') + widthOf('SERIAL 27 OF 31')) / 2).toBeLessThanOrEqual(gap);
    });
});

describe('the symbol shrinks rather than turning inside out', () => {
    it('never puts the neck behind the rear', () => {
        // Uncapped, a run shorter than the head would drive the body's leading edge past
        // its trailing one and the outline would cross itself.
        for (const length of [40, 120, 400, 4000]) {
            const [ring] = linesOf(convoyPaint(TacticalGraphicName.MovingConvoy)(
                runFeature(TacticalGraphicName.MovingConvoy, {}, [[0, 0], [length, 0]]), context,
            ));
            if (!ring) continue;
            for (const [x] of ring) {
                expect(x).toBeGreaterThanOrEqual(-1e-6);
                expect(x).toBeLessThanOrEqual(length + 1e-6);
            }
        }
    });

    it('falls back to a bare run when the body would be under the visibility floor', () => {
        const paints = convoyPaint(TacticalGraphicName.MovingConvoy)(
            runFeature(TacticalGraphicName.MovingConvoy, {}, [[0, 0], [20, 0]]), context,
        );
        expect(linesOf(paints)).toEqual([[[0, 0], [20, 0]]]);
    });
});
