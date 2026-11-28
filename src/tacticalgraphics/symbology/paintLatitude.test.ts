/**
 * # A stored metre is a ground metre, and a resolution is not
 *
 * The portable description states **real** distances — a radius, a corridor's half-width —
 * while a map resolution is *projected* metres per pixel, and Web Mercator inflates those
 * by `1 / cos(latitude)`. Dividing one by the other gives the on-screen size only on the
 * equator; everywhere else it under-reports, by 1.6x at 50 degrees and 5.8x at 80.
 *
 * `mercator.ts` already states this for the generators, which convert the other way when a
 * symbol is drawn — a corridor dragged out at 60 degrees was 79 px wide instead of 40 until
 * they did. The paints had the same defect on the way back out, and it was invisible for
 * the same reason it always is: **every test and every demo screenshot was taken near the
 * equator.** It surfaced on a real plan over the Arctic, where a corridor 40 px wide
 * measured as 7 and its designation was shrunk to fit the 7.
 *
 * So these draw the same graphic at four latitudes and assert the on-screen size does not
 * move. The equator case is the control: it is the one that passed before.
 */

import {getPaintFunction} from './registry';
import {groundPixels, featureLatitude} from './paintFunctions';
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {mercatorScale} from '../core/mercator';
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

const context: PaintContext = {
    resolution: 200,
    measureText: (text, font) => text.length * parseFloat(/([0-9.]+)px/.exec(font)?.[1] ?? '16') * 0.6,
};

/**
 * A corridor drawn at `latitude` the way the app draws one: a fixed number of **screen
 * pixels** wide, converted to ground metres where it sits. So every one of these is the
 * same size on screen, which is the property under test.
 */
function corridorAt(latitude: number, designation: string) {
    const widthPx = 40;
    const width = (widthPx * context.resolution) / mercatorScale(latitude);
    const properties = {name: TacticalGraphicName.AirCorridor, width, designation} as never;
    const rendered = renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: [[10, latitude], [10.9, latitude + 0.2], [11.8, latitude]]},
        properties: {tacticalGraphic: properties},
    } as never);
    return {
        geometry: project(rendered.labels!.geometry as never),
        properties,
        graphicSize: width / 2,
    } as unknown as PaintFeature;
}

const legScale = (feature: PaintFeature): number => {
    const marks = getPaintFunction(TacticalGraphicName.AirCorridor)!.label!(feature, context);
    const leg = marks.find(m => m.text?.text?.startsWith('AC '));
    if (!leg) throw new Error('no leg designation painted');
    return leg.text!.scale ?? 1;
};

beforeEach(() => resetTacticalGraphicsConfig());

describe('groundPixels', () => {
    it('is metres over resolution on the equator, and only there', () => {
        const equator = corridorAt(0, 'BLUE');
        expect(groundPixels(20_000, equator, context)).toBeCloseTo(100, 5);
    });

    it('grows by the Mercator scale factor away from it', () => {
        const north = corridorAt(60, 'BLUE');
        expect(featureLatitude(north)).toBeCloseTo(60, 0);
        // 1/cos(60) = 2, so the same ground distance covers twice the pixels.
        expect(groundPixels(20_000, north, context)).toBeCloseTo(200, 0);
    });
});

describe('a corridor drawn the same size on screen', () => {
    it('labels its legs identically at every latitude', () => {
        const scales = [0, 35, 60, 80].map(lat => legScale(corridorAt(lat, 'CORRIDOR ONE')));
        // The control is the equator, which is what the old code happened to get right.
        for (const scale of scales) expect(scale).toBeCloseTo(scales[0], 4);
        expect(scales[0]).toBeGreaterThan(0.5);
    });

    it('holds for the Arctic case that surfaced it', () => {
        // The reported plan sat near 80 degrees north, where the scale factor is 5.8.
        expect(legScale(corridorAt(80, 'CORRIDOR ONE'))).toBeCloseTo(legScale(corridorAt(0, 'CORRIDOR ONE')), 4);
    });
});
