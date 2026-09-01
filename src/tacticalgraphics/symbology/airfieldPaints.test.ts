/**
 * # The airfield is a point, the airfield zone is an area
 *
 * They rendered identically until 2026-08-17 — the same crossed runways fitted inside the
 * same drawn boundary — which meant two graphics with one appearance and a name in a menu
 * to tell them apart. APP-06 draws them differently on purpose: 131900 is one anchor point
 * and "Size/Shape. Static", 120400 is at least three anchor points and a traced boundary.
 *
 * "Static" was then read as "the size is not the operator's", which pinned the airfield to a
 * constant screen size — so it stayed the same size at every zoom and marked a point on the
 * display rather than an extent on the ground. The phrase describes how a symbol responds to
 * its *anchor points*, and this one has a single anchor to respond to. It carries a size in
 * metres, the operator drags it, and it scales with the map.
 */

import type {Feature, MultiLineString, Position} from 'geojson';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import * as turf from '../core/turf';
import {baseGeometryFor, renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {airfieldPointLabelPaint, airfieldPointPaint} from './airfieldPaints';

const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

const CENTER: Position = [-77.0, 38.9];
const SIZE = 40_000;

const built = (): MultiLineString =>
    renderTacticalGraphic({
        type: 'Feature',
        properties: {tacticalGraphic: {name: TacticalGraphicName.Airfield, radius: SIZE, rotation: 0}},
        geometry: {type: 'Point', coordinates: CENTER},
    } as Feature).graphic.geometry as MultiLineString;

/** The built arms, projected the way a renderer hands them over. */
const HALF_WORLD = 20037508.34;
const project = ([lon, lat]: Position): ProjectedPosition => [
    (lon * HALF_WORLD) / 180,
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * HALF_WORLD) / Math.PI,
];

const painted = (resolution: number): Paint[] => {
    const arms = built().coordinates.map(arm => arm.map(project));
    const center = project(CENTER);
    return airfieldPointPaint()({
        geometry: {type: 'MultiLineString', coordinates: arms},
        properties: {name: TacticalGraphicName.Airfield},
        graphicSize: SIZE,
        graphicCenter: center,
    } as PaintFeature, context(resolution));
};

const armWidthPx = (paints: Paint[], resolution: number) => {
    const arms = (paints[0].geometry as {coordinates: ProjectedPosition[][]}).coordinates;
    const [a, b] = arms[0];
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / resolution;
};

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 131900 — airfield', () => {
    // "Anchor Points. This symbol requires one anchor point."
    it('is dropped on a point, not traced as an area', () => {
        expect(baseGeometryFor(TacticalGraphicName.Airfield)).toBe('Point');
    });

    it('draws two arms crossing at the anchor', () => {
        const arms = built().coordinates;
        expect(arms).toHaveLength(2);

        const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});
        for (const [start, end] of arms) {
            // Both arms are centred on the anchor: it sits the same distance from each end.
            expect(meters(CENTER, start) / meters(CENTER, end)).toBeCloseTo(1, 2);
        }
    });

    it('is one arm across and one at an angle, not a plus or an X', () => {
        const [runway, taxiway] = built().coordinates;
        const bearing = (arm: Position[]) => turf.bearing(turf.point(arm[0]), turf.point(arm[1]));
        const between = Math.abs(((bearing(runway) - bearing(taxiway) + 540) % 360) - 180);
        expect(between).toBeGreaterThan(20);
        expect(between).toBeLessThan(50);
    });

    it('holds its ground size, so it grows on screen as you zoom in', () => {
        // The invariant, and the one that was inverted: a quarter of the resolution is four
        // times the pixels. A symbol pinned to the screen returns the same number at both,
        // which is exactly what this asserted until 2026-08-17.
        expect(armWidthPx(painted(50), 50) / armWidthPx(painted(200), 200)).toBeCloseTo(4, 6);
    });

    it('paints the arms the generator laid out, without rescaling them', () => {
        // Nothing between the geometry and the mark now. Stated as its own assertion because
        // the failure it guards against — a pin quietly reintroduced — leaves a symbol that
        // still looks correct at the zoom it was placed at.
        const arms = built().coordinates.map(arm => arm.map(project));
        const painted0 = (painted(200)[0].geometry as {coordinates: ProjectedPosition[][]}).coordinates;
        expect(painted0).toEqual(arms);
    });

    it('sets field H beside the runway, not through the crossing', () => {
        const center = project(CENTER);
        const [label] = airfieldPointLabelPaint(TacticalGraphicName.Airfield)({
            geometry: {type: 'Point', coordinates: center},
            properties: {name: TacticalGraphicName.Airfield, additionalInfo: 'JOINT'},
            graphicSize: SIZE,
        } as PaintFeature, context(200));

        expect(label.text?.text).toBe('JOINT');
        const at = (label.geometry as {coordinates: ProjectedPosition}).coordinates;
        // Clear of the arms' own right-hand end, and on the axis. Measured against the
        // graphic's metre size, because that is what the runway's reach is now.
        expect(at[0] - center[0]).toBeGreaterThan(SIZE);
        expect(at[1]).toBeCloseTo(center[1], 6);
    });

    /**
     * The plate boxes the `T` immediately past the **end of the horizontal line**, and the
     * runway is the wider of the two arms — so the graphic's own eastern edge is that end.
     *
     * Deriving it from `graphicSize` instead assumes that number is the runway's half
     * length, which holds only on the path that stamps it. The catalog hands the paint the
     * sample's `radius`, which is smaller, and the label printed 17 px *inside* the
     * runway it is supposed to sit beyond — visible on zaes.com rather than in the app,
     * which is why no test caught it.
     */
    it('measures from the drawn runway rather than from a stamped size', () => {
        const center = project(CENTER);
        const arms = built().coordinates.map(arm => arm.map(project));
        const east = Math.max(...arms.flat().map(([x]) => x));

        const [label] = airfieldPointLabelPaint(TacticalGraphicName.Airfield)({
            geometry: {type: 'Point', coordinates: center},
            properties: {name: TacticalGraphicName.Airfield, additionalInfo: 'JOINT'},
            // Deliberately wrong for this graphic, the way the catalog's is: a size that
            // would put the label well inside the runway.
            graphicSize: SIZE * 0.6,
            bounds: {
                minX: Math.min(...arms.flat().map(([x]) => x)),
                minY: Math.min(...arms.flat().map(([, y]) => y)),
                maxX: east,
                maxY: Math.max(...arms.flat().map(([, y]) => y)),
            },
        } as PaintFeature, context(200));

        const at = (label.geometry as {coordinates: ProjectedPosition}).coordinates;
        expect(at[0]).toBeGreaterThan(east);
        // And by the clearance, not by whatever the stamped size happened to be.
        expect(at[0] - east).toBeCloseTo(8 * 200, 6);
    });
});

describe('APP-06 120400 — airfield zone', () => {
    it('is still traced as an area', () => {
        expect(baseGeometryFor(TacticalGraphicName.AirfieldZone)).toBe('Polygon');
    });

    it('is a different base geometry from the airfield, which is the whole point', () => {
        expect(baseGeometryFor(TacticalGraphicName.AirfieldZone))
            .not.toBe(baseGeometryFor(TacticalGraphicName.Airfield));
    });
});
