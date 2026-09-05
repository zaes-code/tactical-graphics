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
import {TacticalGraphicName, drawsByAnchorClicks, drawsCentreToEdge, drawsEndToEnd, drawsInTwoClicks, dropSizePx, frameFromDrag, listTacticalGraphicNames, usesDrawnAnchors}
    from '@zaes/tactical-graphics';
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
    /*
     * **`type`, not `geomHandleType`.** The question here is what OpenLayers *draws* with,
     * and `type` is the field the manager hands to `new Draw(...)`; `geomHandleType` routes
     * the edit drags afterwards. They were the same value on every controller until
     * 2026-09-05, when the four placed point by point started drawing as lines while still
     * editing as point-anchored symbols — and reading the wrong one then counted them as
     * circle draws. @see AnchorClickController
     */
    return controller instanceof MissionTaskController && controller.type === 'Circle';
}

describe('a centre-to-edge draw is a library fact', () => {
    /**
     * **Nothing is drawn centre-to-edge any more, and that is the finished state.**
     *
     * The model existed because the anchor family's points were *derived* from a drag
     * rather than placed. Contain left on 2026-09-04, when a user reported that following
     * the Draw Rules produced a symbol twice the size they aimed at; the note in
     * `symbology.ts` recorded that the other five each needed their own plate read first.
     * That read happened on 2026-09-05 and all five moved: ambush, turn, tactical turn,
     * envelopment and pursuit are placed point by point now. @see drawsByAnchorClicks
     *
     * The predicate is kept rather than deleted because it is still the question the
     * renderers ask — and an empty answer is a fact worth pinning, so that a graphic
     * quietly falling back into the old model shows up here.
     */
    it('finds no graphic still drawn centre-to-edge', () => {
        expect(names.filter(drawsCentreToEdge)).toEqual([]);
    });

    it('accounts for every anchor graphic as dropped, end to end, or placed point by point', () => {
        const unaccounted = names
            .filter(usesDrawnAnchors)
            .filter(n => dropSizePx(n) === undefined && !drawsEndToEnd(n) && !drawsByAnchorClicks(n));
        expect(unaccounted).toEqual([]);
    });

    it('excludes contain, whose two clicks are the two points its plate marks', () => {
        /*
         * 151204's Draw Rules say it twice — *"Points 1 and 2 define the endpoints of the
         * semicircle's opening"* and *"Points 1 and 2 determine the diameter"* — and its
         * Template letters `PT. 1` and `PT. 2` against those two ends and nothing against
         * the centre. It was drawn centre-to-edge with the other five, which stored the
         * right anchors by a gesture the standard does not describe: a user following the
         * Draw Rules got a symbol twice the size, a quarter turn round.
         */
        expect(usesDrawnAnchors(TacticalGraphicName.Contain)).toBe(true);
        expect(drawsEndToEnd(TacticalGraphicName.Contain)).toBe(true);
        expect(drawsCentreToEdge(TacticalGraphicName.Contain)).toBe(false);
    });

    it('leaves the other five centre-to-edge, and that is a decision rather than an oversight', () => {
        // Each needs its own plate read before it moves; 141700's point 1 is an arrowhead
        // tip, which is a third answer again. @see DRAWN_END_TO_END
        for (const name of [
            TacticalGraphicName.Ambush,
            TacticalGraphicName.Envelopment,
            TacticalGraphicName.Pursuit,
            TacticalGraphicName.TacticalTurn,
            TacticalGraphicName.Turn,
        ]) {
            expect(drawsEndToEnd(name)).toBe(false);
        }
    });

    it('halves the reach and turns a quarter for an end-to-end drag, and passes a centre-to-edge one through', () => {
        /*
         * **The numbers, because a plausible frame is the failure mode.** A drag of 1000 m
         * at 30 degrees describes a contain whose centre is 500 m along that bearing, whose
         * size is 500 m, and whose rotation is 120 — the quarter turn that puts the two
         * clicks on the opening's ends. Getting the sign of that turn backwards mirrors the
         * `C`, which is a different symbol and a believable picture.
         */
        expect(frameFromDrag(TacticalGraphicName.Contain, 1000, 30)).toEqual({
            reach: 500,
            bearingDeg: 30,
            size: 500,
            rotation: 120,
        });
        expect(frameFromDrag(TacticalGraphicName.Turn, 1000, 30)).toEqual({
            reach: 0,
            bearingDeg: 30,
            size: 1000,
            rotation: 30,
        });
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
            .filter(name => !drawsCentreToEdge(name) && !drawsEndToEnd(name));
        expect(missing).toEqual([]);
    });

    it('ends every two-click anchor draw on the second click, however its clicks are read', () => {
        /*
         * **The assertion the regression walked straight past.** Contain left the
         * centre-to-edge list when its draw became end-to-end, and MapLibre was asking that
         * predicate whether to close the sketch — so it went back to waiting for a
         * double-click and drew nothing, while OpenLayers' own `Circle` interaction closed
         * itself and drew the symbol. One engine, silently.
         *
         * `drawsInTwoClicks` is the question that branch actually has, and it is derived from
         * the other two so a graphic joining either list is covered without a further edit.
         */
        for (const name of names.filter(usesDrawnAnchors).filter(drawsWithACircle)) {
            expect(drawsInTwoClicks(name)).toBe(true);
        }
        expect(drawsInTwoClicks(TacticalGraphicName.Contain)).toBe(true);
        // ...and it is still false for the one-click drop, which is the other half.
        expect(drawsInTwoClicks(TacticalGraphicName.Demonstration)).toBe(false);
    });

    it('is false for everything that is not an anchor graphic', () => {
        const stray = names.filter(name => drawsCentreToEdge(name) && !usesDrawnAnchors(name));
        expect(stray).toEqual([]);
    });
});
