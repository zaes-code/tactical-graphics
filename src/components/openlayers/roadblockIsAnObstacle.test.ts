/**
 * # A paint registered for a graphic has to reach it, without a second list saying so
 *
 * 271204 is an obstacle — APP-06 8.1.4.3 colours it green, and `OBSTACLE_GRAPHICS` has listed
 * it all along — and it drew in the host's default line colour on OpenLayers while its three
 * siblings drew green. Nothing was wrong with the symbology: `getPaintFunction` had been
 * handing MapLibre the green the whole time, which is why the generated thumbnail is green.
 *
 * The holder picked its style from a chain of names written out by hand, and a graphic
 * matching none of them fell through to `createFeature`'s default. **Registering a paint
 * should take one edit, not two.** The holder asks the registry first now and lets the named
 * branches below override it, so the fix covers every family rather than the one that was
 * reported — the first attempt added a `drawsAsBarSymbol` predicate and a fourth name to a
 * hand-written list, which is the same shape of statement that caused the defect.
 *
 * (User's report, 2026-09-13: *"roadblock is an obstacle, needs the obstacle green"*, and then
 * *"drop the drawsAsBarSymbol export and use getPaintFunction instead"*.)
 */
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import type {StyleFunction} from 'ol/style/Style';
import {
    OBSTACLE_GRAPHICS,
    TacticalGraphicName,
    getObstacleColor,
    getPaintFunction,
    listTacticalGraphicNames,
} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

const RES = 1200;

/** The four that draw as a stack of leaning bars, named here because a test may name things. */
const BAR_SYMBOLS = [
    TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
    TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
    TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
    TacticalGraphicName.RoadblockCompleteExecuted,
];

type WithGraphic = {
    graphic: {graphic: Feature; updateGeom?(state: {size: number; center: number[]; rotation: number}): void};
    setBaseFeature(base: Feature<LineString>): void;
};

/**
 * Every stroke colour the holder's own line work resolves to.
 *
 * **The family spans two holders**, which is half of why the membership drifted: the three
 * readiness states are drawn lines on `MovementGraphicBase` and the roadblock is dropped on
 * `MissionTaskGraphicBase`. So this seeds whichever way the holder accepts.
 */
function strokeColors(name: TacticalGraphicName): string[] {
    const controller = getController(name, RES) as unknown as WithGraphic;
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

describe('the bar-symbol family draws in the obstacle colour', () => {
    it.each(BAR_SYMBOLS)('%s is an obstacle the standard colours green', name => {
        expect(OBSTACLE_GRAPHICS.has(name)).toBe(true);
    });

    it.each(BAR_SYMBOLS)('%s strokes its line work in that colour', name => {
        const colors = strokeColors(name);
        expect(colors.length).toBeGreaterThan(0);
        expect(colors).toContain(getObstacleColor());
    });
});

describe('a registered paint reaches the graphic without a second list', () => {
    it('the roadblock has an entry, which is what the holder now asks for', () => {
        expect(getPaintFunction(TacticalGraphicName.RoadblockCompleteExecuted)?.graphic).toBeDefined();
    });

    it('every point-anchored graphic the registry paints resolves a style', () => {
        /*
         * The general form of the defect: a graphic on this holder with a registered paint and
         * no branch of its own used to get the default line work instead. Walking the whole
         * family is what makes that unrepeatable.
         */
        const unstyled: string[] = [];
        for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
            if (!getPaintFunction(name)?.graphic) continue;
            let controller;
            try {
                controller = getController(name, RES) as unknown as WithGraphic;
            } catch {
                continue;
            }
            if (!controller.graphic?.graphic || !controller.graphic.updateGeom) continue;
            if (!controller.graphic.graphic.getStyleFunction()) unstyled.push(name);
        }
        expect(unstyled).toEqual([]);
    });
});
