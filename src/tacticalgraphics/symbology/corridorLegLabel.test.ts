/**
 * # A corridor's designation is capped by the corridor, not by its own length
 *
 * The label runs *along* a leg, rotated, so two things bound it: its **length** against
 * the leg it runs down, and its **height** against the gap between the rails it runs
 * between. Only the first depends on how many characters the operator typed.
 *
 * The height bound used to be applied as a *width* cap — the label's natural width held
 * to 1.4 of the corridor's width — on the reasoning that a bounded aspect ratio makes one
 * a proxy for the other. It is not: a width cap divides by the text's natural width, so
 * every character added shrinks the answer. `AC BLUE` came out legible and
 * `AC CORRIDOR ONE`, on the same corridor, came out at a quarter of the size — correctly
 * inside its rails and impossible to read.
 *
 * These pin the property that broke: **on a corridor wide enough and a leg long enough for
 * both names, the two get the same scale.**
 */

import {getPaintFunction} from './registry';
import {airCorridorLabelPaint} from './corridorPaints';
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import type {PaintContext, PaintFeature, ProjectedGeometry} from '../core/paint';

const EARTH_RADIUS_M = 6378137;
const toMercator = ([lon, lat]: number[]): [number, number] => [
    (EARTH_RADIUS_M * lon * Math.PI) / 180,
    EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

function project(geometry: {type: string; coordinates?: unknown; geometries?: unknown[]}): ProjectedGeometry {
    if (geometry.type === 'GeometryCollection') {
        return {type: 'GeometryCollection', geometries: (geometry.geometries ?? []).map(g => project(g as never))} as unknown as ProjectedGeometry;
    }
    const walk = (c: unknown): unknown =>
        typeof (c as number[])[0] === 'number' ? toMercator(c as number[]) : (c as unknown[]).map(walk);
    return {type: geometry.type, coordinates: walk(geometry.coordinates)} as ProjectedGeometry;
}

/**
 * A measurer, because jsdom has no canvas and silently answers zero.
 *
 * The resolution is chosen so the corridor is large on screen — about 1000 px along its
 * run. At a world-scale resolution the *leg length* cap dominates and the height cap
 * under test never gets a say, which is a test that measures the wrong thing.
 */
const context: PaintContext = {
    resolution: 200,
    measureText: (text, font) => text.length * parseFloat(/([0-9.]+)px/.exec(font)?.[1] ?? '16') * 0.6,
};

/** The scale of the designation drawn along a leg, for a corridor of this width. */
function legLabelScale(designation: string, width: number): number {
    const properties = {name: TacticalGraphicName.AirCorridor, width, designation} as never;
    const rendered = renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: [[10, 40], [10.9, 40.35], [11.8, 40]]},
        properties: {tacticalGraphic: properties},
    } as never);

    const feature = {
        geometry: project(rendered.labels!.geometry as never),
        properties,
        graphicSize: width / 2,
    } as unknown as PaintFeature;

    const marks = getPaintFunction(TacticalGraphicName.AirCorridor)!.label!(feature, context);
    const leg = marks.find(m => m.text?.text?.startsWith('AC '));
    if (!leg) throw new Error('no leg designation was painted');
    return leg.text!.scale ?? 1;
}

/** Rails about 100 px apart at the resolution above — room for an upright label. */
const WIDE = 20_000;

beforeEach(() => resetTacticalGraphicsConfig());

describe("a corridor's leg designation", () => {
    it('is the same size whether the name is short or long', () => {
        const short = legLabelScale('BLUE', WIDE);
        const long = legLabelScale('CORRIDOR ONE', WIDE);
        expect(short).toBeGreaterThan(0.5);
        expect(long).toBeCloseTo(short, 5);
    });

    it('still shrinks when the corridor itself is too narrow to hold the text upright', () => {
        // The height bound is real — it just measures the height. A corridor a fraction as
        // wide leaves less room between its rails, and the label gives way.
        const wide = legLabelScale('BLUE', WIDE);
        const narrow = legLabelScale('BLUE', WIDE / 20);
        expect(narrow).toBeLessThan(wide);
    });

    it('holds the same cap for a long name on that narrow corridor', () => {
        // The bound is the corridor's, so both names hit it at the same value — which is
        // the whole point: what limits the label is the shape, not the typing.
        expect(legLabelScale('CORRIDOR ONE', WIDE / 20)).toBeCloseTo(legLabelScale('BLUE', WIDE / 20), 5);
    });
});

