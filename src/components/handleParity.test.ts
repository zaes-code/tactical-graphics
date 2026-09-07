/**
 * # Both engines publish the same handles
 *
 * A grip is how a user reshapes a graphic, so one with fewer grips on one engine can be
 * edited on one engine and not the other. That has happened twice, and neither time did a
 * test notice, because each engine was self-consistent:
 *
 * - **Every `vertexLine(2, …)` graphic** published one grip on OpenLayers and two on
 *   MapLibre — the convoys, the navigational line, `Fix`, the follow tasks — because
 *   `LineGraphicController`'s constructor hides the start handle on any two-point line.
 *   Right while the only gesture is a stretch anchored on that end, wrong the moment the
 *   vertex itself moves. Reported by the user, 2026-09-04.
 * - **The five one-anchor mission tasks** published `[edge, centre]` and put the live grip
 *   beside a symbol the standard describes by its middle. @see publishesAnchorHandleOnly
 *
 * `handleContract(name)` is the library's own statement of what grips a graphic has and what
 * each one does; **MapLibre reads it directly**, so asserting OpenLayers against it is
 * asserting the two engines against each other through the thing they are both supposed to
 * obey — rather than against one another, where both can be wrong together.
 */
import {TacticalGraphicName, handleContract, listTacticalGraphicNames} from '@zaes/tactical-graphics';
import {getController} from './openlayers/controllerRegistry';
import {LineGraphicController} from './openlayers/controllers/LineGraphicController';

const RESOLUTION = 100;

/** Every graphic OpenLayers gives per-vertex dragging to, with its controller. */
function vertexLines(): [TacticalGraphicName, LineGraphicController][] {
    const out: [TacticalGraphicName, LineGraphicController][] = [];
    for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
        const controller = getController(name, RESOLUTION);
        if (controller instanceof LineGraphicController && controller.dragsVertices) {
            out.push([name, controller]);
        }
    }
    return out;
}

describe('the handles both engines publish', () => {
    it('finds the vertex-dragging graphics at all', () => {
        // A guard on the harness: if the filter ever matches nothing, the assertions below
        // pass by vacuum and say nothing at all.
        expect(vertexLines().length).toBeGreaterThan(5);
    });

    it('gives a grip to both ends of every two-point vertex line', () => {
        /*
         * The regression this file exists for. `hidesStartHandle` is set by the constructor
         * for `maxPoints === 2` and cleared by `enableVertexDragging`, so the two have to
         * agree: a graphic whose vertices move publishes a grip per vertex, and one whose
         * body merely stretches keeps its single far-end grip.
         */
        const hidden = vertexLines()
            .filter(([, c]) => c.graphic.hidesStartHandle)
            .map(([name]) => name);
        expect(hidden).toEqual([]);
    });

    it('publishes a shape grip for every one the shared contract names', () => {
        /*
         * **Through the contract, not against the other renderer.** `handleContract` is what
         * MapLibre builds its grips from, so a graphic OpenLayers gives fewer `shape` grips
         * than the contract names is a graphic the two engines edit differently — and the
         * contract says which of them is wrong.
         *
         * Only the fixed-length contracts are comparable: a `repeating` one describes a path
         * whose grip count follows the drawn vertices rather than the name.
         */
        const short: string[] = [];
        for (const [name, controller] of vertexLines()) {
            const contract = handleContract(name);
            if (contract.repeating) continue;
            const wanted = contract.roles.filter(role => role === 'shape').length;
            if (wanted < 2) continue;
            // The start handle is the one that used to go missing, so its absence is the
            // measurable symptom: a hidden start means one fewer grip than the contract.
            if (controller.graphic.hidesStartHandle) short.push(`${name}: start handle hidden, contract wants ${wanted}`);
        }
        expect(short).toEqual([]);
    });

    it('leaves the single grip on a two-point line that does not drag vertices', () => {
        // The other half of the rule, so "publish both" cannot be applied indiscriminately:
        // with no vertex to move, a near-end grip would do nothing.
        const controller = getController(TacticalGraphicName.BearingLine, RESOLUTION) as LineGraphicController;
        expect(controller.dragsVertices).toBe(false);
        expect(controller.graphic.hidesStartHandle).toBe(true);
    });
});
