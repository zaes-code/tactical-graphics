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
     */
    it('overrides a radius and a width that arrive with the description', () => {
        const built = buildTacticalGraphic(
            TacticalGraphicName.Disrupt,
            LINE,
            {radius: 999_000, width: 999_000},
            RES,
        );
        expect(built!.properties.radius).toBeUndefined();
        expect(built!.properties.width).toBeUndefined();
        expect(built!.properties.decorationSize).toBeGreaterThan(0);
    });

    /** The families that genuinely have rails keep theirs. */
    it.each([TacticalGraphicName.AirCorridor, TacticalGraphicName.Bridge, TacticalGraphicName.MainAxisOfAdvance])(
        'still gives %s its width',
        name => {
            expect(buildTacticalGraphic(name, LINE, {}, RES)!.properties.width).toBeGreaterThan(0);
        },
    );
});
