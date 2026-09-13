/**
 * # The same grip drag, delivered in one step or in four, has to land in the same place
 *
 * MapLibre states this guarantee in `dragTo` and has a suite of its own for it. This is the
 * OpenLayers twin, and it was the engine that still failed: `handleVertexDrag` read the
 * *current* base on every pointer move, so each move re-settled an already-settled shape.
 *
 * `settle` calls `normalizeDrawnBase`, which re-derives a graphic's third point against the
 * axis the drag is moving — so squaring the square is not a no-op, and the composition
 * depends on how many `pointermove` events the browser chose to emit. Measured on the handle
 * sweep with a four-step drag, 152901's third point sat **21.9 km** from where MapLibre's
 * one-step drag put it, on a symbol about 60 km across. Nothing the operator did chose that
 * number; the frame rate did.
 *
 * The fix is the same one MapLibre made: latch the base the gesture started on and apply
 * every move to it. Both graphics below are checked because the two halves of the family
 * reach `settle` by different routes — 152901 derives a third point from its axis, and the
 * bracket tasks derive theirs from the opening.
 *
 * @see LineGraphicController.vertexDragStart, ai/decisions.md "Idempotent is not the same as path-independent"
 */
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';

const RES = 1200;
/** A three-point base with a real bend, in projected metres. */
const START: number[][] = [[0, 0], [100_000, -60_000], [200_000, 0]];
/** Where the first grip ends up — far enough that a composed settle cannot hide. */
const TO: number[] = [-140_000, 120_000];

const build = (name: TacticalGraphicName) => {
    const c = getController(name, RES) as LineGraphicController;
    c.setBaseFeature(new Feature(new LineString(START.map(p => [...p]))) as never);
    return c;
};

/** Runs the same drag as `steps` pointer moves and returns the base it left behind. */
function dragIn(name: TacticalGraphicName, steps: number): number[][] {
    const c = build(name);
    for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        c.handleVertexDrag!(0, [START[0][0] + (TO[0] - START[0][0]) * t, START[0][1] + (TO[1] - START[0][1]) * t]);
    }
    // However a drag finishes, the manager calls this — and the latch belongs to the gesture.
    c.endGesture();
    return (c.graphic.base.getGeometry() as LineString).getCoordinates();
}

describe.each([TacticalGraphicName.ExplosivesPlannedStateOfReadiness, TacticalGraphicName.Block])(
    'a grip drag does not depend on how many moves the pointer reported — %s',
    name => {
        it('lands in the same place in one step and in four', () => {
            const once = dragIn(name, 1);
            const many = dragIn(name, 4);
            expect(many).toHaveLength(once.length);
            many.forEach((p, i) => {
                // A metre of slack, for the round trip through lon/lat the settle makes.
                expect(Math.hypot(p[0] - once[i][0], p[1] - once[i][1])).toBeLessThan(1);
            });
        });

        it('puts the grabbed point where the pointer left it, either way', () => {
            for (const steps of [1, 4]) {
                const after = dragIn(name, steps);
                expect(Math.hypot(after[0][0] - TO[0], after[0][1] - TO[1])).toBeLessThan(1);
            }
        });

        it('releases the latch, so a second drag reads the shape the first one left', () => {
            const c = build(name);
            c.handleVertexDrag!(0, TO);
            c.endGesture();
            const afterFirst = (c.graphic.base.getGeometry() as LineString).getCoordinates();
            c.handleVertexDrag!(0, [TO[0], TO[1] + 50_000]);
            c.endGesture();
            const afterSecond = (c.graphic.base.getGeometry() as LineString).getCoordinates();
            expect(afterSecond[0][1] - afterFirst[0][1]).toBeGreaterThan(40_000);
        });
    },
);
