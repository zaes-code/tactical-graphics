/**
 * # Which graphics a `width` actually changes, measured rather than listed
 *
 * `shapedByWidth` names four families — the corridors, the two-anchor-point rectangles, the
 * five plates that give a length and a width to one anchor point, and the multiple-strike
 * safe distance zone. A hand-kept list of 34 names out of 318 goes stale the first time a
 * generator starts or stops reading `opts.radius`, and nothing would say so: a width that
 * stops being read is invisible, and a width that starts being read is a symbol drawn at
 * the wrong size on whichever renderer declined to file one.
 *
 * So the set is **derived here**. Every registered graphic is rendered twice from the same
 * base, once with a width and once without, and the two are compared as geometry. What
 * comes back is the ground truth the predicate has to agree with, in both directions.
 *
 * Rendering, not reading the generators: `toGraphicOptions` maps the public `width` onto the
 * generators' `radius`, and whether a given generator reads that slot is a fact about its
 * body rather than about any table. @see shapedByWidth, toGraphicOptions
 */

import type {Feature as GeoJSONFeature, Position} from 'geojson';
import {baseGeometryFor, listTacticalGraphicNames, renderTacticalGraphic, toFeatureCollection} from './render';
import {baseVertexCount, shapedByWidth} from './handles';
import {normalizeDrawnBase, synthesizedBase} from './drawnBase';
import {TacticalGraphicName} from './type';

/** Somewhere with a real `1 / cos(latitude)`, and a cell about 90 km across. */
const CENTRE: Position = [12, 41];
const HALF = 0.4;
const RES = 1200;

/** Two widths far enough apart that a graphic reading either one cannot land on the same ink. */
const NARROW = 30_000;
const WIDE = 90_000;

/**
 * A base of the kind this graphic is drawn from, settled the way a draw settles one.
 *
 * The same fixture `engineRoundTrip.test.ts` builds, and for the same reason: a hand-made
 * base the library does not agree with tests a state no draw produces.
 */
function baseFor(name: TacticalGraphicName): GeoJSONFeature['geometry'] | undefined {
    const kind = baseGeometryFor(name);
    const [cx, cy] = CENTRE;
    if (kind === 'Point') return {type: 'Point', coordinates: [cx, cy]};
    if (kind === 'Polygon') {
        const ring: Position[] = [
            [cx - HALF, cy - HALF * 0.7],
            [cx + HALF, cy - HALF * 0.7],
            [cx + HALF, cy + HALF * 0.7],
            [cx - HALF, cy + HALF * 0.7],
        ];
        return {type: 'Polygon', coordinates: [[...ring, ring[0]]]};
    }
    if (kind !== 'LineString') return undefined;

    const want = baseVertexCount(name) ?? 3;
    const stated = synthesizedBase(name, CENTRE, HALF, want);
    const run: Position[] = stated ?? (want === 2
        ? [[cx - HALF, cy], [cx + HALF, cy]]
        : Array.from({length: want}, (_, index) => {
            const along = want === 1 ? 0.5 : index / (want - 1);
            return [cx - HALF + 2 * HALF * along, cy + HALF * 0.25 * Math.sin(Math.PI * along)] as Position;
        }));
    return {type: 'LineString', coordinates: normalizeDrawnBase(name, run, RES) as Position[]};
}

/**
 * Everything the render draws, as geometry alone.
 *
 * **The properties are deliberately dropped.** `renderTacticalGraphic` stamps the whole bag
 * onto every feature it returns, so a comparison that kept them would find the `width`
 * itself and report all 318 graphics as reading one — which is exactly what the first run of
 * this comparison did.
 */
function ink(name: TacticalGraphicName, properties: Record<string, unknown>): string {
    const geometry = baseFor(name);
    if (!geometry) return 'no base';
    try {
        const rendered = renderTacticalGraphic({
            type: 'Feature',
            geometry,
            properties: {tacticalGraphic: {name, ...properties}},
        } as GeoJSONFeature);
        return JSON.stringify(toFeatureCollection(rendered).features.map(feature => feature.geometry));
    } catch (error) {
        /*
         * **A refusal is an answer, and comparing two of them is the point.** Several
         * generators need a `radius` and fail without one — turf rejects the NaN a missing
         * size produces — so the bare half of the comparison below throws for them whether a
         * width was supplied or not. The message is the reading; two identical refusals mean
         * the width changed nothing, which is exactly what is being asked.
         */
        return `refused: ${(error as Error).message}`;
    }
}

/**
 * Whether a width changes this graphic's ink, from both ends.
 *
 * Two widths and no width at all, because both halves have been a real answer: a generator
 * may read the field only when it was given one, and another may fall back to a default that
 * happens to equal one of the figures tried.
 */
function widthChangesTheInk(name: TacticalGraphicName): boolean {
    const sized = {radius: 40_000, rotation: 0};
    const bare = {rotation: 0};
    return ink(name, {...sized, width: NARROW}) !== ink(name, {...sized, width: WIDE})
        || ink(name, {...sized, width: NARROW}) !== ink(name, sized)
        || ink(name, {...bare, width: NARROW}) !== ink(name, {...bare, width: WIDE})
        || ink(name, {...bare, width: NARROW}) !== ink(name, bare);
}

const NAMES = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(name => baseFor(name) !== undefined);

describe(`shapedByWidth against what the generators actually read (${NAMES.length} names)`, () => {
    it('has the whole registry to check', () => {
        expect(NAMES.length).toBe(listTacticalGraphicNames().length);
    });

    it.each(NAMES.map(name => [String(name), name] as const))('%s', (_label, name) => {
        expect(shapedByWidth(name)).toBe(widthChangesTheInk(name));
    });

    /**
     * The count, so a family joining or leaving is a decision somebody makes rather than a
     * number that drifts. Thirty-four on 2026-09-11: eight corridors, twenty rectangles, the
     * five length-and-width plates and the multiple-strike zone.
     */
    it('is 34 graphics, and the rest are untouched by the field', () => {
        const reads = NAMES.filter(shapedByWidth);
        expect(reads).toHaveLength(34);
        expect(NAMES.length - reads.length).toBe(284);
    });

    /**
     * **The eleven axis arrows are not in it**, and that is the point of the last release's
     * work: their width is the base's last coordinate, so an amplifier beside it would be a
     * second copy of the same number. @see carriesWidthPointInBase
     */
    it.each([
        TacticalGraphicName.MainAxisOfAdvance,
        TacticalGraphicName.AvenueOfApproach,
        TacticalGraphicName.Counterattack,
        TacticalGraphicName.CounterattackByFire,
    ])('leaves %s out, because its width is a coordinate', name => {
        expect(shapedByWidth(name)).toBe(false);
    });

    /** And the families that are in it, named so the reason survives the list. */
    it.each([
        [TacticalGraphicName.AirCorridor, 'rails standing off the centre line'],
        [TacticalGraphicName.FreeFireAreaRectangular, 'a two-anchor-point rectangle'],
        [TacticalGraphicName.LaunchAreaEllipse, 'a length and a width about one point'],
        [TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 'the standoff between two rings'],
    ])('keeps %s — %s', name => {
        expect(shapedByWidth(name as TacticalGraphicName)).toBe(true);
    });
});
