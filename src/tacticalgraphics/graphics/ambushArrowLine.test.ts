/**
 * # The ambush's arrowhead line is one line
 *
 * APP-06 141700's Draw Rules: *"The rear of the arrowhead line shall connect to the
 * midpoint of the line between points 2 and 3. The arrowhead line shall be
 * perpendicular to the line formed by points 2 and 3."* On a 120 degree arc that
 * midpoint sits `r·cos(60°)` = 0.5r out along the axis — which is where the hashes
 * start — so the whole run from the chord to the tip is a single stroke.
 *
 * It used to be two: a hash from 0.5r to r, then a shaft from r to the tip. Both are
 * sampled off the same great circle, so they are collinear in the plane the generator
 * thinks in; but each was emitted as a bare pair of endpoints, and a chord does not
 * follow the curve it subtends. All of the geodesic's bend therefore landed on the
 * join, as a corner — **7.1 degrees** at the radius a first click at the demo's opening
 * zoom produces, with the two halves plainly at different angles.
 *
 * That is why the checks below measure the *emitted runs* in Web Mercator, the frame
 * both renderers paint in, rather than the bearings the generator worked in. Those
 * bearings agreed the whole time and would have passed against the broken shape.
 */

import {renderTacticalGraphic} from '../index';
import {TacticalGraphicName} from '../core/type';
import {anchorsForArcAndArrow} from '../core/anchors';
import type {Feature, LineString, MultiLineString, Position} from 'geojson';

const EARTH_RADIUS_M = 6378137;
const toMercator = ([lon, lat]: Position): Position => [
    (EARTH_RADIUS_M * lon * Math.PI) / 180,
    EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];
const gap = (a: Position, b: Position): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Screen-space bearing of the straight run between two projected positions. */
const runAngle = (a: Position, b: Position): number => ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 360) % 360;
/** Signed difference of two bearings, folded into (-180, 180]. */
const angleBetween = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;

const CENTRE: Position = [-98.5, 39.5];
const AXIS_DEG = 154;

/** The graphic's line work, projected, so every measurement below is a screen measurement. */
function ambushLineWork(radiusMetres: number, reach = 2): Position[][] {
    const base: Feature<LineString> = {
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: anchorsForArcAndArrow(CENTRE, radiusMetres, AXIS_DEG, reach)},
        properties: {},
    };
    const rendered = renderTacticalGraphic({...base, properties: {tacticalGraphic: {name: TacticalGraphicName.Ambush}}});
    return (rendered.graphic.geometry as MultiLineString).coordinates.map(run => run.map(toMercator));
}

/**
 * The run carrying the arrowhead's tip — the straight run reaching furthest from the
 * centre. Found by measurement rather than by index so the check keeps measuring the
 * right thing if the emission order ever moves.
 */
function arrowheadLine(lineWork: Position[][], centre: Position): Position[] {
    const reachOf = (run: Position[]) => Math.max(...run.map(p => gap(centre, p)));
    return lineWork.filter(run => run.length === 2).reduce((far, run) => (reachOf(run) > reachOf(far) ? run : far));
}

/** Both radii a first click can produce, plus a size where the geodesic is nearly flat. */
const RADII = [5_000, 200_000, 3_828_822];

describe("the ambush's arrowhead line", () => {
    it.each(RADII)('runs unbroken from the chord to the tip at r = %i m', radius => {
        const centre = toMercator(CENTRE);
        const arrow = arrowheadLine(ambushLineWork(radius), centre);
        const rear = arrow[0];
        const tip = arrow[1];

        // The rear reaches back to the chord at 0.5r, not merely to the bulge at r —
        // so against a tip at 2r the ratio is a quarter, where the split run gave a
        // half. A range rather than a value: a chord across a 3,800 km great circle is
        // not the arc's own length, and at that size the quarter reads 0.262.
        const ratio = gap(centre, rear) / gap(centre, tip);
        expect(ratio).toBeGreaterThan(0.15);
        expect(ratio).toBeLessThan(0.35);
    });

    it.each(RADII)('has nothing continuing it end-to-end at r = %i m', radius => {
        const lineWork = ambushLineWork(radius);
        // Coincident vertices project to identical coordinates, so this is an equality
        // test with room only for float noise.
        const TOUCHING_M = 1e-6 * radius;

        const joins: string[] = [];
        for (let i = 0; i < lineWork.length; i++) {
            for (let j = i + 1; j < lineWork.length; j++) {
                for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
                    const first = lineWork[i];
                    const second = lineWork[j];
                    if (first.length !== 2 || second.length !== 2) continue;
                    if (gap(first[a], second[b]) > TOUCHING_M) continue;
                    // Angle the stroke turns through at the shared vertex. A near-zero
                    // turn is one line drawn as two, which is the defect.
                    const turn = Math.abs(
                        angleBetween(runAngle(first[a], first[1 - a]), runAngle(second[b], second[1 - b])),
                    );
                    if (180 - turn < 45) joins.push(`${i}/${j} turns ${(180 - turn).toFixed(2)} deg`);
                }
            }
        }
        expect(joins).toEqual([]);
    });

    it('lands its rear on the midpoint of the chord between points 2 and 3', () => {
        const radius = 200_000;
        const [, upper, lower] = anchorsForArcAndArrow(CENTRE, radius, AXIS_DEG, 2).map(toMercator);
        const chordMid: Position = [(upper[0] + lower[0]) / 2, (upper[1] + lower[1]) / 2];

        const rear = arrowheadLine(ambushLineWork(radius), toMercator(CENTRE))[0];
        // Within a percent of the radius: the chord's projected midpoint and the point
        // the generator walks to geodesically are the same place up to that curvature.
        expect(gap(rear, chordMid) / gap(toMercator(CENTRE), upper)).toBeLessThan(0.01);
    });

    it('leaves six hashes, three either side of the axis', () => {
        const lineWork = ambushLineWork(200_000);
        const centre = toMercator(CENTRE);
        const arrow = arrowheadLine(lineWork, centre);
        const axis = runAngle(centre, arrow[1]);

        const hashes = lineWork.filter(run => run.length === 2 && run !== arrow);
        expect(hashes).toHaveLength(6);
        const sides = hashes.map(run => Math.sign(angleBetween(runAngle(centre, run[0]), axis)));
        expect(sides.filter(s => s > 0)).toHaveLength(3);
        expect(sides.filter(s => s < 0)).toHaveLength(3);
    });
});
