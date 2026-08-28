/**
 * # A movement label reads forward, and stops growing
 *
 * Two faults in the same family, both invisible to everything that looked at one arrow
 * pointing one way.
 *
 * **The alignment did not flip with the rotation.** `uprightRotation` turns a westward
 * label through half a turn so it reads the right way up, and that reverses which way the
 * glyphs run on screen — so a `left` alignment against the same anchor laid the text out in
 * the *opposite* ground direction. On a counter-attack by fire the label's near edge sat
 * 294 km from the arrow tip pointing east and 300 km pointing west, the difference being
 * exactly the label's own width. It reads as the label drifting off the arrowhead on
 * west-facing arrows, and nothing caught it because every fixture points east.
 *
 * **`spanProportionalScale` had no ceiling.** It tracks the arrow's on-screen span, so a
 * long arrow — or a short one zoomed into — grew a label without bound: an avenue of
 * approach measured **scale 28, a 448 px line of text**, at a zoom where the arrow still
 * fitted the screen. One caller had noticed and capped itself; the other eleven had not.
 */

import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {resetTacticalGraphicsConfig} from '../core/config';
import {maxGraphicLabelScale} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {getPaintFunction} from './registry';
import {spanProportionalScale} from './movementPaints';

const context: PaintContext = {
    resolution: 40,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/**
 * A label feature as the generators emit one: a pair of anchors running **rear to tip**,
 * straddling the point the text is set from.
 */
function labelFeature(name: TacticalGraphicName, from: ProjectedPosition, to: ProjectedPosition): PaintFeature {
    return {
        geometry: {type: 'MultiPoint', coordinates: [from, to]},
        properties: {name, designation: 'ALPHA', startDate: '021200ZJUN26'},
    } as unknown as PaintFeature;
}

/**
 * How far the text block's nearest edge stops short of the arrowhead, in projected metres.
 *
 * Which edge is "nearest" depends on the arrow's direction, not on the alignment — getting
 * that backwards is how the first pass at this measurement reported the fix as a no-op.
 */
function gapToTip(name: TacticalGraphicName, from: ProjectedPosition, to: ProjectedPosition, tipX: number): number {
    const paint = getPaintFunction(name)?.label;
    if (!paint) throw new Error(`no label paint for ${name}`);
    const mark = paint(labelFeature(name, from, to), context).find(p => p.text?.text);
    if (!mark || mark.geometry.type !== 'Point') throw new Error(`no text for ${name}`);

    const at = mark.geometry.coordinates as ProjectedPosition;
    const {text, font, scale = 1, align = 'center', rotation = 0} = mark.text!;
    const widthM = context.measureText(text, font) * scale * context.resolution;
    // Screen rotations are clockwise; the glyph run direction is the unrotated x axis
    // turned by it. These fixtures are horizontal, so this is +1 or -1.
    const run = Math.cos(-rotation);
    const start = align === 'left' ? 0 : align === 'right' ? -1 : -0.5;
    const edges = [at[0] + run * widthM * start, at[0] + run * widthM * (start + 1)];
    return Math.min(...edges.map(e => Math.abs(e - tipX)));
}

/** The same arrow drawn east and drawn west, as a pair of label anchors either way. */
const SPAN = 600_000;
const EAST = {from: [0, 0] as ProjectedPosition, to: [SPAN, 0] as ProjectedPosition, tipX: SPAN};
const WEST = {from: [SPAN, 0] as ProjectedPosition, to: [0, 0] as ProjectedPosition, tipX: 0};

beforeEach(() => resetTacticalGraphicsConfig());

describe('a movement label sits the same distance from the arrowhead either way round', () => {
    const NAMES = [
        TacticalGraphicName.CounterattackByFire,
        TacticalGraphicName.Counterattack,
        TacticalGraphicName.TurningMovement,
        TacticalGraphicName.FrontalAttack,
        TacticalGraphicName.AvenueOfApproach,
    ];

    it.each(NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        const east = gapToTip(name, EAST.from, EAST.to, EAST.tipX);
        const west = gapToTip(name, WEST.from, WEST.to, WEST.tipX);
        // Within a metre on a 600 km arrow: the two are the same placement mirrored.
        expect(west).toBeCloseTo(east, 0);
    });

    it('flips the alignment, and only the alignment', () => {
        // The claim is the *flip*, not which side a given family starts from: an axis-style
        // label reads back from the arrowhead and a fixed-letter one reads forward from its
        // anchor, so pinning the literal `left` here made the test a hostage to a placement
        // change rather than a guard on the bug.
        for (const name of [TacticalGraphicName.CounterattackByFire, TacticalGraphicName.TurningMovement]) {
            const paint = getPaintFunction(name)!.label!;
            const east = paint(labelFeature(name, EAST.from, EAST.to), context)[0];
            const west = paint(labelFeature(name, WEST.from, WEST.to), context)[0];
            expect(new Set([east.text!.align, west.text!.align])).toEqual(new Set(['left', 'right']));
            // The anchor is the generator's; the flip must not move it.
            const at = (p: typeof east) => (p.geometry as {coordinates: ProjectedPosition}).coordinates;
            expect(Math.abs(at(east)[0] - EAST.from[0])).toBeCloseTo(Math.abs(at(west)[0] - WEST.from[0]), 0);
        }
    });
});

