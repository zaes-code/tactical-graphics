/**
 * # Obstacles draw green, and green beats affiliation
 *
 * APP-06 8.1.4.3: *"Obstacles and obstructions as shown in this chapter (friendly, hostile,
 * neutral, unknown, or factional) are to be drawn using the colour green. However, if the
 * colour green is not available obstacles are to be drawn using black."*
 *
 * The library drew every obstacle in the affiliation colour until 2026-09-07 — black
 * normally, red when hostile — which is the fallback the plate names for a display that
 * *cannot* show green, applied to displays that can.
 *
 * **Asserted as behaviour, never as the hex.** `expect(getObstacleColor()).toBe('#00FF00')`
 * would pass for whatever the constant held and prove nothing about which graphics get it
 * or what it beats. Everything below compares an obstacle against a non-obstacle, or the
 * same graphic against itself with the setting flipped.
 */
import {TacticalGraphicHostility, TacticalGraphicName, TacticalGraphicStatus} from '../core/type';
import {configureTacticalGraphics, resetTacticalGraphicsConfig} from '../core/config';
import {getColorByHostility, getDefaultLineColor} from '../core/symbology';
import {OBSTACLE_GRAPHICS, drawsAsObstacle} from '../core/obstacles';
import {affiliationColorOf, lineColorOf, plannedStatusRing} from './paintFunctions';
import type {PaintFeature} from '../core/paint';

const feature = (name: TacticalGraphicName, hostility?: TacticalGraphicHostility): PaintFeature =>
    ({geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]}, properties: {name, hostility}}) as PaintFeature;

/** One from each of the three code ranges, plus the FM-only member. */
const SAMPLE = [
    TacticalGraphicName.ObstacleZone, // 270200
    TacticalGraphicName.Block, // 270501
    TacticalGraphicName.Abatis, // 280100
    TacticalGraphicName.WireDoubleApronFence, // 290304
    TacticalGraphicName.ObstacleGroup, // FM 1-02.2 Table 5-19
];

afterEach(() => resetTacticalGraphicsConfig());

