/**
 * # 140800's three anchor points
 *
 * The infiltration lane states the demolition block's rule in the block's own words:
 *
 * > This symbol requires three anchor points. Points 1 and 2 define the endpoints of the
 * > infiltration lane and point 3 defines one side of the lane.
 *
 * It was built as a two-point centreline carrying its separation beside it as a `width`
 * amplifier, dragged by a *derived* offset handle riding the end of the left rail — so the
 * number the standard puts in a coordinate lived in two places at once and the draw ended
 * on the second click with the width never asked for. (User's call, 2026-09-05.)
 *
 * What is asserted here is the half that would drift silently: which points make the
 * centreline, where the separation is read from, and that a lane saved under the old
 * description still draws.
 */
import {TacticalGraphicName} from '../core/type';
import {renderTacticalGraphic} from '../core/render';
import {baseVertexCount, carriesSeparationInBase, editStretches, handleRole} from '../core/handles';
import {normalizeDrawnBase} from '../core/drawnBase';
import type {Feature, LineString, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';

const NAME = TacticalGraphicName.InfiltrationLane;

/** A lane from three placed points, the way the draw stores it. */
const lane = (coordinates: Position[], extra: object = {}) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates},
        properties: {tacticalGraphic: {name: NAME, ...extra}},
    } as unknown as Feature<LineString>) as unknown as {
        graphic: Feature<MultiLineString>;
        handles: Feature<MultiPoint>;
    };

const metres = (a: Position, b: Position): number =>
    turf.distance(turf.point(a), turf.point(b), {units: 'meters'});

/** Three points: a due-east centreline of about 10 km, with point 3 two km to the north. */
const THREE: Position[] = [[0, 0], [0.09, 0], [0.045, 0.018]];

describe('the infiltration lane', () => {
    it('takes three base points, like the demolition block whose rule it shares', () => {
        // The registry entries both renderers read. `carriesSeparationInBase` is derived from
        // this one, so a lane that slipped back to two points would quietly regain a width.
        expect(baseVertexCount(NAME)).toBe(3);
        expect(carriesSeparationInBase(NAME)).toBe(true);
    });

    it('reads the separation off point 3 rather than a width amplifier', () => {
        const rails = lane(THREE).graphic.geometry.coordinates;
        expect(rails).toHaveLength(2);
        // Point 3 sits 2 km north of the centreline, so the rails straddle it 2 km either
        // side and the pair spans twice that.
        const across = metres(rails[0][0], rails[1][0]);
        expect(across / 2).toBeCloseTo(metres([0.045, 0], [0.045, 0.018]), -2);
    });

    it('builds the rails from points 1 and 2 only, never bending them towards point 3', () => {
        /*
         * **The trap the rewrite had to avoid.** The rails used to be offset from the *whole*
         * base, which was right while every vertex was centreline. With point 3 stored, that
         * offsets a three-vertex path and both rails kink towards the side point — a lane
         * bent into a V rather than two straight rails.
         */
        const rails = lane(THREE).graphic.geometry.coordinates;
        for (const rail of rails) {
            expect(rail).toHaveLength(2);
            // Due east in, due east out: a rail that turned would not share its endpoints'
            // latitude.
            expect(rail[0][1]).toBeCloseTo(rail[1][1], 9);
        }
    });

    it('publishes the two ends and a side grip squared onto the centreline', () => {
        /*
         * `[start, end, side]`. The third is derived back onto the perpendicular at the
         * centreline's midpoint rather than published where it was clicked, so the grip stays
         * on the rail it sets while the ends are dragged around it. @see sidePoint
         *
         * **Point 3 is deliberately off square here.** A freshly drawn lane has it squared
         * already, so a square fixture cannot tell a derived grip from a raw one — this test
         * passed against a generator handing back `coords[2]` untouched until the control run
         * caught it. Off square is the realistic state anyway: dragging either end turns the
         * centreline's perpendicular and a stored coordinate cannot follow.
         */
        const skewed: Position[] = [[0, 0], [0.09, 0], [0.02, 0.018]];
        const grips = lane(skewed).handles.geometry.coordinates;
        expect(grips).toHaveLength(3);
        expect(grips[0]).toEqual([0, 0]);
        expect(grips[1]).toEqual([0.09, 0]);
        // Back onto the midpoint's perpendicular — not at the clicked longitude of 0.02.
        expect(grips[2][0]).toBeCloseTo(0.045, 6);
        expect(grips[2][0]).not.toBeCloseTo(skewed[2][0], 3);
        // ...and one half-width out, which is the across component and nothing else.
        expect(metres([0.045, 0], grips[2])).toBeCloseTo(metres([0, 0], [0, 0.018]), -2);
    });

    it('puts a third click on the perpendicular, discarding its slide along the lane', () => {
        /*
         * Only how far point 3 lies *across* the centreline means anything — its component
         * along the lane would slide the grip up and down a rail without changing the symbol.
         * The two clicks below are the same distance across and differ only along.
         */
        const square = normalizeDrawnBase(NAME, [[0, 0], [0.09, 0], [0.045, 0.018]]);
        const skewed = normalizeDrawnBase(NAME, [[0, 0], [0.09, 0], [0.02, 0.018]]);
        expect(square).toHaveLength(3);
        expect(skewed[2][0]).toBeCloseTo(square[2][0], 6);
        expect(skewed[2][1]).toBeCloseTo(square[2][1], 6);
    });

    it('still draws a lane saved as two points and a width', () => {
        /*
         * **Back-compatibility, not a second construction.** A lane stored before 2026-09-05
         * has two coordinates and its separation beside them; `halfWidthFromSide` falls back
         * to `radius` when there is no third point, so the old description keeps rendering
         * rather than collapsing both rails onto the centreline.
         */
        const rails = lane([[0, 0], [0.09, 0]], {width: 4000}).graphic.geometry.coordinates;
        expect(rails).toHaveLength(2);
        // `width` is the full span and `radius` the half the generator takes.
        expect(metres(rails[0][0], rails[1][0])).toBeCloseTo(4000, -2);
    });

    it('refuses to let a stray drag set both its length and its width at once', () => {
        // Its three points are two jobs — the ends set the lane's length, the side point sets
        // how far apart the rails sit — so an edit drag that grabs no vertex must not scale
        // the whole graphic. The resize affordance is the control that means to.
        expect(editStretches(NAME)).toBe(false);
    });

    it('calls every grip a shape handle, so MapLibre moves the point instead of a width', () => {
        /*
         * MapLibre routes a handle drag by its role. While the third grip was an `offset` it
         * wrote a number beside the base; there is no such number now, so an `offset` role
         * would send the drag to a width that does not exist and the handle would do nothing.
         * That is the defect the demolition block hit on 2026-09-05. @see handleContract
         */
        expect([0, 1, 2].map(i => handleRole(NAME, i))).toEqual(['shape', 'shape', 'shape']);
    });
});
