/**
 * # Where a circle's point 2 is, and what the rim letter does when you zoom out
 *
 * Every circle in the library takes its centre from point 1, and both standards agree
 * about that. What they do *not* all have is a point 2, and the difference decides where
 * the red handle belongs:
 *
 * | family | APP-06 Anchor Points | handle |
 * |---|---|---|
 * | 18 circular areas | *"one (1) anchor point and a radius"* — no point 2 | the rim at the angle both standards draw the radius arrow |
 * | 9 arc mission tasks | *"point 2 defines the graphic's start point and radius"* | that start point |
 * | contain (151204) | points 1 and 2 are the **opening's** two ends | the second drawn anchor |
 *
 * The handle used to sit at 205 degrees on all of them — the arrowhead end of the lower
 * arc, which is not an anchor point on any of the three families. Measured on both
 * engines, every circle in the library reported the same 206.
 */

import {renderTacticalGraphic} from './core/render';
import {RATIO_LOCKED_MISSION_TASKS} from './core/symbology';
import {TacticalGraphicName} from './core/type';
import {RADIUS_ARROW_DEGREES, START_POINT_DEGREES} from './graphics/MissionTask';

/** Metres. Near the equator this is a bit under two degrees of longitude. */
const RADIUS = 200_000;

/** The nine whose Template annotates `PT. 2 (START POINT)` against the upper arc's end. */
const START_POINT_TASKS = [
    TacticalGraphicName.Secure,
    TacticalGraphicName.Locate,
    TacticalGraphicName.Isolate,
    TacticalGraphicName.Retain,
    TacticalGraphicName.Control,
    TacticalGraphicName.Occupy,
    TacticalGraphicName.AreaDefense,
    TacticalGraphicName.CordonAndSearch,
    TacticalGraphicName.CordonAndKnock,
    TacticalGraphicName.Deny,
];

/** Every graphic built as a plain circle from a centre and a radius amplifier. */
const CIRCULAR_AREAS = [
    TacticalGraphicName.FreeFireAreaCircular,
    TacticalGraphicName.NoFireAreaCircular,
    TacticalGraphicName.RestrictiveFireAreaCircular,
    TacticalGraphicName.PositionAreaArtilleryCircular,
    TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular,
    TacticalGraphicName.CallForFireZoneCircular,
    TacticalGraphicName.TargetBuildUpAreaCircular,
    TacticalGraphicName.TargetValueAreaCircular,
    TacticalGraphicName.ZoneOfResponsibilityCircular,
    TacticalGraphicName.CensorZoneCircular,
    TacticalGraphicName.CriticalFriendlyZoneCircular,
    TacticalGraphicName.DeadSpaceAreaCircular,
    TacticalGraphicName.BlueKillBoxCircular,
    TacticalGraphicName.PurpleKillBoxCircular,
    TacticalGraphicName.FireSupportAreaCircular,
    TacticalGraphicName.TargetAreaCircular,
    TacticalGraphicName.AirSpaceCoordinationAreaCircular,
    TacticalGraphicName.PsyOpsZoneCircular,
];

type Pos = [number, number];

function render(name: TacticalGraphicName, geometry?: {type: string; coordinates: unknown}) {
    return renderTacticalGraphic({
        type: 'Feature',
        geometry: (geometry ?? {type: 'Point', coordinates: [0, 0]}) as never,
        properties: {tacticalGraphic: {name, radius: RADIUS, rotation: 0, labelGapDegrees: 15}},
    } as never);
}

/** Every position in a geometry, flattened. */
function positions(geometry: unknown, out: Pos[] = []): Pos[] {
    const g = geometry as {type?: string; geometries?: unknown[]; coordinates?: unknown};
    if (!g) return out;
    if (g.type === 'GeometryCollection') {
        (g.geometries ?? []).forEach(child => positions(child, out));
        return out;
    }
    const rec = (v: unknown): void => {
        if (!Array.isArray(v)) return;
        if (typeof v[0] === 'number') return void out.push(v as Pos);
        v.forEach(rec);
    };
    rec(g.coordinates);
    return out;
}

/** Degrees about the origin, 0 due east, increasing counter-clockwise. */
const bearing = ([x, y]: Pos) => ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

