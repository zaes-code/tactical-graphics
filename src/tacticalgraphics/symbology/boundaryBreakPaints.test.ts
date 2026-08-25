/**
 * # The artillery areas that break their own boundary
 *
 * APP-06 242400: *"The letters AMA in[terrupting the] symbol bound[ary] are to be
 * positioned at the four cardinal points of the boundary."* Nothing else in this library
 * cuts an outline at a bearing, so the ray-against-segment intersection is new code — and
 * it shipped wrong the first time, with the cross product for `u` negated. Every label
 * then landed in roughly the same place near the top, which looks like a rendering quirk
 * rather than a maths error unless you count them.
 *
 * These tests count them.
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {
    cardinalBoundaryPaint,
    cardinalLabelPaint,
    contourLineBoundaryPaint,
    contourLineLabelPaint,
    nestedZonePaint,
} from './boundaryBreakPaints';

const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

/** A regular hexagon about the origin, so all four rays leave through an edge. */
function hexagon(radius: number): ProjectedPosition[] {
    const ring: ProjectedPosition[] = [];
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        ring.push([radius * Math.cos(a), radius * Math.sin(a)]);
    }
    ring.push(ring[0]);
    return ring;
}

const RING = hexagon(200_000);

const areaFeature = (): PaintFeature => ({
    geometry: {type: 'Polygon', coordinates: [RING]},
    properties: {name: TacticalGraphicName.ArtilleryManeuverArea},
    ring: RING,
});

const labelFeature = (): PaintFeature => ({
    geometry: {type: 'Point', coordinates: [0, 0]},
    properties: {name: TacticalGraphicName.ArtilleryManeuverArea},
    ring: RING,
});

beforeEach(() => resetTacticalGraphicsConfig());

describe('the cardinal-label boundary', () => {
    it('removes four label-sized spans from the outline', () => {
        // Counting runs is the tempting assertion and the wrong one: the ring is emitted
        // as an open polyline, so an arc crossing its seam arrives as two runs and the
        // count is four *or* five depending on where the vertices fall. What is actually
        // specified is that four spans are gone, so measure the missing length.
        const [paint] = cardinalBoundaryPaint('AMA')(areaFeature(), context(400));
        const runs = (paint.geometry as {coordinates: ProjectedPosition[][]}).coordinates;
        const length = (path: ProjectedPosition[]) =>
            path.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);

        const perimeter = length(RING);
        const drawn = runs.reduce((t, run) => t + length(run), 0);
        const gap = (perimeter - drawn) / 4;

        expect(runs.length).toBeGreaterThanOrEqual(4);
        // Each gap is the text plus its padding, in projected meters at this resolution.
        expect(gap).toBeGreaterThan(1_000);
        expect(gap).toBeLessThan(perimeter / 8);
    });

    it('puts one label at each cardinal point, not four in one place', () => {
        // The assertion the negated cross product failed: it produced fewer distinct
        // positions, all clustered, while still returning labels.
        const paints = cardinalLabelPaint('AMA', () => [])(labelFeature(), context(400));
        expect(paints).toHaveLength(4);

        const spots = paints.map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
        expect(spots.filter(([x, y]) => y > Math.abs(x))).toHaveLength(1);   // north
        expect(spots.filter(([x, y]) => x > Math.abs(y))).toHaveLength(1);   // east
        expect(spots.filter(([x, y]) => y < -Math.abs(x))).toHaveLength(1);  // south
        expect(spots.filter(([x, y]) => x < -Math.abs(y))).toHaveLength(1);  // west
    });

    it('lands every label on the boundary rather than inside it', () => {
        const paints = cardinalLabelPaint('AMA', () => [])(labelFeature(), context(400));
        for (const p of paints) {
            const [x, y] = (p.geometry as {coordinates: ProjectedPosition}).coordinates;
            // A hexagon's inradius is r*cos(30); anything much inside that is not on the ring.
            expect(Math.hypot(x, y)).toBeGreaterThan(200_000 * Math.cos(Math.PI / 6) * 0.95);
        }
    });

    it('draws the labels upright, as the plate does', () => {
        // Laying them along the edge reads bottom-to-top on a vertical side, which no
        // other label here does and the standard's own example does not show.
        const paints = cardinalLabelPaint('AMA', () => [])(labelFeature(), context(400));
        for (const p of paints) expect(p.text?.rotation ?? 0).toBe(0);
    });

    it('sizes each break from the text that fills it', () => {
        const short = cardinalBoundaryPaint('X')(areaFeature(), context(400));
        const long = cardinalBoundaryPaint('LONGER LABEL')(areaFeature(), context(400));
        const spanOf = (paint: typeof short[0]) =>
            (paint.geometry as {coordinates: ProjectedPosition[][]}).coordinates
                .reduce((total, run) => total + run.length, 0);
        // A wider label eats more of the ring, so fewer sampled points survive.
        expect(spanOf(long[0])).toBeLessThan(spanOf(short[0]));
    });
});

