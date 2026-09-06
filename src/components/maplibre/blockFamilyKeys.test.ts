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
     * The ratio-locked members derive their size from the base length on every build, so
     * a `radius` filed beside it would be a second, staler answer to the same question.
     */
    it.each(FAMILY.filter(name => ratioLockOf(name) !== undefined))('files no radius — %s', name => {
        expect(buildTacticalGraphic(name, LINE, {}, RES)!.properties.radius).toBeUndefined();
    });

    /**
     * **And a stale one from a snapshot cannot win.** That is why the derivation is spread
     * after the caller's properties: it answers the question outright rather than deferring
     * to whatever a file happened to carry.
     *
     * Asserted on the one member still ratio-locked. It used to read `Disrupt`, which left
     * `RATIO_LOCK` on 2026-09-06 along with support by fire and the four brackets — and
     * `ratioLockedSize` is what does the clearing, so only a locked name still does it.
     */
    it('overrides a radius and a width that arrive with the description', () => {
        expect(ratioLockOf(TacticalGraphicName.AttackByFire)).toBeDefined();
        const built = buildTacticalGraphic(
            TacticalGraphicName.AttackByFire,
            LINE,
            {radius: 999_000, width: 999_000},
            RES,
        );
        expect(built!.properties.radius).toBeUndefined();
        expect(built!.properties.width).toBeUndefined();
        expect(built!.properties.decorationSize).toBeGreaterThan(0);
    });

    /**
     * **A member whose points are placed does not need the clearing, because the numbers are
     * inert.** Nothing derives its shape from `radius` or `width` any more — the base carries
     * the anchor points the plate names — so a stale pair riding in from an old snapshot
     * changes no ink. That is the guarantee that replaced the guard, and it is the stronger
     * of the two: the old one depended on a lock that had to be remembered.
     */
    it.each([TacticalGraphicName.Disrupt, TacticalGraphicName.SupportByFire, TacticalGraphicName.Breach])(
        'draws the same symbol whatever stale size rides along — %s',
        name => {
            const points = {
                [TacticalGraphicName.Disrupt]: [[0, 0.05], [0, -0.05], [0.08, 0]],
                [TacticalGraphicName.SupportByFire]: [[-0.05, 0], [0.05, 0], [-0.07, 0.12], [0.07, 0.12]],
                [TacticalGraphicName.Breach]: [[0, 0.05], [0, -0.05], [0.08, 0]],
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
