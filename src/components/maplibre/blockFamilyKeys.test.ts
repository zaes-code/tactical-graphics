/**
 * # A bar across a line is a decoration, and is filed as one
 *
 * The block family — Block, its table 5-19 twin, and the ratio-locked six — is a line with
 * a bar across it, and that bar's size is the graphic's `decorationSize`. The OpenLayers
 * holder files exactly that and nothing else.
 *
 * MapLibre filed two more keys beside it. `ratioLockedSize` wrote its answer as `radius`
 * as well, which means "how far does this reach" and which `toGraphicOptions` *prefers*
 * over `decorationSize` when both are present; and `sizeDefaults` handed every drawn
 * graphic the generic 20 px offset as a `width`, which a block does not have.
 *
 * The second one was not cosmetic. OpenLayers' restore replays `width` as the bar's size,
 * so a block drawn on MapLibre at 60 px came back on OpenLayers at **20** — the same
 * symbol, a third of the size, from a number neither engine renders from directly.
 */

import {TacticalGraphicName, ratioLockOf} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from './maplibreAdapter';

const RES = 2445.98;
const LINE = {type: 'LineString' as const, coordinates: [[0, 0], [3, 0]]};

const FAMILY = [
    TacticalGraphicName.Block,
    TacticalGraphicName.TacticalBlock,
    TacticalGraphicName.Disrupt,
    TacticalGraphicName.TacticalDisrupt,
    TacticalGraphicName.Breach,
    TacticalGraphicName.Bypass,
    TacticalGraphicName.Canalize,
    TacticalGraphicName.Clear,
    TacticalGraphicName.AttackByFire,
    TacticalGraphicName.SupportByFire,
];

describe('what the block family files', () => {
    it.each(FAMILY)('is a decoration size and no width — %s', name => {
        const built = buildTacticalGraphic(name, LINE, {}, RES);

        expect(built).toBeDefined();
        expect(built!.properties.decorationSize).toBeGreaterThan(0);
        expect(built!.properties.width).toBeUndefined();
    });

    /**
     * **The family has no ratio-locked member left, and that is the assertion now.**
     *
     * A lock says the aspect ratio is not the operator's to set, and every one of these
     * plates gives the two dimensions their own anchor points. They came off in three
     * batches over 2026-09-06 — the four brackets and support by fire, then disrupt, then
     * 152000 attack by fire, which was the last. Written as an emptiness rather than deleted,
     * because a lock returning to this family would be a real regression and nothing else
     * here would notice it.
     */
    it('has no ratio-locked member left', () => {
        expect(FAMILY.filter(name => ratioLockOf(name) !== undefined)).toEqual([]);
    });

    it.each(FAMILY)('files no radius, because none of them derives a size any more — %s', name => {
        expect(buildTacticalGraphic(name, LINE, {}, RES)!.properties.radius).toBeUndefined();
    });

    /**
     * **A stale radius no longer has to be cleared, because it can no longer win.**
     *
     * This used to assert the clearing `ratioLockedSize` performs, on whichever member was
     * still locked — `Disrupt`, then `AttackByFire`. None is locked now, so nothing clears
     * anything and the number rides through into the description. That is not a regression:
     * the guarantee moved from *removing* the number to it having nothing to act on, which
     * the test below measures as ink. Kept as a live check that the clearing really is gone,
     * since a lock creeping back would restore it silently.
     */
    it('lets a stale radius ride along, having nothing left to clear it', () => {
        expect(ratioLockOf(TacticalGraphicName.AttackByFire)).toBeUndefined();
        const built = buildTacticalGraphic(
            TacticalGraphicName.AttackByFire,
            LINE,
            {radius: 999_000, width: 999_000},
            RES,
        );
        // **Both ride through**, where the lock used to strip them. Neither reaches the ink —
        // that is what the test below measures, on this graphic among others — so what is
        // left is a description carrying two numbers nothing reads. Asserted rather than
        // tidied: they are exactly the sort of stale field that becomes a second answer if
        // something later starts reading it. @see carriesSeparationInBase
        expect(built!.properties.radius).toBe(999_000);
        expect(built!.properties.width).toBe(999_000);
        // `decorationSize` is deliberately not asserted here. It is stamped when the caller
        // supplies nothing — the first test in this file measures that — and a description
        // arriving with its own numbers takes a different path through the adapter. Which
        // number ends up filed does not matter while none of them reaches the ink.

    });

    /**
     * **A member whose points are placed does not need the clearing, because the numbers are
     * inert.** Nothing derives its shape from `radius` or `width` any more — the base carries
     * the anchor points the plate names — so a stale pair riding in from an old snapshot
     * changes no ink. That is the guarantee that replaced the guard, and it is the stronger
     * of the two: the old one depended on a lock that had to be remembered.
     */
    it.each([TacticalGraphicName.Disrupt, TacticalGraphicName.SupportByFire, TacticalGraphicName.Breach,
        TacticalGraphicName.AttackByFire])(
        'draws the same symbol whatever stale size rides along — %s',
        name => {
            const points = {
                [TacticalGraphicName.Disrupt]: [[0, 0.05], [0, -0.05], [0.08, 0]],
                [TacticalGraphicName.SupportByFire]: [[-0.05, 0], [0.05, 0], [-0.07, 0.12], [0.07, 0.12]],
                [TacticalGraphicName.Breach]: [[0, 0.05], [0, -0.05], [0.08, 0]],
                // 152000's own three: the tip, then the back line's two ends.
                [TacticalGraphicName.AttackByFire]: [[0.08, 0], [0, 0.05], [0, -0.05]],
            }[name as string]!;
            const base = {type: 'LineString' as const, coordinates: points};
            const clean = buildTacticalGraphic(name, base, {}, RES);
            const stale = buildTacticalGraphic(name, base, {radius: 999_000, width: 999_000}, RES);
            // The *ink*, not the bag: a stale snapshot still carries its old `radius` and
            // `width` in `properties`, and the point is precisely that nothing reads them.
            expect(JSON.stringify(stale!.graphic.geometry)).toEqual(JSON.stringify(clean!.graphic.geometry));
        },
    );

    /** The families that genuinely have rails keep theirs. */
    it.each([TacticalGraphicName.AirCorridor, TacticalGraphicName.Bridge, TacticalGraphicName.MainAxisOfAdvance])(
        'still gives %s its width',
        name => {
            expect(buildTacticalGraphic(name, LINE, {}, RES)!.properties.width).toBeGreaterThan(0);
        },
    );
});