describe('APP-06 272200 — the radiation dose rate contour line', () => {
    const doseFeature = (label?: string): PaintFeature => ({
        geometry: {type: 'Polygon', coordinates: [RING]},
        properties: {name: TacticalGraphicName.RadiationDoseRateContourLine, label},
        ring: RING,
    });

    it('breaks the outline once, at the top', () => {
        const [paint] = contourLineBoundaryPaint()(doseFeature('30 CGH'), context(400));
        const runs = (paint.geometry as {coordinates: ProjectedPosition[][]}).coordinates;
        // One break in a closed ring leaves one or two runs, depending on whether it
        // straddles the seam. @see the note on counting runs above.
        expect(runs.length).toBeLessThanOrEqual(2);

        const spot = (contourLineLabelPaint(() => [])(doseFeature('30 CGH'), context(400))[0]
            .geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(spot[1]).toBeGreaterThan(Math.abs(spot[0]));
    });

    it('leaves the ring whole when no dose has been entered', () => {
        // An empty notch reads as a rendering fault; an unbroken contour reads as a
        // contour whose dose has not been filled in yet, which is what it is.
        const [paint] = contourLineBoundaryPaint()(doseFeature(), context(400));
        expect(paint.geometry.type).toBe('LineString');
        expect(contourLineLabelPaint(() => [])(doseFeature(), context(400))).toEqual([]);
    });

    it('sets the text the operator typed, not a fixed abbreviation', () => {
        const paints = contourLineLabelPaint(() => [])(doseFeature('300 CGH'), context(400));
        expect(paints.map(p => p.text?.text)).toEqual(['300 CGH']);
    });
});

describe('APP-06 272100 / 272101 — the minimum safe distance zones', () => {
    /** Two nested rings, inner first, as both generators hand them over. */
    const nested = (): PaintFeature => ({
        geometry: {
            type: 'MultiLineString',
            coordinates: [hexagon(120_000), hexagon(220_000)],
        },
        properties: {name: TacticalGraphicName.MinimumSafeDistanceZone},
    });

    it('numbers the inner ring 1 and the outer ring 2', () => {
        const paints = nestedZonePaint()(nested(), context(400));
        const labels = paints.filter(p => p.text);
        expect(labels.map(p => p.text!.text)).toEqual(['1', '2']);

        // The 2 sits further out than the 1 — the order of the rings is the whole
        // meaning of the numbers, and a swapped pair says the opposite thing.
        const at = labels.map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
        expect(Math.hypot(...at[1])).toBeGreaterThan(Math.hypot(...at[0]));
    });

    it('breaks both rings on the same side, so the numbers read outward as a pair', () => {
        const paints = nestedZonePaint()(nested(), context(400));
        const at = paints.filter(p => p.text)
            .map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
        for (const [x, y] of at) expect(x).toBeGreaterThan(Math.abs(y));
    });
});