describe('the counterattacks label just behind the arrowhead', () => {
    const NAMES = [TacticalGraphicName.Counterattack, TacticalGraphicName.CounterattackByFire];

    it.each(NAMES.map(n => [String(n), n] as const))(
        '%s sets its text against the head end of the span, not the middle',
        (_label, name) => {
            // The generator publishes a span one radius long ending where the body does, so
            // `c1` is the arrowhead base. The text is set a fixed clearance back from it and
            // reads down the arrow; it used to sit at the midpoint of the whole last segment.
            const paint = getPaintFunction(name)!.label!;
            const mark = paint(labelFeature(name, EAST.from, EAST.to), context).find(p => p.text?.text)!;
            const at = (mark.geometry as {coordinates: ProjectedPosition}).coordinates;
            const midpoint = (EAST.from[0] + EAST.to[0]) / 2;
            expect(at[0]).toBeGreaterThan(midpoint);
            // Backed off the head rather than sitting on it.
            expect(at[0]).toBeLessThan(EAST.to[0]);
        },
    );

    it('sizes the text from the published span, so it shrinks with the arrow', () => {
        const paint = getPaintFunction(TacticalGraphicName.CounterattackByFire)!.label!;
        const scaleFor = (span: number) => {
            const mark = paint(labelFeature(TacticalGraphicName.CounterattackByFire, [0, 0], [span, 0]), context)
                .find(p => p.text?.text)!;
            return mark.text!.scale!;
        };
        // Below the ceiling, which at this resolution means a span under about 1.4 km —
        // anything larger is capped and the two would compare equal, which is what the
        // first version of this assertion actually measured.
        expect(scaleFor(400)).toBeLessThan(scaleFor(900));
        expect(scaleFor(SPAN)).toBeLessThanOrEqual(maxGraphicLabelScale());
    });
});

describe('APP-06 152300 — the avenue of approach carries no date-time group', () => {
    it('draws the literal and the designation, and nothing else', () => {
        const paint = getPaintFunction(TacticalGraphicName.AvenueOfApproach)!.label!;
        // The fixture carries a `startDate`, as an imported bag can for a symbol whose
        // Template has nowhere to put one. The Template shows `AA`, `T`, an `H` set apart
        // from the arrow and `N` twice down the tail -- no `W`, no `W1`.
        const mark = paint(labelFeature(TacticalGraphicName.AvenueOfApproach, EAST.from, EAST.to), context)
            .find(p => p.text?.text)!;
        expect(mark.text!.text).toBe('AA ALPHA');
    });
});

describe('spanProportionalScale stops somewhere', () => {
    it('never exceeds the ceiling every other size-proportional label stops at', () => {
        const cap = maxGraphicLabelScale();
        // A 600 km arrow across a range of zooms, including one that fills the screen.
        for (const resolution of [12000, 4000, 1500, 400, 40]) {
            const scale = spanProportionalScale([0, 0], [SPAN, 0], resolution, 16);
            expect(scale).toBeLessThanOrEqual(cap);
        }
    });

    it('still tracks the arrow below the ceiling', () => {
        // The cap must not flatten the behaviour it is capping: zoomed far enough out the
        // label is still proportional to the span.
        const far = spanProportionalScale([0, 0], [SPAN, 0], 200_000, 16);
        const nearer = spanProportionalScale([0, 0], [SPAN, 0], 100_000, 16);
        expect(far).toBeLessThan(nearer);
        expect(nearer).toBeLessThan(maxGraphicLabelScale());
    });

    it('holds the avenue of approach to it, which is where this was noticed', () => {
        const paint = getPaintFunction(TacticalGraphicName.AvenueOfApproach)!.label!;
        for (const resolution of [12000, 4000, 1500, 400]) {
            const mark = paint(labelFeature(TacticalGraphicName.AvenueOfApproach, EAST.from, EAST.to),
                {...context, resolution}).find(p => p.text?.text);
            expect(mark!.text!.scale!).toBeLessThanOrEqual(maxGraphicLabelScale());
        }
    });
});
