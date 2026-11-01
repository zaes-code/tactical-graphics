/**
 * # The bar is a share of the leg, not a slab
 *
 * Fields of fire thickens the middle of its left leg. That thickening was a flat 12 screen
 * pixels, so it kept its size while the symbol shrank under it: drawn small, or seen from
 * far enough out, the V wore a slab down one side. 140500's Template makes the thick
 * section 19 px on a 331 px leg, which is where the share comes from.
 *
 * (User's report, 2026-09-10.)
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {LINE_WIDTH} from '../core/symbology';
import {resetTacticalGraphicsConfig} from '../core/config';
import {fieldsOfFirePaint} from './mobilityPaints';

const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
});

/** A V of `legMetres` per leg, as the generator emits it: `[left leg, right leg]`. */
const vee = (legMetres: number): PaintFeature => {
    const vertex: ProjectedPosition = [0, 0];
    const left: ProjectedPosition = [-legMetres * 0.6, legMetres * 0.8];
    const right: ProjectedPosition = [legMetres * 0.6, legMetres * 0.8];
    return {
        geometry: {type: 'MultiLineString', coordinates: [[vertex, left], [vertex, right]]},
        properties: {name: TacticalGraphicName.FieldsOfFire, designation: 'MG'},
    } as PaintFeature;
};

/** The bar is the one stroke that is not the line work. */
const barWidth = (legMetres: number, resolution: number): number => {
    const paints = fieldsOfFirePaint()(vee(legMetres), context(resolution));
    const bars = paints.filter(p => p.stroke && p.stroke.widthPx !== LINE_WIDTH());
    expect(bars).toHaveLength(1);
    return bars[0].stroke!.widthPx!;
};

beforeEach(() => resetTacticalGraphicsConfig());

describe('the field of fire bar', () => {
    /** One metre per pixel, so a leg in metres is a leg in pixels. */
    it('stays 12 px on a leg long enough to carry it', () => {
        expect(barWidth(1_000, 1)).toBeCloseTo(12, 6);
    });

    it('shrinks with a leg too short for the full width', () => {
        // 100 px of leg: a twelfth of it would be a sixth of the symbol.
        expect(barWidth(100, 1)).toBeCloseTo(100 * 0.057, 6);
    });

    /** The rule is about the shape, so zooming out does the same thing as drawing small. */
    it('reads the leg on screen, not on the ground', () => {
        expect(barWidth(10_000, 100)).toBeCloseTo(barWidth(100, 1), 6);
    });

    it('never falls below twice the line width, which is where it stops reading as a bar', () => {
        expect(barWidth(10, 1)).toBeCloseTo(LINE_WIDTH() * 2, 6);
    });
});

/**
 * MIL-STD-2525E Change 1 140501: "The length of the 'blade' shall be 80% of the length of
 * point 1 and point 2, centered and connected to the inside of the line."
 */
describe('the blade against 2525E 140501', () => {
    // [PT 2, PT 1, PT 3], 1000 px legs, the V opening upward.
    const v: ProjectedPosition[] = [[-600, 800], [0, 0], [600, 800]];
    const blade = (name: TacticalGraphicName) => {
        const paints = fieldsOfFirePaint(name)({geometry: {type: 'MultiLineString', coordinates: [v]}, properties: {name}} as PaintFeature, context(1));
        const bar = paints.find(p => p.stroke && p.stroke.widthPx !== LINE_WIDTH())!;
        return {coords: (bar.geometry as {coordinates: ProjectedPosition[]}).coordinates, width: bar.stroke!.widthPx!};
    };

    it.each([
        [TacticalGraphicName.FinalProtectiveFireLeft, -1],
        [TacticalGraphicName.FinalProtectiveFireRight, 1],
    ] as const)('%s runs 80% of its leg, centred, on the inside', (name, side) => {
        const {coords: [a, b], width} = blade(name);
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(800, 0);
        // Centred: its midpoint is the leg's midpoint, shifted inward by half the blade less half the line.
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const legMid = [side * 300, 400];
        const shift = Math.hypot(mid[0] - legMid[0], mid[1] - legMid[1]);
        expect(shift).toBeCloseTo((width - LINE_WIDTH()) / 2, 6);
        // Inward is toward the V's axis, x = 0.
        expect(Math.abs(mid[0])).toBeLessThan(Math.abs(legMid[0]));
    });
});
