/**
 * # The same drag, delivered in one step or in ten, has to land in the same place
 *
 * A pointer stream is not part of the gesture. How many `pointermove` events the browser
 * chose to emit between the grab and the release depends on the frame rate, the input
 * device and how fast the hand moved — so a symbol whose final shape depends on that count
 * is a symbol nobody can draw twice.
 *
 * This engine applied each move to the graphic the *previous* move produced, which is the
 * obvious way to write it and is wrong, because a rebuild between two moves is not a no-op.
 * `normalizeDrawnBase` re-squares an axis arrow's width point against its axis; a vertex
 * drag moves the axis; so ten intermediate squarings compose. Measured on the running app,
 * dragging an axis arrow's tip through the same 60 x 45 px: **7,007 m in one step and
 * 6,582 m in ten**, against OpenLayers' 7,007 either way — that engine squares once, at
 * `modifyend`. 6.4% of a width, from nothing the operator did.
 *
 * Every gesture in `applyGesture` is absolute — the graphic, where the pointer went down,
 * where it is now — so the fix is to apply each one to the description the drag *started*
 * from. This suite is what says so.
 *
 * **The vertex drag is the one that was measurably wrong**, and it is the only one of the
 * four below that fails against the old model: a translate's offsets, a rotate's angles and
 * a resize's ratios compose exactly, so composing them was harmless arithmetic rather than a
 * defect. They are held here anyway, because what makes them safe is a property of those
 * three gestures today — a clamp, a floor or a minimum added to any of them would start
 * composing too, and silently.
 *
 * No real map: the projections are stubbed as a linear scale, which is enough because
 * nothing here asks where a pixel is — both halves of every comparison go through the same
 * stub, and what is being compared is one path against another.
 *
 * @see ai/decisions.md, "Idempotent is not the same as path-independent"
 */

import type {Position} from 'geojson';
import {
    TacticalGraphicName,
    axisWithWidthPoint,
    halfWidthFromBase,
    storedOrder,
} from '@zaes/tactical-graphics';
import {MapLibreInteractions} from './MapLibreInteractions';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from '../maplibreAdapter';

/** Ground metres per pixel, and the zoom that produces it. @see resolutionOf */
const RES = 2445.98;

/** Screen pixels per degree of longitude, so a drag can be written in degrees. */
const PX_PER_DEGREE = 10;

/** A map that projects linearly and reports one zoom. */
const stubMap = () => ({
    on: () => {},
    off: () => {},
    getZoom: () => Math.log2(40075016.68557849 / (512 * RES)),
    getCanvasContainer: () => null,
    project: ([lng, lat]: [number, number]) => ({x: lng * PX_PER_DEGREE, y: -lat * PX_PER_DEGREE}),
    unproject: ([x, y]: [number, number]) => ({lng: x / PX_PER_DEGREE, lat: -y / PX_PER_DEGREE}),
    dragPan: {enable: () => {}, disable: () => {}},
});

/** A renderer that accepts what the drag hands it and remembers nothing. */
const stubRenderer = () => ({
    replace: () => {},
    setMeasure: () => {},
    find: () => undefined,
    selection: undefined,
});

type Drag = {
    graphic: MapLibreTacticalGraphic;
    vertex: number;
    insertAt: number;
    onCenter: boolean;
    onPivot: boolean;
    handle: number;
    origin: Position;
    start: {geometry: unknown; properties: unknown};
    started: boolean;
    startPixel: {x: number; y: number};
};

/** The interactions object with the two private members this suite has to reach. */
type Reachable = {
    mode: string;
    dragging: Drag | null;
    dragTo(to: Position): void;
};

/**
 * Drags one graphic from `from` to `to`, delivered as `steps` pointer moves.
 *
 * The intermediate positions are evenly spaced along the straight line between the two,
 * which is what a hand moving at a steady speed produces and is the case the composed
 * arithmetic got wrong.
 */
function drag(
    graphic: MapLibreTacticalGraphic,
    options: {mode: string; vertex?: number; handle?: number},
    from: Position,
    to: Position,
    steps: number,
): MapLibreTacticalGraphic {
    const interactions = new MapLibreInteractions(stubMap() as never, stubRenderer() as never);
    const reach = interactions as unknown as Reachable;
    reach.mode = options.mode;
    reach.dragging = {
        graphic,
        vertex: options.vertex ?? -1,
        insertAt: -1,
        onCenter: false,
        onPivot: false,
        handle: options.handle ?? -1,
        origin: from,
        start: {geometry: graphic.base.geometry, properties: graphic.properties},
        started: true,
        startPixel: {x: from[0] * PX_PER_DEGREE, y: -from[1] * PX_PER_DEGREE},
    };

    for (let step = 1; step <= steps; step++) {
        const along = step / steps;
        reach.dragTo([from[0] + (to[0] - from[0]) * along, from[1] + (to[1] - from[1]) * along]);
    }
    return reach.dragging!.graphic;
}

