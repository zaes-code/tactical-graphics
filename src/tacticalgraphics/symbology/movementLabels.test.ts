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
        properties: {name, label: 'ALPHA', startDate: '021200ZJUN26'},
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

    it('flips the alignment rather than the anchor', () => {
        // The anchor stays where the generator put it — half a radius before the midpoint —
        // and only the direction the glyphs run changes. Moving the anchor instead would
        // shift the east-facing case, which was already right.
        const paint = getPaintFunction(TacticalGraphicName.CounterattackByFire)!.label!;
        const east = paint(labelFeature(TacticalGraphicName.CounterattackByFire, EAST.from, EAST.to), context)[0];
        const west = paint(labelFeature(TacticalGraphicName.CounterattackByFire, WEST.from, WEST.to), context)[0];
        expect(east.text!.align).toBe('left');
        expect(west.text!.align).toBe('right');
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
