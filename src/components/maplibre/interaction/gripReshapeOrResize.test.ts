/**
 * # What a grip does is one decision, and both engines read it from the library
 *
 * Two separate questions were being answered by one rule here. `editStretches` says what a
 * drag on a graphic's *body* means; `reshapesByVertex` says what a drag on one of its
 * *grips* means. This engine reshaped whenever `allowedGestures().modify` allowed it, which
 * is 272 graphics, while OpenLayers reshapes on the 81 the library names.
 *
 * On the 23 in between — the bearing lines, the navigational rhumb line, ferry crossing,
 * trip wire, raft site, mine cluster, fortified position, turn, envelopment, contain, the
 * linear targets and 270302 — the same dot therefore scaled the symbol on one engine and
 * pulled a single point out of it on the other. That is a disagreement about what the
 * gesture *means*, not about how far it goes, and it is the one an operator notices:
 * measured on the handle sweep, the bearing lines' second grip landed 37.5 km apart.
 *
 * Both halves are checked, because the fix is a split and a split can be applied one way.
 *
 * @see reshapesByVertex, editStretches, MapLibreInteractions.applyGesture
 */

import type {Position} from 'geojson';
import {TacticalGraphicName, editStretches, reshapesByVertex} from '@zaes/tactical-graphics';
import {MapLibreInteractions} from './MapLibreInteractions';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from '../maplibreAdapter';

/** Ground metres per pixel, and the zoom that produces it. @see resolutionOf */
const RES = 2445.98;
/** Screen pixels per degree of longitude, so a drag can be written in degrees. */
const PX_PER_DEGREE = 10;

const stubMap = () => ({
    on: () => {},
    off: () => {},
    getZoom: () => Math.log2(40075016.68557849 / (512 * RES)),
    getCanvasContainer: () => null,
    project: ([lng, lat]: [number, number]) => ({x: lng * PX_PER_DEGREE, y: -lat * PX_PER_DEGREE}),
    unproject: ([x, y]: [number, number]) => ({lng: x / PX_PER_DEGREE, lat: -y / PX_PER_DEGREE}),
    dragPan: {enable: () => {}, disable: () => {}},
});

const stubRenderer = () => ({replace: () => {}, setMeasure: () => {}, find: () => undefined, selection: undefined});

type Reachable = {mode: string; dragging: Record<string, unknown> | null; dragTo(to: Position): void};

/** Drags the grip on `vertex` from where it sits to `to`, in edit mode. */
function dragGrip(graphic: MapLibreTacticalGraphic, vertex: number, from: Position, to: Position): Position[] {
    const interactions = new MapLibreInteractions(stubMap() as never, stubRenderer() as never);
    const reach = interactions as unknown as Reachable;
    reach.mode = 'edit';
    reach.dragging = {
        graphic,
        vertex,
        insertAt: -1,
        onCenter: false,
        onPivot: false,
        handle: vertex,
        origin: from,
        start: {geometry: graphic.base.geometry, properties: graphic.properties},
        started: true,
        startPixel: {x: from[0] * PX_PER_DEGREE, y: -from[1] * PX_PER_DEGREE},
    };
    reach.dragTo(to);
    const next = (reach.dragging as unknown as {graphic: MapLibreTacticalGraphic}).graphic;
    return (next.base.geometry as {coordinates: Position[]}).coordinates;
}

/** A metre or so, in degrees. */
const SETTLED = 1e-5;

describe('a grip reshapes only where the library says the graphic reshapes', () => {
    it('has the two halves of the split the right way round', () => {
        expect(editStretches(TacticalGraphicName.BearingLine)).toBe(true);
        expect(reshapesByVertex(TacticalGraphicName.BearingLine)).toBe(false);
        expect(editStretches(TacticalGraphicName.Block)).toBe(true);
        expect(reshapesByVertex(TacticalGraphicName.Block)).toBe(true);
    });

    it('scales a bearing line about its anchor rather than dropping the grip on the cursor', () => {
        const line: Position[] = [[0, 0], [4, 0]];
        const graphic = buildTacticalGraphic(TacticalGraphicName.BearingLine, {type: 'LineString', coordinates: line}, {}, RES)!;
        // Straight out along the line and well off it, so a resize and a vertex move
        // cannot land in the same place.
        const after = dragGrip(graphic, 1, [4, 0], [6, 3]);

        expect(after).toHaveLength(2);
        // The far end moved, so the gesture did reach the graphic.
        expect(Math.hypot(after[1][0] - 4, after[1][1])).toBeGreaterThan(0.5);
        // But it did not land under the cursor, which is what a reshape would have done.
        expect(Math.hypot(after[1][0] - 6, after[1][1] - 3)).toBeGreaterThan(0.5);
        // A scale keeps the bearing: the line is still the east-west run it was drawn as.
        expect(Math.abs(after[1][1] - after[0][1])).toBeLessThan(SETTLED);
    });

    it('still drops a bracket task\'s grip on the cursor, because that one reshapes', () => {
        const base: Position[] = [[0, 0], [4, 0], [2, -1]];
        const graphic = buildTacticalGraphic(TacticalGraphicName.Block, {type: 'LineString', coordinates: base}, {}, RES)!;
        const after = dragGrip(graphic, 1, [4, 0], [6, 3]);

        expect(Math.hypot(after[1][0] - 6, after[1][1] - 3)).toBeLessThan(SETTLED);
        // And the point the grip did not touch stayed where it was.
        expect(Math.hypot(after[0][0], after[0][1])).toBeLessThan(SETTLED);
    });
});