/**
 * # A corridor has one name, so it draws at one size
 *
 * Each leg used to be sized independently, because legs differ in length and a label must
 * not overrun the one it lies along. That drew a corridor's own name at as many sizes as
 * it had legs — measured in the Spearhead UI, one four-leg corridor rendered
 * `AC CORRIDOR BLUE` at 53, 78, 121 and 163 px at a single zoom.
 *
 * The rule now: one size, the largest any leg can carry, held to the corridor's width;
 * a leg that cannot hold the label at that size is skipped rather than given a shrunken
 * copy.
 */
describe('a corridor draws its designation at one size', () => {
    /** Turning points making legs of very different lengths, in EPSG:3857 metres. */
    const unevenLegs = [
        [0, 0],
        [600_000, 0],   // long
        [640_000, 0],   // stub
        [1_400_000, 0], // long
    ];

    const featureFor = (coords: number[][]) =>
        ({
            geometry: {type: 'MultiPoint', coordinates: coords},
            properties: {name: TacticalGraphicName.AirCorridor, designation: 'CORRIDOR BLUE', width: 120_000},
            graphicSize: 60_000,
        }) as unknown as PaintFeature;

    const designations = (coords: number[][]) =>
        airCorridorLabelPaint(TacticalGraphicName.AirCorridor)(featureFor(coords), context)
            .filter(p => p.text && /CORRIDOR BLUE/.test(p.text.text) && !p.text.text.includes('\n'))
            .map(p => +(p.text!.scale ?? 1).toFixed(4));

    it('gives every leg it labels the same size', () => {
        const scales = designations(unevenLegs);
        expect(scales.length).toBeGreaterThan(0);
        expect(new Set(scales).size).toBe(1);
    });

    it('skips the leg too short to hold it, rather than shrinking a copy onto it', () => {
        // Three legs, but the stub cannot carry the label at the corridor's size.
        expect(unevenLegs.length - 1).toBe(3);
        expect(designations(unevenLegs).length).toBeLessThan(3);
    });

    it('always draws at least one, however uneven the legs', () => {
        expect(designations(unevenLegs).length).toBeGreaterThanOrEqual(1);
        expect(designations([[0, 0], [20_000, 0], [1_400_000, 0]]).length).toBeGreaterThanOrEqual(1);
    });

    it('labels every leg when they are all long enough', () => {
        const even = [[0, 0], [700_000, 0], [1_400_000, 0]];
        expect(designations(even).length).toBe(2);
    });
});

/**
 * # The designation never runs into an ACP circle
 *
 * Every turning point carries an `ACP n` circle, and the designation is centred on the
 * leg between two of them. It was measured against the *whole* leg, so it grew straight
 * through the circles at either end — the closer together the circles, the more of the
 * name they covered. What is available is the clear run between them.
 */
