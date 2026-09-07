/**
 * # Which vertex is inert is one fact, and both engines must read it from one place
 *
 * `anchorVertex(name)` says which base vertex a *reshape* refuses to move — the point the
 * symbol is built about, so dragging it would bend the figure around its own origin instead
 * of scaling it. MapLibre reads that table and nothing else.
 *
 * OpenLayers used to state it a second way: `enableVertexDragging(min, anchor)` took the
 * index as a literal, and eleven registry entries supplied one while the portable table
 * listed four names. The two sets barely overlapped, so on eight graphics a vertex was inert
 * on one engine and draggable on the other — the same grip, the same symbol, different
 * behaviour depending on which renderer the host happened to load:
 *
 * - **343000 capture, 342300 seize, 344500 evacuate, 344600 recover, 343600 escort and
 *   272100's zone** each declared point 1 here and were absent from the table. Their plates
 *   agree with the declaration — *"point 1 defines the centre of the circle"*, *"the centre
 *   of the graphic"*, *"the centre point defines the centre of the symbol"* — so the answer
 *   was right and its address was wrong. They are in the table now.
 * - **272101's multiple-strike zone and 343700 exfiltrate** declared one that their plates do
 *   not support. 272101 numbers no centre at all; 343700's point 1 is *"the end of the
 *   straight line portion of the graphic"*, so making it inert took away the only grip that
 *   sets the run it defines — the obstacle bypasses' defect of 2026-09-06, one graphic over.
 *   Both declarations are gone.
 * - **341900 relief in place** was the reverse: the table lists its derived fourth point and
 *   the registry never passed one, so OpenLayers let a reshape drag a point that carries no
 *   decision.
 *
 * The literal is gone. `enableVertexDragging` asks the library, so the engines now agree by
 * construction; this suite is what stops the second statement coming back.
 *
 * @see ai/conventions.md — "A symbology fact never lives in a holder"
 */
import {anchorVertex, baseVertexCount, listTacticalGraphicNames, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './openlayers/controllerRegistry';

const RES = 1200;

/** What the OpenLayers controller will actually refuse to drag, if anything. */
function openLayersAnchor(name: TacticalGraphicName): number | undefined {
    return (getController(name, RES) as unknown as {anchorVertex?: number}).anchorVertex;
}

const NAMES = listTacticalGraphicNames() as TacticalGraphicName[];

describe('the inert vertex is stated once', () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s reads its anchor off the library', (_label, name) => {
        expect(openLayersAnchor(name)).toBe(anchorVertex(name));
    });

    it('really does mark some graphics, rather than agreeing on nothing', () => {
        // The assertion above passes trivially if every answer is `undefined`, which is what
        // it would look like if `enableVertexDragging` stopped reading the table at all.
        const marked = NAMES.filter(n => anchorVertex(n) !== undefined);
        expect(marked.length).toBeGreaterThanOrEqual(10);
        expect(marked.filter(n => openLayersAnchor(n) !== undefined)).toHaveLength(marked.length);
    });

    it.each(NAMES.filter(n => anchorVertex(n) !== undefined).map(n => [String(n), n] as const))(
        '%s names an index its own base actually has',
        (_label, name) => {
            // An anchor past the end is inert on nothing: it would read as "no anchor" while
            // looking deliberate, and a graphic whose point count later shrank would lose the
            // protection silently.
            const index = anchorVertex(name)!;
            const stored = baseVertexCount(name);
            expect(index).toBeGreaterThanOrEqual(0);
            if (stored !== undefined) expect(index).toBeLessThan(stored);
        },
    );

    it('marks the six centre-anchored mission tasks their plates name', () => {
        // Pinned by name because the reading is the point: each of these plates calls point 1
        // the centre, and that is why it is inert. A future edit that drops one should have to
        // say so here.
        for (const name of [
            TacticalGraphicName.Capture,
            TacticalGraphicName.Seize,
            TacticalGraphicName.Evacuate,
            TacticalGraphicName.Recover,
            TacticalGraphicName.Escort,
            TacticalGraphicName.MinimumSafeDistanceZone,
        ]) {
            expect(anchorVertex(name)).toBe(0);
        }
    });

    it('leaves the graphics whose plates name no origin free to reshape', () => {
        // Every point of these carries a decision the operator should be able to change.
        for (const name of [
            TacticalGraphicName.MinimumSafeDistanceMultipleStrike,
            TacticalGraphicName.Exfiltrate,
            TacticalGraphicName.ObstacleBypassEasy,
            TacticalGraphicName.ObstacleBypassDifficult,
            TacticalGraphicName.ObstacleBypassImpossible,
        ]) {
            expect(anchorVertex(name)).toBeUndefined();
            expect(openLayersAnchor(name)).toBeUndefined();
        }
    });
});
