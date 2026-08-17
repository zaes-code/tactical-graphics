/**
 * # The airfield is a point, the airfield zone is an area
 *
 * They rendered identically until 2026-08-17 — the same crossed runways fitted inside the
 * same drawn boundary — which meant two graphics with one appearance and a name in a menu
 * to tell them apart. APP-06 draws them differently on purpose: 131900 is one anchor point
 * and "Size/Shape. Static", 120400 is at least three anchor points and a traced boundary.
 */

import type {Feature, MultiLineString, Position} from 'geojson';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import * as turf from '../core/turf';
import {baseGeometryFor, renderTacticalGraphic} from '../core/render';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {AIRFIELD_HALF_WIDTH_PX, airfieldPointLabelPaint, airfieldPointPaint} from './airfieldPaints';

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

    // "Size/Shape. Static." — the size is not the operator's to set.
    it('holds the same screen size at every zoom', () => {
        // The invariant that matters: four times the resolution, the same pixels.
        expect(armWidthPx(painted(200), 200)).toBeCloseTo(armWidthPx(painted(50), 50), 6);
    });

    it('lands within a Mercator factor of its nominal screen width', () => {
        // Not exactly `2 x AIRFIELD_HALF_WIDTH_PX`, and the gap is not a bug. The pin
        // divides out `graphicSize`, which the holder sets in **projected** metres, while
        // this fixture hands the generator a radius in *ground* metres and the generator
        // walks geodesically. At 38.9° the two differ by sec(lat) ≈ 1.29. In the app both
        // sides are projected metres and the pin is exact.
        const width = armWidthPx(painted(200), 200);
        const nominal = AIRFIELD_HALF_WIDTH_PX * 2;
        expect(width).toBeGreaterThan(nominal);
        expect(width / nominal).toBeCloseTo(1 / Math.cos((38.9 * Math.PI) / 180), 1);
    });

    it('sets its designation beside the runway, not through the crossing', () => {
        const center = project(CENTER);
        const [label] = airfieldPointLabelPaint(TacticalGraphicName.Airfield)({
            geometry: {type: 'Point', coordinates: center},
            properties: {name: TacticalGraphicName.Airfield, label: 'JOINT'},
        } as PaintFeature, context(200));

        expect(label.text?.text).toBe('JOINT');
        const at = (label.geometry as {coordinates: ProjectedPosition}).coordinates;
        // Clear of the arms' own right-hand end, and on the axis.
        expect((at[0] - center[0]) / 200).toBeGreaterThan(AIRFIELD_HALF_WIDTH_PX);
        expect(at[1]).toBeCloseTo(center[1], 6);
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