describe('the designation keeps clear of the ACP circles', () => {
    /** Metres per pixel chosen so the numbers below are also the pixel counts. */
    const px = context.resolution;

    const corridorOf = (legPx: number, halfWidthM: number) =>
        ({
            geometry: {type: 'MultiPoint', coordinates: [[0, 0], [legPx * px, 0]]},
            properties: {name: TacticalGraphicName.AirCorridor, designation: 'CORRIDOR BLUE', width: halfWidthM * 2},
            graphicSize: halfWidthM,
        }) as unknown as PaintFeature;

    /** Half the label's drawn length, in pixels — how far it reaches from the midpoint. */
    const reachPx = (feature: PaintFeature) => {
        const paints = airCorridorLabelPaint(TacticalGraphicName.AirCorridor)(feature, context);
        const label = paints.find(p => p.text && /CORRIDOR BLUE/.test(p.text.text) && !p.text.text.includes('\n'));
        if (!label) return 0;
        const drawn = context.measureText(label.text!.text, label.text!.font) * (label.text!.scale ?? 1);
        return drawn / 2;
    };

    it.each([
        ['a wide corridor on a long leg', 600, 30_000],
        ['a wide corridor on a short leg', 150, 30_000],
        ['a narrow corridor on a long leg', 600, 4_000],
    ])('%s: the label stops short of the circle', (_name, legPx, halfWidthM) => {
        const feature = corridorOf(legPx, halfWidthM);
        // groundPixels at the equator, where these synthetic coordinates sit.
        const circlePx = halfWidthM / context.resolution;
        const clearHalf = legPx / 2 - circlePx;
        const reach = reachPx(feature);
        // Nothing drawn is also "not colliding" — the case the assertion below allows.
        if (reach > 0) expect(reach).toBeLessThanOrEqual(clearHalf);
    });

    it('draws nothing on a leg its circles already swallow', () => {
        // Circles of 150px radius either end of a 200px leg: they overlap at the midpoint.
        expect(reachPx(corridorOf(200, 150 * context.resolution))).toBe(0);
    });

    it('still draws the amplifier block when no leg can carry the name', () => {
        const paints = airCorridorLabelPaint(TacticalGraphicName.AirCorridor)(corridorOf(200, 150 * context.resolution), context);
        const block = paints.find(p => p.text?.text.includes('NAME:'));
        expect(block).toBeDefined();
        expect(block!.text!.scale).toBeGreaterThan(0);
    });
});

/**
 * # `WIDTH` alone is not a reason to draw the amplifier block
 *
 * The other five lines are things somebody typed. `width` is not: the holder mirrors the
 * corridor's drawn half-width into the amplifier on every rebuild, and typing a width
 * resizes the corridor to match — so the value can never disagree with the shape. A
 * freshly drawn corridor still got a block, reading `WIDTH: 391 km` back at the person
 * who had just dragged it.
 */
describe('the amplifier block on a corridor nobody has annotated', () => {
    const withProps = (extra: Record<string, unknown>) =>
        ({
            geometry: {type: 'MultiPoint', coordinates: [[0, 0], [600 * context.resolution, 0]]},
            properties: {name: TacticalGraphicName.AirCorridor, width: 60_000, ...extra},
            graphicSize: 30_000,
        }) as unknown as PaintFeature;

    const block = (feature: PaintFeature) =>
        airCorridorLabelPaint(TacticalGraphicName.AirCorridor)(feature, context).find(p => p.text?.text.includes(':'))?.text?.text;

    it('is not drawn when the width is all there is to say', () => {
        expect(block(withProps({}))).toBeUndefined();
    });

    it('appears as soon as something authored is set', () => {
        expect(block(withProps({designation: 'BLUE'}))).toContain('NAME:');
        expect(block(withProps({minAltitude: '1500'}))).toContain('MIN ALT:');
        expect(block(withProps({startDate: '011200ZJAN25'}))).toContain('DTG START:');
    });

    it('still prints the width once the block exists, under the name', () => {
        const lines = (block(withProps({designation: 'BLUE', maxAltitude: '20000'})) ?? '').split('\n');
        expect(lines[0]).toContain('NAME:');
        expect(lines[1]).toContain('WIDTH:');
        expect(lines[2]).toContain('MAX ALT:');
    });

    it('puts the width first when there is no name above it', () => {
        const lines = (block(withProps({maxAltitude: '20000'})) ?? '').split('\n');
        expect(lines[0]).toContain('WIDTH:');
        expect(lines[1]).toContain('MAX ALT:');
    });
});
