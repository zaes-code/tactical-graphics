/**
 * # A paint registered for a family has to reach the family on both engines
 *
 * 271204 is an obstacle — APP-06 8.1.4.3 colours it green, and `OBSTACLE_GRAPHICS` has listed
 * it all along — and it drew in the draw-marker grey on OpenLayers while its three siblings
 * drew green. Nothing was wrong with the symbology: the shared paint had been giving it green
 * the whole time, which is why its own generated thumbnail is green.
 *
 * The holder picked its style from three names written out by hand, and when the roadblock
 * joined the family in the paint registry it did not join that list. **Registering a paint
 * takes two edits**, and this is the second one going missing. The holder asks
 * `drawsAsBarSymbol` now, so there is one membership rather than two.
 *
 * (User's report, 2026-09-13: *"roadblock is an obstacle, needs the obstacle green"*.)
 */
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import type {StyleFunction} from 'ol/style/Style';
import {
    OBSTACLE_GRAPHICS,
    TacticalGraphicName,
    drawsAsBarSymbol,
    getObstacleColor,
    listTacticalGraphicNames,
} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

const RES = 1200;
const FAMILY = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(drawsAsBarSymbol);

/**
 * Every stroke colour the holder's own line work resolves to.
 *
 * **The family spans two holders**, which is half of why the membership drifted: the three
 * readiness states are drawn lines on `MovementGraphicBase` and the roadblock is dropped on
 * `MissionTaskGraphicBase`. So this seeds whichever way the holder accepts.
 */
function strokeColours(name: TacticalGraphicName): string[] {
    const controller = getController(name, RES) as unknown as {
        graphic: {graphic: Feature; updateGeom?(state: {size: number; center: number[]; rotation: number}): void};
        setBaseFeature(base: Feature<LineString>): void;
    };
    if (controller.graphic.updateGeom) controller.graphic.updateGeom({size: 40_000, center: [0, 0], rotation: 0});
    else controller.setBaseFeature(new Feature(new LineString([[0, 0], [80_000, 0], [40_000, -30_000]])) as never);
    const feature = controller.graphic.graphic;
    const style = feature.getStyleFunction() as StyleFunction | undefined;
    const resolved = style ? style(feature, RES) : feature.getStyle();
    const list = Array.isArray(resolved) ? resolved : [resolved];
    return list
        .map(entry => (entry as {getStroke?(): {getColor(): unknown} | null} | undefined)?.getStroke?.()?.getColor?.())
        .filter((colour): colour is string => typeof colour === 'string');
}

describe('the bar-symbol family is one membership', () => {
    it('is the three readiness states and the executed roadblock', () => {
        expect(FAMILY).toHaveLength(4);
        expect(FAMILY).toContain(TacticalGraphicName.RoadblockCompleteExecuted);
        expect(FAMILY).toContain(TacticalGraphicName.ExplosivesPlannedStateOfReadiness);
    });

    it('is not the same list as the one saying which bar is broken', () => {
        // `BAR_SYMBOL_DASHES` has three entries: nothing dashes on the roadblock. Reading it
        // as the membership is the mistake one level along from the one this suite is about.
        expect(FAMILY.filter(name => name !== TacticalGraphicName.RoadblockCompleteExecuted)).toHaveLength(3);
    });

    it.each(FAMILY)('%s is an obstacle the standard colours green', name => {
        expect(OBSTACLE_GRAPHICS.has(name)).toBe(true);
    });

    it.each(FAMILY)('%s strokes its line work in the obstacle colour', name => {
        const colours = strokeColours(name);
        expect(colours.length).toBeGreaterThan(0);
        expect(colours).toContain(getObstacleColor());
    });
});