/** The edge handle — `handles[0]`, which drives rotate and resize. */
function edgeHandle(name: TacticalGraphicName, geometry?: {type: string; coordinates: unknown}): Pos {
    return positions(render(name, geometry).handles.geometry)[0];
}

describe('point 2, on the nine arc mission tasks', () => {
    it.each(START_POINT_TASKS.map(n => [String(n), n] as const))(
        '%s puts its handle on the start point, not on the arrowhead',
        (_label, name) => {
            expect(bearing(edgeHandle(name))).toBeCloseTo(START_POINT_DEGREES, 0);
        },
    );

    it('is the blunt end of the arc, which is the end with no arrowhead on it', () => {
        // The lower arc runs 205 to 345, so its free end is at 205. That is where the
        // handle used to be — the *other* free end, and the one the plate leaves an
        // arrowhead on rather than an anchor point.
        expect(START_POINT_DEGREES).toBe(175);
        expect(bearing(edgeHandle(TacticalGraphicName.Secure))).not.toBeCloseTo(205, 0);
    });
});

describe('the circular areas, which have no point 2 at all', () => {
    it.each(CIRCULAR_AREAS.map(n => [String(n), n] as const))(
        '%s grips the rim where both standards draw the radius',
        (_label, name) => {
            expect(bearing(edgeHandle(name))).toBeCloseTo((RADIUS_ARROW_DEGREES + 360) % 360, 0);
        },
    );

    it('reads the radius arrow off the plates rather than inventing an angle', () => {
        // Measured on APP-06 240203's Template and FM 1-02.2 table 5-24: from the centre
        // to the rim, 45 degrees below the horizontal, to the lower right.
        expect(RADIUS_ARROW_DEGREES).toBe(-45);
    });
});

describe('APP-06 151204 — contain', () => {
    it('grips the second drawn anchor, which is an end of the opening', () => {
        const drawn = {type: 'LineString', coordinates: [[0, 0], [1.8, 0]]};
        const handle = edgeHandle(TacticalGraphicName.Contain, drawn);
        expect(handle[0]).toBeCloseTo(1.8, 6);
        expect(handle[1]).toBeCloseTo(0, 6);
    });
});

describe('APP-06 343900 — locate has an arrowhead on each arc', () => {
    const subLines = (name: TacticalGraphicName) => {
        const geometry = render(name).graphic.geometry as {type: string; coordinates: Pos[][]};
        expect(geometry.type).toBe('MultiLineString');
        return geometry.coordinates;
    };

    it('emits four runs: two arcs and two heads', () => {
        expect(subLines(TacticalGraphicName.Locate)).toHaveLength(4);
    });

    it('leaves secure with the one head its own plate shows', () => {
        // The two are the same circle with a different letter, which is why locate was
        // written as `extends Secure` and why the missing head survived: a circle with one
        // arrowhead still renders as a perfectly plausible circle.
        expect(subLines(TacticalGraphicName.Secure)).toHaveLength(3);
    });

    it('points one head down the upper arc and one back along the lower', () => {
        const [upper, lower, upperHead, lowerHead] = subLines(TacticalGraphicName.Locate);
        // Each head is a barb whose apex is the arc end it belongs to.
        const apex = (head: Pos[]) => head[1];
        const near = (a: Pos, b: Pos) => Math.hypot(a[0] - b[0], a[1] - b[1]);
        expect(near(apex(upperHead), upper[upper.length - 1])).toBeLessThan(1e-6);
        expect(near(apex(lowerHead), lower[0])).toBeLessThan(1e-6);
        // And they sit on the two free ends, a bit either side of due west.
        expect(bearing(apex(upperHead))).toBeCloseTo(175, 0);
        expect(bearing(apex(lowerHead))).toBeCloseTo(205, 0);
    });
});

describe('the rim letter shrinks with the circle', () => {
    it('ratio-locks every arc-and-arrowhead circle that carries one', () => {
        // A zoom-anchored label scale is deliberately insensitive to the shape, so a rim
        // letter that uses one holds its screen size while the circle shrinks — zoom far
        // enough out and the letter is the graphic. Five of the eleven were still on it.
        for (const name of [...START_POINT_TASKS, TacticalGraphicName.Contain]) {
            expect(RATIO_LOCKED_MISSION_TASKS.has(name)).toBe(true);
        }
    });
});
