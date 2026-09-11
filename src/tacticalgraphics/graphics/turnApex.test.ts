/**
 * # The bend grip is a point on the curve, or it is nothing
 *
 * Turn publishes APP-06 270504's three anchor points as its grips, and point 3 is the
 * apex of the bow. The curve used to be built from a bow *depth* — a geodesic offset from
 * the chord's midpoint, interpolated in degrees — so where the line actually reached was
 * the degree-space average of three points rather than that ground distance. The two agree
 * on the equator and part company with latitude and with size: measured in the app, a
 * 200 km turn at 65 degrees left its grip 6 px off the stroke, and 69 px at 75.
 *
 * A grip that is not on the thing it edits reads as broken however small the number, so
 * the curve is built through the anchor point instead of near it.
 */

import type {Feature, GeometryCollection, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import {TacticalGraphicName} from '../core/type';
import {Turn} from './Turn';

/** No gap, so the whole curve is there to be measured against. @see Turn.halfGap */
const NO_GAP = {labelGap: 0};

const baseAt = (name: TacticalGraphicName, center: Position, size: number, rotation: number, bend: number) => {
    const graphic = new Turn(name);
    const handles = graphic.generateHandles(
        {type: 'Feature', geometry: {type: 'Point', coordinates: center}, properties: {}} as Feature<any>,
        {size, rotation, bend, ...NO_GAP},
    ) as Feature<MultiPoint>;
    return {graphic, anchors: handles.geometry.coordinates};
};

/** Every stroked line in the drawn geometry, flattened. */
const strokes = (drawn: Feature<GeometryCollection>): Position[][] => {
    const out: Position[][] = [];
    for (const member of drawn.geometry.geometries) {
        if (member.type === 'MultiLineString') out.push(...(member as MultiLineString).coordinates);
        if (member.type === 'LineString') out.push((member as LineString).coordinates);
    }
    return out;
};

/** Distance from `p` to the nearest point of any stroke, in degrees. */
const missOf = (p: Position, parts: Position[][]): number => {
    let best = Infinity;
    for (const part of parts) {
        for (let i = 1; i < part.length; i++) {
            const [ax, ay] = part[i - 1];
            const [bx, by] = part[i];
            const vx = bx - ax;
            const vy = by - ay;
            const length = vx * vx + vy * vy;
            const t = length ? Math.max(0, Math.min(1, ((p[0] - ax) * vx + (p[1] - ay) * vy) / length)) : 0;
            best = Math.min(best, Math.hypot(p[0] - (ax + t * vx), p[1] - (ay + t * vy)));
        }
    }
    return best;
};

describe.each([TacticalGraphicName.Turn, TacticalGraphicName.TacticalTurn])('%s’s bend grip', name => {
    /** The far north is where the two readings of a bow diverge. @see bendLineThroughApex */
    it.each([
        {latitude: 0, rotation: 0},
        {latitude: 40, rotation: 0},
        {latitude: 65, rotation: 30},
        {latitude: 75, rotation: 45},
    ])('sits on the drawn curve at $latitude degrees', ({latitude, rotation}) => {
        const {graphic, anchors} = baseAt(name, [0, latitude], 200_000, rotation, 0.35);
        const base = {type: 'Feature', geometry: {type: 'LineString', coordinates: anchors}, properties: {}} as Feature<any>;
        const parts = strokes(graphic.generateGraphics(base, NO_GAP));
        const chord = Math.hypot(anchors[0][0] - anchors[1][0], anchors[0][1] - anchors[1][1]);
        // A tenth of a percent of the chord: what is left is the sampling step between
        // two vertices of the curve, not a disagreement about where the apex is.
        expect(missOf(anchors[2], parts) / chord).toBeLessThan(0.001);
    });

    /** The ends were never the problem, and they stay exact. */
    it('still starts and ends on its own chord', () => {
        const {graphic, anchors} = baseAt(name, [0, 65], 200_000, 30, 0.35);
        const base = {type: 'Feature', geometry: {type: 'LineString', coordinates: anchors}, properties: {}} as Feature<any>;
        const parts = strokes(graphic.generateGraphics(base, NO_GAP));
        const chord = Math.hypot(anchors[0][0] - anchors[1][0], anchors[0][1] - anchors[1][1]);
        expect(missOf(anchors[0], parts) / chord).toBeLessThan(0.001);
        expect(missOf(anchors[1], parts) / chord).toBeLessThan(0.001);
    });
});