/** An axis arrow with its width already a coordinate, drawn west to east. */
function axisArrow(): MapLibreTacticalGraphic {
    const name = TacticalGraphicName.MainAxisOfAdvance;
    const axis = storedOrder(name, [[0, 0], [4, 0]] as Position[]) as Position[];
    const coordinates = axisWithWidthPoint(name, axis, 60_000);
    return buildTacticalGraphic(name, {type: 'LineString', coordinates}, {}, RES)!;
}

/** A plain three-point line, for the gestures that move a whole graphic. */
function phaseLine(): MapLibreTacticalGraphic {
    return buildTacticalGraphic(
        TacticalGraphicName.PhaseLine,
        {type: 'LineString', coordinates: [[0, 0], [2, 0.5], [4, 0]]},
        {},
        RES,
    )!;
}

/** Every coordinate of a graphic's base, flattened. */
function points(graphic: MapLibreTacticalGraphic): Position[] {
    const geometry = graphic.base.geometry;
    if (geometry.type === 'LineString') return geometry.coordinates as Position[];
    if (geometry.type === 'Polygon') return (geometry.coordinates[0] ?? []) as Position[];
    if (geometry.type === 'Point') return [geometry.coordinates as Position];
    return [];
}

/** The worst distance between two bases, in degrees. */
function apart(a: MapLibreTacticalGraphic, b: MapLibreTacticalGraphic): number {
    const [pa, pb] = [points(a), points(b)];
    if (pa.length !== pb.length) return Infinity;
    return Math.max(...pa.map((p, i) => Math.hypot(p[0] - pb[i][0], p[1] - pb[i][1])));
}

/** A hundredth of a millidegree — about a metre — is floating point, not a different answer. */
const SETTLED = 1e-5;

describe('a drag lands in the same place however many moves it arrives in', () => {
    it('squares an axis arrow\'s width point against the axis it started from', () => {
        // The tip is the coordinate before the width point, and moving it turns the axis —
        // which is the whole of the defect: the width is measured against that axis.
        const one = drag(axisArrow(), {mode: 'modify', vertex: 1}, [4, 0], [1.0, 3.2], 1);
        const ten = drag(axisArrow(), {mode: 'modify', vertex: 1}, [4, 0], [1.0, 3.2], 20);

        const name = TacticalGraphicName.MainAxisOfAdvance;
        const half = (g: MapLibreTacticalGraphic) =>
            halfWidthFromBase(name, (g.base.geometry as {coordinates: Position[]}).coordinates)!;

        // The number the plate names, unchanged by how the cursor got there.
        expect(half(ten)).toBeCloseTo(half(one), 3);
        expect(apart(one, ten)).toBeLessThan(SETTLED);
    });

    it('moves a line the same distance in one step or ten', () => {
        const one = drag(phaseLine(), {mode: 'translate'}, [1, 0], [2.4, 0.9], 1);
        const ten = drag(phaseLine(), {mode: 'translate'}, [1, 0], [2.4, 0.9], 10);
        expect(apart(one, ten)).toBeLessThan(SETTLED);
    });

    it('turns a line through the same angle in one step or ten', () => {
        const one = drag(phaseLine(), {mode: 'rotate'}, [4, 0], [2, 2.5], 1);
        const ten = drag(phaseLine(), {mode: 'rotate'}, [4, 0], [2, 2.5], 10);
        expect(apart(one, ten)).toBeLessThan(SETTLED);
    });

    it('scales a line by the same ratio in one step or ten', () => {
        const one = drag(phaseLine(), {mode: 'resize'}, [4, 0], [6, 0], 1);
        const ten = drag(phaseLine(), {mode: 'resize'}, [4, 0], [6, 0], 10);
        expect(apart(one, ten)).toBeLessThan(SETTLED);
    });

    /**
     * **The drag still has to do something**, or the four assertions above would pass on an
     * engine that ignored every move. Each gesture is checked to have moved the base off
     * where it started by a distance nobody could mistake for rounding.
     */
    it('is comparing gestures that actually changed the graphic', () => {
        const start = phaseLine();
        expect(apart(start, drag(phaseLine(), {mode: 'translate'}, [1, 0], [2.4, 0.9], 10))).toBeGreaterThan(0.5);
        expect(apart(start, drag(phaseLine(), {mode: 'rotate'}, [4, 0], [2, 2.5], 10))).toBeGreaterThan(0.5);
        expect(apart(start, drag(phaseLine(), {mode: 'resize'}, [4, 0], [6, 0], 10))).toBeGreaterThan(0.5);

        const arrow = axisArrow();
        expect(apart(arrow, drag(axisArrow(), {mode: 'modify', vertex: 1}, [4, 0], [1.0, 3.2], 20)))
            .toBeGreaterThan(0.5);
    });
});
