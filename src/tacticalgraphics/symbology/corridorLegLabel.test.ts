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
