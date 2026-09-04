/**
 * # How long a draw runs is not what shape the base is
 *
 * Six graphics are drawn **centre to edge**: two clicks, the first planting the anchor and
 * the second saying how far out it reaches. OpenLayers gives each a `Circle` interaction,
 * which ends itself on the second click, and the picker's own hint promises "2 points
 * (center → edge)".
 *
 * Their *bases* are `LineString`s of derived anchor points, so MapLibre — which decides how
 * long a draw runs from `baseGeometryFor` — put them on the multi-click path and waited for
 * a double-click nobody is told to make. **Two clicks left the sketch open and nothing on
 * the map.** `Contain` drew nothing at all on that engine; found by drawing it on both
 * side by side, 2026-09-04.
 *
 * This is the second time the same distinction has cost something — the demonstration is
 * the first, and `dropSizePx` is its answer — so the guard is written against the property
 * rather than against the six names: **whatever OpenLayers ends on the second click, the
 * library has to say so.**
 */
import {TacticalGraphicName, drawsCentreToEdge, dropSizePx, listTacticalGraphicNames, usesDrawnAnchors} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {MissionTaskController, PointDropController} from './controllers/MissionTaskController';

const RESOLUTION = 2445.98;

/** Every name the enum carries, as a drawable list. */
const names = (listTacticalGraphicNames() as TacticalGraphicName[])
    .filter((name): name is TacticalGraphicName => name in TacticalGraphicName);

/** What OpenLayers actually draws with, for the graphics that have a controller. */
function drawsWithACircle(name: TacticalGraphicName): boolean {
    let controller;
    try {
        controller = getController(name, RESOLUTION);
    } catch {
        return false;
    }
    /*
     * **`PointDropController` extends `MissionTaskController`**, and its `geomHandleType` is
     * `Circle` too — so an `instanceof MissionTaskController` alone counts the demonstration
     * as a two-click draw when it is a one-click drop. Excluded by the *controller*, not by
     * `dropSizePx`: filtering on that would make this assertion restate the definition of
     * `drawsCentreToEdge` back to itself and check nothing.
     */
    if (controller instanceof PointDropController) return false;
    return controller instanceof MissionTaskController && controller.geomHandleType === 'Circle';
}

describe('a centre-to-edge draw is a library fact', () => {
    it('names the six the standard describes by anchor points, less the one that is dropped', () => {
        expect(names.filter(drawsCentreToEdge).sort()).toEqual([
            TacticalGraphicName.Ambush,
            TacticalGraphicName.Contain,
            TacticalGraphicName.Envelopment,
            TacticalGraphicName.Pursuit,
            TacticalGraphicName.TacticalTurn,
            TacticalGraphicName.Turn,
        ].sort());
    });

    it('excludes the demonstration, which is dropped whole on one click', () => {
        // Its base is four derived anchors, so it is in `DRAWN_ANCHOR_GRAPHICS` — and it is
        // still a one-click drop. The two questions are separate. @see dropSizePx
        expect(usesDrawnAnchors(TacticalGraphicName.Demonstration)).toBe(true);
        expect(dropSizePx(TacticalGraphicName.Demonstration)).toBeDefined();
        expect(drawsCentreToEdge(TacticalGraphicName.Demonstration)).toBe(false);
    });

    it('is true for every anchor graphic OpenLayers ends on the second click', () => {
        /*
         * The assertion that would have caught it. OpenLayers' `Circle` interaction ends
         * itself on the second click; anything drawn that way and *not* flagged here is a
         * graphic MapLibre will leave in an unfinishable sketch.
         *
         * Restricted to the anchor family: the circular areas and the mission tasks are
         * drawn with a Circle too, but their base is a `Point`, and MapLibre's `Point`
         * branch already ends them on the second click. It is the `LineString`-based ones
         * that fall through.
         */
        const missing = names
            .filter(usesDrawnAnchors)
            .filter(drawsWithACircle)
            .filter(name => !drawsCentreToEdge(name));
        expect(missing).toEqual([]);
    });

    it('is false for everything that is not an anchor graphic', () => {
        const stray = names.filter(name => drawsCentreToEdge(name) && !usesDrawnAnchors(name));
        expect(stray).toEqual([]);
    });
});
