/**
 * # Capture, evacuate and recover, against their shared draw rule
 *
 * Four anchor points, each meaning something specific, and three of the four meanings are
 * easy to satisfy *approximately* — the shape still looks like the plate when the circle is
 * the wrong size or the arc misses its through-point by half. Only the rule says which is
 * right. @see SweptArcTask.ts, sweptArcTaskPaints.ts
 */

import type {Feature, MultiLineString, Position} from 'geojson';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {sweptArcTaskPaint} from './sweptArcTaskPaints';

const context = (resolution = 400): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

/** Centre, a point on the circle, the arc's middle, the arrow's end. */
const POINTS: Position[] = [[-77.0, 38.9], [-76.7, 38.9], [-76.0, 38.7], [-75.6, 38.1]];

const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

/** Straight-line distance in the *projected* frame, for comparing against paint output. */
const planar = (a: ProjectedPosition, b: ProjectedPosition) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const built = (name: TacticalGraphicName, coordinates: Position[] = POINTS): MultiLineString =>
    renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name}},
        geometry: {type: 'LineString', coordinates},
    } as Feature).graphic.geometry as MultiLineString;

/**
 * Web Mercator, because the paint layer is handed projected meters and its arrowhead is a
 * *screen* size — feeding it degrees makes the whole arc a millimetre long, the mark falls
 * under the visibility floor, and nothing is drawn at all. That failure looks exactly like
 * a missing arrowhead, so it is worth stating why this is here.
 */
const HALF_WORLD = 20037508.34;
const project = ([lon, lat]: Position): ProjectedPosition => [
    (lon * HALF_WORLD) / 180,
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * HALF_WORLD) / Math.PI,
];

/** The paint layer over the built geometry, projected the way a renderer would hand it over. */
const painted = (letter: string, geometry: MultiLineString): Paint[] =>
    sweptArcTaskPaint(letter)({
        geometry: {
            type: 'MultiLineString',
            coordinates: geometry.coordinates.map(part => part.map(project)),
        },
        properties: {name: TacticalGraphicName.Capture},
    } as PaintFeature, context());

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 343000 / 344500 / 344600 — the swept-arc tasks', () => {
    // "Point 1 defines the centre of the circle. Point 2 defines the radius of the circle."
    it('takes the circle radius from point 2 rather than a constant', () => {
        const [ring] = built(TacticalGraphicName.Capture).coordinates;
        const radius = meters(POINTS[0], POINTS[1]);
        for (const p of ring) expect(meters(POINTS[0], p) / radius).toBeCloseTo(1, 2);

        // A larger point 2 really does make a larger circle — the assertion above would
        // pass on a fixed circle drawn at exactly this radius by coincidence.
        const wider: Position[] = [POINTS[0], [-76.4, 38.9], POINTS[2], POINTS[3]];
        const [wideRing] = built(TacticalGraphicName.Capture, wider).coordinates;
        expect(meters(POINTS[0], wideRing[0])).toBeGreaterThan(meters(POINTS[0], ring[0]) * 1.8);
    });

    // "Point 3 defines the middle of the arc and is used to control the curvature."
    it('runs the arc through point 3, not merely toward it', () => {
        const arc = built(TacticalGraphicName.Capture).coordinates[1];
        const nearest = Math.min(...arc.map(p => meters(p, POINTS[2])));
        const span = meters(arc[0], arc[arc.length - 1]);

        // A quadratic Bezier does NOT pass through its control point — it reaches only
        // (start + 2C + end)/4. Handing it point 3 directly leaves the arc about half as
        // far off the chord as asked, which is what this pins.
        expect(nearest / span).toBeLessThan(0.02);
    });

    it('starts the arc on the circle, so the arrow does not begin inside the unit symbol', () => {
        const {coordinates} = built(TacticalGraphicName.Capture);
        const radius = meters(POINTS[0], POINTS[1]);
        expect(meters(coordinates[1][0], POINTS[0]) / radius).toBeCloseTo(1, 2);
    });

    // "Point 4 defines the end of the arrow."
    it('ends the arc on point 4', () => {
        const arc = built(TacticalGraphicName.Capture).coordinates[1];
        expect(meters(arc[arc.length - 1], POINTS[3])).toBeLessThan(1);
    });

    it('draws bare vertices until all four points are placed', () => {
        // Half a symbol is worse than none: the arc cannot be solved without its
        // through-point, and a guessed one lurches when the fourth click lands.
        const partial = built(TacticalGraphicName.Capture, POINTS.slice(0, 3));
        expect(partial.coordinates).toHaveLength(1);
        expect(partial.coordinates[0]).toHaveLength(3);
    });

    it('ends the sweep in a pair of open barbs, not a filled triangle', () => {
        const geometry = built(TacticalGraphicName.Evacuate);
        const paints = painted('E', geometry);

        const texts = paints.filter(p => p.text).map(p => p.text!.text);
        expect(texts).toEqual(['E']);

        // **All six plates draw an open V** — three Templates and three Examples. What is
        // solid on them is the annotation's own leader arrows, the ones labelled PT.3 and
        // PT.4, which point at the symbol from outside it; this used to draw a filled
        // triangle on the strength of those.
        expect(paints.find(p => p.geometry.type === 'Polygon')).toBeUndefined();

        const barbs = paints.filter(p => p.geometry.type === 'MultiLineString' && !p.fill).slice(-1)[0];
        const runs = (barbs.geometry as {coordinates: ProjectedPosition[][]}).coordinates;
        expect(runs).toHaveLength(2);
        // Both barbs spring from the arc's own last point. **Compared in the projected
        // frame**: the paint is handed projected metres and `geometry` is still degrees, so
        // measuring one against the other reports a quarter of the earth.
        const tip = project(geometry.coordinates[1].slice(-1)[0]);
        for (const run of runs) expect(planar(run[0], tip)).toBeLessThan(1);
    });

    it('breaks the arc for the letter rather than setting it alongside', () => {
        const geometry = built(TacticalGraphicName.Evacuate);
        const paints = painted('E', geometry);

        // The line work is the circle plus **two** arc runs, with the letter in the hole.
        const line = paints[0].geometry as {coordinates: ProjectedPosition[][]};
        expect(line.coordinates).toHaveLength(3);

        const letter = paints.find(p => p.text)!;
        const at = (letter.geometry as {coordinates: ProjectedPosition}).coordinates;
        const arc = geometry.coordinates[1].map(project);
        // On the arc, not offset to one side of it.
        expect(Math.min(...arc.map(p => planar(p, at)))).toBeLessThan(1);
    });

    it('is the letter alone that tells the three apart', () => {
        const geometry = built(TacticalGraphicName.Capture);
        const strokesOf = (letter: string) =>
            painted(letter, geometry).filter(p => !p.text).length;
        expect(strokesOf('C')).toBe(strokesOf('R'));
        expect(painted('C', geometry).find(p => p.text)!.text!.text).toBe('C');
        expect(painted('R', geometry).find(p => p.text)!.text!.text).toBe('R');
    });
});