describe('the obstacle colour rule', () => {
    it('covers the 35 graphics the plates draw green, and not the category', () => {
        expect(OBSTACLE_GRAPHICS.size).toBe(35);
        // UXO area is filed under Areas, not Mobility, and is still an obstruction.
        expect(drawsAsObstacle(TacticalGraphicName.UnexplodedExplosiveOrdnanceArea)).toBe(true);
        // Mobility measures are not obstacles: a route is a thing you travel, not one
        // placed to stop someone. These four sit in the same category as the wire above.
        expect(drawsAsObstacle(TacticalGraphicName.Route)).toBe(false);
        expect(drawsAsObstacle(TacticalGraphicName.Bridge)).toBe(false);
        expect(drawsAsObstacle(TacticalGraphicName.ObstacleBypassEasy)).toBe(false);
        expect(drawsAsObstacle(TacticalGraphicName.MovingConvoy)).toBe(false);
        // Its green example is an optional sector-2 fill, not this rule. @see obstacles.ts
        expect(drawsAsObstacle(TacticalGraphicName.SeverelyRestrictedTerrain)).toBe(false);
    });

    it.each(SAMPLE)('draws %s in something other than the default line colour', name => {
        expect(lineColorOf(feature(name))).not.toBe(getDefaultLineColor());
    });

    it('beats affiliation, which is the part that contradicts the Standard Identities', () => {
        // The plate's parenthesis is exhaustive: friendly, hostile, neutral, unknown,
        // factional. Every one of them green, and the same green.
        const colors = [
            TacticalGraphicHostility.friend,
            TacticalGraphicHostility.hostileFaker,
            TacticalGraphicHostility.neutral,
            TacticalGraphicHostility.unknown,
        ].map(h => lineColorOf(feature(TacticalGraphicName.Block, h)));
        expect(new Set(colors).size).toBe(1);
        // …and specifically not the red a hostile graphic would otherwise take.
        expect(colors[1]).not.toBe(getColorByHostility(TacticalGraphicHostility.hostileFaker));
    });

    it('leaves a non-obstacle alone, hostile or not', () => {
        const phase = TacticalGraphicName.PhaseLine;
        expect(lineColorOf(feature(phase))).toBe(getDefaultLineColor());
        expect(lineColorOf(feature(phase, TacticalGraphicHostility.hostileFaker)))
            .toBe(getColorByHostility(TacticalGraphicHostility.hostileFaker));
    });

    it('falls back to the affiliation colour when the host turns the rule off', () => {
        // 8.1.4.3's own fallback — "if the colour green is not available" — so the off
        // state is a return to affiliation, not a second palette entry.
        //
        // Abatis, not Block: 270501 is an obstacle *and* one of the graphics FM 1-02.2
        // gives no amplifier fields, so with the rule off the older exemption takes it and
        // it draws unaffiliated whatever the bag says. That interaction is asserted below
        // rather than hidden by picking a graphic where the two agree.
        configureTacticalGraphics({obstacleColors: false});
        expect(lineColorOf(feature(TacticalGraphicName.Abatis))).toBe(getDefaultLineColor());
        expect(lineColorOf(feature(TacticalGraphicName.Abatis, TacticalGraphicHostility.hostileFaker)))
            .toBe(getColorByHostility(TacticalGraphicHostility.hostileFaker));
    });

    it('leaves an exempt obstacle unaffiliated with the rule off, not red', () => {
        // Block is both. Green covers it while the rule is on; with the rule off the
        // mission-task exemption is what remains, and that answer is unaffiliated.
        configureTacticalGraphics({obstacleColors: false});
        expect(lineColorOf(feature(TacticalGraphicName.Block, TacticalGraphicHostility.hostileFaker)))
            .not.toBe(getColorByHostility(TacticalGraphicHostility.hostileFaker));
    });

    it('lets a host choose its own green without switching the rule off', () => {
        // The boolean says whether, the palette entry says which. A host on a night display
        // softens the colour rather than losing the distinction.
        configureTacticalGraphics({obstacleColor: 'rgb(12,34,56)'});
        expect(lineColorOf(feature(TacticalGraphicName.Block))).toBe('rgb(12,34,56)');
    });

    it('is off entirely when both are set, because whether comes before which', () => {
        configureTacticalGraphics({obstacleColors: false, obstacleColor: 'rgb(12,34,56)'});
        expect(lineColorOf(feature(TacticalGraphicName.Block))).toBe(getDefaultLineColor());
    });

    it('leaves the planned-status ring out of it', () => {
        /*
         * 290400's plate carries two examples. The **Present** one is a green mine cluster.
         * The **Planned** one is the same green cluster inside a black dash-dot circle —
         * the ring says *planned*, not *obstacle*, so it takes the affiliation colour and
         * not 8.1.4.3's green. Reported 2026-09-07: "the outer circle (planned) should not
         * be green."
         */
        const planned = {
            geometry: {type: 'LineString', coordinates: [[0, 0], [1, 0]]},
            properties: {name: TacticalGraphicName.MineCluster, status: TacticalGraphicStatus.planned},
        } as unknown as PaintFeature;

        const ring = plannedStatusRing([{
            geometry: {type: 'LineString', coordinates: [[0, 0], [1, 0], [1, 1], [0, 1]]},
            stroke: {color: '#000', widthPx: 2},
        }], planned, {} as never);

        expect(ring).toBeDefined();
        expect(ring!.stroke!.color).toBe(affiliationColorOf(planned));
        expect(ring!.stroke!.color).not.toBe(lineColorOf(planned));
        // …while the symbol underneath it is still green.
        expect(lineColorOf(planned)).not.toBe(affiliationColorOf(planned));
    });

    it('ignores a stamped hostilityColor on an obstacle', () => {
        // A resolved affiliation colour must not get back in through the other door — the
        // same reason the mission-task exemption skips it.
        const stamped = {...feature(TacticalGraphicName.Block), hostilityColor: 'rgb(255,0,0)'} as PaintFeature;
        expect(lineColorOf(stamped)).not.toBe('rgb(255,0,0)');
    });
});
