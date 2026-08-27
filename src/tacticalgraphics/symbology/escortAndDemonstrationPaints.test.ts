/**
 * # Escort and demonstration
 *
 * Two tasks whose shape is easy to get *nearly* right and whose draw rules say which way
 * round the near-misses go: a bracket whose legs could face either way, and a U that
 * becomes an S if the turn bulges toward the arrowheads instead of away from them.
 */

import type {Feature, MultiLineString, Position} from 'geojson';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import * as turf from '../core/turf';
import {baseGeometryFor, renderTacticalGraphic} from '../core/render';
import {allowedGestures, dropSizePx, hasDerivedAnchors} from '../core/symbology';
import {baseVertexCount, usesDrawnAnchors} from '../core/handles';
import {anchorsForParallelLegs} from '../core/anchors';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {demonstrationPaint, escortPaint} from './escortAndDemonstrationPaints';

const context = (resolution = 400): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

const HALF_WORLD = 20037508.34;
const project = ([lon, lat]: Position): ProjectedPosition => [
    (lon * HALF_WORLD) / 180,
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * HALF_WORLD) / Math.PI,
];

const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

/** Straight-line distance between two *projected* points. */
const len = (a: ProjectedPosition, b: ProjectedPosition) => Math.hypot(b[0] - a[0], b[1] - a[1]);

const built = (name: TacticalGraphicName, coordinates: Position[]) =>
    renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name}},
        geometry: {type: 'LineString', coordinates},
    } as Feature).graphic.geometry;

const lines = (paints: Paint[]): ProjectedPosition[][] =>
    paints.flatMap(p => {
        if (p.geometry.type === 'LineString') return [p.geometry.coordinates];
        if (p.geometry.type === 'MultiLineString') return p.geometry.coordinates;
        return [];
    });

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 343600 — escort', () => {
    // "Point 1 defines the centre of the graphic. Point 2 and Point 3 defines the length
    //  of the escort."
    const POINTS: Position[] = [[-76.5, 38.9], [-77.0, 38.9], [-76.0, 38.9]];

    it('spans points 2 and 3, ignoring the centre for the bar itself', () => {
        const geometry = built(TacticalGraphicName.Escort, POINTS) as {coordinates: Position[]};
        expect(geometry.coordinates).toHaveLength(2);
        expect(meters(geometry.coordinates[0], POINTS[1])).toBeLessThan(1);
        expect(meters(geometry.coordinates[1], POINTS[2])).toBeLessThan(1);
    });

    it('breaks the bar for the amplifiers and sets an E against each side', () => {
        const feature: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [POINTS[1], POINTS[2]].map(project)},
            properties: {name: TacticalGraphicName.Escort},
        };
        const paints = escortPaint('E')(feature, context());
        expect(paints.filter(p => p.text).map(p => p.text!.text)).toEqual(['E', 'E']);

        const runs = lines(paints);
        // Two bar runs plus two legs — the gap between the runs is what the host's unit
        // symbol goes into, and nothing here draws one.
        expect(runs).toHaveLength(4);
        expect(runs[0][1][0]).toBeLessThan(runs[1][0][0]);
    });

    // "The escort symbol appears above the convoy or escorted unit symbol."
    it('turns both legs to the same side, below a bar drawn left to right', () => {
        const feature: PaintFeature = {
            geometry: {type: 'LineString', coordinates: [POINTS[1], POINTS[2]].map(project)},
            properties: {name: TacticalGraphicName.Escort},
        };
        const [, legStart, legEnd] = lines(escortPaint('E')(feature, context())).slice(1);
        expect(legStart[1][1]).toBeLessThan(legStart[0][1]);
        expect(legEnd[1][1]).toBeLessThan(legEnd[0][1]);
    });
});

