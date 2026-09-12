/**
 * # This engine files a width only where a width means something
 *
 * `sizeDefaults` used to stamp the generic 20-px half-width on every graphic that had not
 * been handed one, and then refuse it family by family as each refusal was paid for: the
 * block family's bar, the demolition block's third point, the range-band symbols, the
 * multiple-strike standoff, the eleven axis arrows. Five exceptions, one rule underneath
 * them, and 250 graphics still being handed a number their generator never reads.
 *
 * That is what the sample sweep reported as a **bag difference on 259 graphics**: this
 * engine's snapshot echoed the width its own build had invented, while OpenLayers rebuilt
 * its bag from a holder that owns no such number. No geometry differed, which is why it
 * survived two releases — the cost is a figure nobody typed riding into a saved file, where
 * a restore can pick it up and spend it as something else. That has happened: a block drawn
 * here at 60 px came back at 20 on the other engine.
 *
 * So the rule is now `shapedByWidth`, measured in `shapedByWidth.test.ts` against what the
 * generators actually read. This suite is the renderer half: that the door honours it.
 */

import {TacticalGraphicName, shapedByWidth, usesStandoffWidth, listTacticalGraphicNames} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from './maplibreAdapter';

const RES = 2445.98;
const LINE = {type: 'LineString' as const, coordinates: [[0, 0], [3, 0]]};
const POLYGON = {type: 'Polygon' as const, coordinates: [[[0, 0], [3, 0], [3, 2], [0, 2], [0, 0]]]};
const POINT = {type: 'Point' as const, coordinates: [0, 0]};

/** A base of the right kind, so the build is not refused for an unrelated reason. */
function baseFor(name: TacticalGraphicName) {
    const built = buildTacticalGraphic(name, LINE, {}, RES)
        ?? buildTacticalGraphic(name, POLYGON, {}, RES)
        ?? buildTacticalGraphic(name, POINT, {radius: 40_000, rotation: 0}, RES);
    return built;
}

const NAMES = listTacticalGraphicNames() as TacticalGraphicName[];

describe('the width a build files', () => {
    it.each(NAMES.filter(name => !shapedByWidth(name)).map(name => [String(name), name] as const))(
        'is absent for %s, whose shape does not read one',
        (_label, name) => {
            const built = baseFor(name);
            // A graphic that cannot be built from any of the three plain bases has nothing to
            // say here; the ones that can must not carry an invented width.
            if (!built) return;
            expect(built.properties.width).toBeUndefined();
        },
    );

    it.each([
        TacticalGraphicName.AirCorridor,
        TacticalGraphicName.LowLevelTransitRoute,
        TacticalGraphicName.SafeLane,
        TacticalGraphicName.TransitCorridor,
    ])('is still seeded for %s, whose rails stand off by half of it', name => {
        expect(buildTacticalGraphic(name, LINE, {}, RES)!.properties.width).toBeGreaterThan(0);
    });

    /**
     * The one graphic that is shaped by its width and still takes no default. For the
     * multiple-strike zone the *absence* of a width is the legacy two-ring description
     * saying it carries both rings itself; inventing one made the generator read those
     * points as a single traced ring and the symbol came back a self-crossing star.
     */
    it('leaves the multiple-strike standoff alone, which reads a width and must not be given one', () => {
        const name = TacticalGraphicName.MinimumSafeDistanceMultipleStrike;
        expect(shapedByWidth(name)).toBe(true);
        expect(usesStandoffWidth(name)).toBe(true);
        expect(buildTacticalGraphic(name, LINE, {}, RES)!.properties.width).toBeUndefined();
    });

    /** A width the caller states is the caller's, whatever the rule says about defaults. */
    it('never overwrites a supplied width', () => {
        const supplied = buildTacticalGraphic(TacticalGraphicName.PhaseLine, LINE, {width: 12_345}, RES);
        expect(supplied!.properties.width).toBe(12_345);
    });
});
