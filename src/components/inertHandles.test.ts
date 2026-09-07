/**
 * # Points that are stored and shown, and that nobody may drag
 *
 * 271204 roadblock complete (executed) stores the three anchor points its family uses —
 * `[start, end, side]` — so a file carries them and the operator can see where the symbol's
 * anchors are. But its own construction is unsettled: its Draw Rules cell is empty, so the row
 * inherits 271201's centreline-and-width rule, and its Template was read three ways in one
 * session. Offering a grip on each point would promise a shape the reading does not support.
 *
 * So the contract is: **store the points, publish them, refuse the drag.** Translate, rotate
 * and resize still act on the whole graphic. (User's call, 2026-09-07: "we always store the
 * points and show them as inert since the user can't really modify them directly. They can
 * only resize/rotate/move the graphic wholesomely (for now)".)
 *
 * It is a third thing, distinct from the two that already existed, and the distinction is why
 * it needed a statement of its own rather than reusing either:
 *
 * - `anchorVertex(name)` makes **one** vertex of an otherwise editable path inert.
 * - `publishesAnchorHandleOnly(name)` is about **how many** handles a graphic publishes.
 *
 * Both engines read it, which is the point: OpenLayers through the handle feature's `inert`
 * flag, MapLibre by refusing the grab. A fact that decides how a symbol edits does not live in
 * a holder. @see ai/conventions.md
 */
import type {Feature, MultiPoint, Position} from 'geojson';
import {
    allowedGestures,
    anchorVertex,
    drawnAnchorFrame,
    rotationAnchor,
    rotationPivot,
    baseVertexCount,
    drawnAnchors,
    dropSizePx,
    usesDrawnAnchors,
    handlesAreInert,
    listTacticalGraphicNames,
    normalizeDrawnBase,
    renderTacticalGraphic,
    TacticalGraphicName,
} from '@zaes/tactical-graphics';
import {getController} from './openlayers/controllerRegistry';

const RES = 1200;
const CLICKS: Position[] = [[12, 41], [12.6, 41], [12.6, 41.2]];
const NAME = TacticalGraphicName.RoadblockCompleteExecuted;

describe('a graphic whose handles are inert', () => {
    it('names 271204, and nothing that has editable points', () => {
        expect(handlesAreInert(NAME)).toBe(true);
        // Deliberately a short list. Anything joining it is giving up point-by-point editing,
        // which is a decision worth making explicitly rather than by inheriting a default.
        const inert = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(handlesAreInert);
        expect(inert).toEqual([NAME]);
    });

    it('stores three points', () => {
        expect(baseVertexCount(NAME)).toBe(3);
        expect(normalizeDrawnBase(NAME, CLICKS, RES)).toHaveLength(3);
    });

    it('publishes a handle on every one of them', () => {
        // Shown, not hidden: the operator can see where the anchors are even though the grips
        // do not answer a drag. That is the whole of what "inert" means here.
        const base = normalizeDrawnBase(NAME, CLICKS, RES) as Position[];
        const handles = (renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: NAME}},
            geometry: {type: 'LineString', coordinates: base},
        } as Feature).handles.geometry as MultiPoint).coordinates;
        expect(handles).toHaveLength(3);
    });

    it('draws the doubled X from those points', () => {
        // Four strokes, not two: the plate's X has each arm doubled. If this falls to two the
        // construction has been changed, which is the thing being deferred, not fixed.
        const base = normalizeDrawnBase(NAME, CLICKS, RES) as Position[];
        const drawn = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name: NAME}},
            geometry: {type: 'LineString', coordinates: base},
        } as Feature).graphic.geometry;
        expect(drawn.type).toBe('MultiLineString');
        expect((drawn as {coordinates: Position[][]}).coordinates).toHaveLength(4);
    });

    it('is dropped on one click and expands to its three points', () => {
        // Same picture 3.4.0 shipped, dropped whole at a default size. What changed is the
        // base it writes: the three anchor points its plate names, not the dropped centre.
        expect(dropSizePx(NAME)).toBe(100);
        expect(usesDrawnAnchors(NAME)).toBe(true);
        const anchors = drawnAnchors(NAME, {center: [12, 41], size: 80_000})!;
        expect(anchors).toHaveLength(3);
    });

    it('does not enable vertex dragging on OpenLayers', () => {
        // `dragsVertices` is what routes a pointer-down to the Modify interaction. A dropped
        // graphic never turns it on, so the base is not modifiable to begin with.
        const controller = getController(NAME, RES) as unknown as {dragsVertices?: boolean};
        expect(controller.dragsVertices).toBeFalsy();
    });

    it('offers all three gestures, and turns about point 3', () => {
        /*
         * **Inert points are not a fixed symbol.** The graphic still moves, turns and scales
         * as a whole — that is the other half of the contract, and the rotate affordance has
         * to be there for it. It was briefly resize-only, which is what 3.4.0 shipped, and
         * that hid the icon. (User's report, 2026-09-07: "you didn't add the rotate icon".)
         *
         * The turn is real, not just an affordance: the bars lean off the symbol's own axis
         * rather than off north, so enabling the gesture without that would have shown a
         * control that did nothing.
         */
        expect(allowedGestures(NAME)).toEqual({translate: true, rotate: true, resize: true, modify: true});

        const anchors = drawnAnchors(NAME, {center: [12, 41], size: 80_000, rotation: 30})!;
        expect(drawnAnchorFrame(NAME, anchors)!.rotation).toBeCloseTo(30, 3);
        // And both gestures pivot on the crossing, not on the centre points 1 and 2 straddle.
        const geometry = {type: 'LineString', coordinates: anchors};
        expect(rotationPivot(geometry, NAME)).toEqual(anchors[2]);
        expect(rotationAnchor(geometry, NAME)).toEqual(anchors[2]);
    });

    it('is not the same thing as a single inert vertex', () => {
        // `anchorVertex` marks one vertex of an editable path; this graphic has no editable
        // vertices at all, so it names none. Conflating the two would make either mechanism
        // unable to express the other's case.
        expect(anchorVertex(NAME)).toBeUndefined();
    });
});