describe('APP-06 343300 — demonstration', () => {
    // "This symbol requires four anchor points. Point 1 defines the tip of the arrowhead.
    //  Point 2 defines the end of the straight line portion of the first arrow. Points 3
    //  and 4 define the length of the second straight line. Points 2 and 3 shall be
    //  connected by a smooth, curved line."
    //
    // The base carries all four, and three of them are derived from the first: the shape
    // has one set of proportions, and letting an operator vary them only ever produced
    // worse drawings. @see anchorsForParallelLegs
    const ANCHOR: Position = [-77.0, 38.7];
    const SIZE = 100_000;

    const drop = (rotation = 0, coordinates?: Position[]) =>
        renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: TacticalGraphicName.Demonstration}},
            geometry: {
                type: 'LineString',
                coordinates: coordinates ?? anchorsForParallelLegs(ANCHOR, SIZE, rotation),
            },
        } as Feature);

    const graphicOf = (rotation = 0) => drop(rotation).graphic.geometry as MultiLineString;

    it('draws two straight legs joined by a turn', () => {
        const parts = graphicOf().coordinates;
        expect(parts).toHaveLength(3);
        expect(parts[0]).toHaveLength(2);
        expect(parts[2]).toHaveLength(2);
        expect(parts[1].length).toBeGreaterThan(3);
    });

    it('carries four anchor points, and the base is where they live', () => {
        expect(baseGeometryFor(TacticalGraphicName.Demonstration)).toBe('LineString');
        expect(usesDrawnAnchors(TacticalGraphicName.Demonstration)).toBe(true);
        expect(anchorsForParallelLegs(ANCHOR, SIZE, 0)).toHaveLength(4);
    });

    it('takes point 1 from the click and derives the other three', () => {
        const parts = graphicOf().coordinates;
        // Point 1 is the tip, and the tip is where the user clicked — this symbol grows
        // away from the anchor rather than around it, which is the standard's numbering.
        expect(meters(parts[0][0], ANCHOR)).toBeLessThan(1);
        // Equal legs, one `size` each.
        expect(meters(parts[0][0], parts[0][1])).toBeCloseTo(SIZE, -1);
        expect(meters(parts[2][0], parts[2][1])).toBeCloseTo(SIZE, -1);
        // …and an opening fixed against them, which is the ratio nobody gets to edit.
        expect(meters(parts[0][1], parts[2][0]) / SIZE).toBeCloseTo(0.7, 2);
    });

    it('recomputes points 3 and 4 rather than reading them', () => {
        // A base written while the four were placed freehand — legs splayed, opening
        // wrong — resolves to the canonical shape rather than to what it had drifted
        // into. This is what "auto-calculated" has to mean if it is to mean anything.
        const drifted: Position[] = [[-77.0, 38.7], [-76.0, 38.7], [-75.4, 39.6], [-77.6, 39.2]];
        const parts = (drop(0, drifted).graphic.geometry as MultiLineString).coordinates;
        const leg1 = meters(parts[0][0], parts[0][1]);
        expect(meters(parts[2][0], parts[2][1])).toBeCloseTo(leg1, -1);
        expect(meters(parts[0][1], parts[2][0]) / leg1).toBeCloseTo(0.7, 2);
        // Points 1 and 2 are the ones that *are* read, so they are untouched.
        expect(meters(parts[0][0], drifted[0])).toBeLessThan(1);
        expect(meters(parts[0][1], drifted[1])).toBeLessThan(1);
    });

    it('holds the two legs parallel and opposed at every rotation', () => {
        for (const rotation of [0, 37, 90, 214, 355]) {
            const parts = graphicOf(rotation).coordinates;
            const out = turf.bearing(turf.point(parts[0][0]), turf.point(parts[0][1]));
            const back = turf.bearing(turf.point(parts[2][0]), turf.point(parts[2][1]));
            expect(Math.abs(((out - back + 360) % 360) - 180)).toBeLessThan(1);
        }
    });

    it('bulges the turn away from the arrowheads, at every rotation', () => {
        // A turn on the wrong side folds back between the legs and the U reads as a
        // flattened Z. Derived points fix the handedness, so this is a guard on the
        // construction rather than on a drawing order that no longer exists.
        for (const rotation of [0, 37, 90, 214, 355]) {
            const parts = graphicOf(rotation).coordinates;
            const [tip1, bend1] = parts[0];
            const bend2 = parts[2][0];
            const apex = parts[1][Math.floor(parts[1].length / 2)];
            // Along the leg's own axis: the apex is past the bends, the tips are behind.
            const axis = turf.bearing(turf.point(tip1), turf.point(bend1));
            const along = (p: Position) =>
                meters(tip1, p) * Math.cos(((turf.bearing(turf.point(tip1), turf.point(p)) - axis) * Math.PI) / 180);
            expect(along(apex)).toBeGreaterThan(Math.max(along(bend1), along(bend2)));
        }
    });

    it('puts the edge handle on point 2 and the move handle on the anchor', () => {
        // `[edge, centre]` — the point-anchored contract. The edge is the far end of the
        // first leg, which is the one anchor point a resize has any reason to grab.
        const rendered = drop();
        const parts = (rendered.graphic.geometry as MultiLineString).coordinates;
        const handles = (rendered.handles.geometry as {coordinates: Position[]}).coordinates;
        expect(handles).toHaveLength(2);
        expect(meters(handles[0], parts[0][1])).toBeLessThan(1);
        expect(meters(handles[1], ANCHOR)).toBeLessThan(1);
    });

    it('is dropped, not drawn — one click, and it turns and resizes afterwards', () => {
        expect(dropSizePx(TacticalGraphicName.Demonstration)).toBeGreaterThan(0);
        // A four-point base normally means four things to drag. Not this one: the other
        // three follow from the first, so the whole symbol moves, turns and scales
        // together and there is no vertex to modify. @see hasDerivedAnchors
        expect(hasDerivedAnchors(TacticalGraphicName.Demonstration)).toBe(true);
        expect(allowedGestures(TacticalGraphicName.Demonstration)).toEqual({
            translate: true,
            rotate: true,
            resize: true,
            modify: false,
        });
        // …and the draw still ends on the first click, which is a rule about clicks and
        // not about how many points the base ends up holding.
        expect(baseVertexCount(TacticalGraphicName.Demonstration)).toBeUndefined();
    });

    it('holds DEM inside the leg it is set in, at every zoom', () => {
        // The text sits in a break in the leg, so a scale that only tracks the zoom put a
        // 65 px `DEM` across an 80 px leg in the sample sweep. The cap is against the
        // shape, which is the same rule the repeating decorations follow.
        const parts = graphicOf().coordinates.map(part => part.map(project));
        for (const resolution of [80, 400, 2000, 9000]) {
            for (const label of ['1', 'ALPHA BRAVO CHARLIE']) {
                const feature: PaintFeature = {
                    geometry: {type: 'MultiLineString', coordinates: parts},
                    properties: {name: TacticalGraphicName.Demonstration, label},
                };
                const ctx = context(resolution);
                const mark = demonstrationPaint('DEM')(feature, ctx).find(p => p.text)!;
                const legPx = len(parts[0][0], parts[0][1]) / resolution;
                const widthPx = ctx.measureText(mark.text!.text, mark.text!.font) * mark.text!.scale!;
                expect(widthPx).toBeLessThanOrEqual(legPx * 0.56);
            }
        }
    });

    it('opens one end and labels the first leg', () => {
        const geometry = graphicOf();
        const feature: PaintFeature = {
            geometry: {
                type: 'MultiLineString',
                coordinates: geometry.coordinates.map(part => part.map(project)),
            },
            properties: {name: TacticalGraphicName.Demonstration, label: '1'},
        };
        const paints = demonstrationPaint('DEM')(feature, context());
        expect(paints.filter(p => p.text).map(p => p.text!.text)).toEqual(['DEM 1']);

        // Two barbs — one open head, at point 1 — and open, not filled.
        const barbs = paints.find(p =>
            p.geometry.type === 'MultiLineString' && p.geometry.coordinates.length === 2);
        expect(barbs).toBeDefined();
        expect(paints.some(p => p.fill)).toBe(false);
    });
});
