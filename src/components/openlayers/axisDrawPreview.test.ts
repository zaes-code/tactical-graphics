/**
 * # What the operator sees while an axis arrow is still being clicked
 *
 * The eleven axis arrows keep their width as the **last** coordinate of their base, and a
 * sketch mid-draw is the same array of numbers as a settled base — a run of positions — so a
 * holder handed one cannot tell them apart. It read the coordinate under the cursor as a width
 * and the one before it as the tip, which cost the preview a click's worth of axis and drew the
 * arrow pinched to however far the cursor happened to be off the line. Measured on the running
 * app at three clicks: the preview's arrowhead sat on click 2 and its rails met, where the
 * symbol committed from the same clicks is 4,684 m wide and reaches click 3.
 *
 * > "It seems the end result is fine but what's wrong is the preview while drawing."
 * > "Only the openlayers preview is wrong, maplibre looks correct" — user, 2026-09-11
 *
 * MapLibre was right because its preview and its commit come through one function, which seeds
 * the width point onto everything the operator has clicked. This suite pins the same reading
 * here: **every sketch coordinate is an axis point, and the width is seeded, never consumed.**
 * @see MovementGraphicBase.setSketchBase, axisBaseFromDraw
 */
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import {fromLonLat, toLonLat} from 'ol/proj';
import type {DrawEvent} from 'ol/interaction/Draw';
import type {Position} from 'geojson';
import {
    DEFAULT_AXIS_HALF_WIDTH_PX,
    TacticalGraphicName,
    axisBaseFromDraw,
    axisOf,
    carriesWidthPointInBase,
    halfWidthFromBase,
    listTacticalGraphicNames,
    screenMeters,
} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

const FAMILY = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(carriesWidthPointInBase);

/** A zoom and a place to spend the pixel sizes at. */
const RESOLUTION = 300;
const LATITUDE = 40;

/** Three clicks with a bend in them, which is the shape the defect was visible on. */
const CLICKS: Position[] = [[0, 40], [1.4, 40.3], [2.9, 40.1]];

/**
 * The base a holder is left holding after a run of clicks arrives the way the draw interaction
 * delivers them — one `change` on the sketch geometry per click, coordinates and all.
 */
function baseAfterSketch(name: TacticalGraphicName, clicks: Position[]): Position[] {
    const controller = getController(name, RESOLUTION, LATITUDE);
    const sketch = new Feature(new LineString([] as number[][]));
    controller.onDrawStartFunc({feature: sketch} as unknown as DrawEvent);

    for (let i = 2; i <= clicks.length; i++) {
        sketch.getGeometry()!.setCoordinates(clicks.slice(0, i).map(c => fromLonLat(c as [number, number])));
    }

    const holder = (controller as unknown as {graphic: {base: Feature<LineString>}}).graphic;
    return holder.base.getGeometry()!.getCoordinates().map(c => toLonLat(c)) as Position[];
}

/** What MapLibre's preview builds from the same clicks, which is the figure to match. */
const seededBase = (name: TacticalGraphicName, clicks: Position[]): Position[] =>
    axisBaseFromDraw(name, clicks, screenMeters(DEFAULT_AXIS_HALF_WIDTH_PX, RESOLUTION, LATITUDE));

describe('an axis arrow previews every click it has been given', () => {
    it('has all eleven of them', () => {
        expect(FAMILY).toHaveLength(11);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s keeps three clicks as three axis points', (_label, name) => {
        const base = baseAfterSketch(name, CLICKS);

        // One more coordinate than was clicked: the clicks, plus the width.
        expect(base).toHaveLength(CLICKS.length + 1);
        axisOf(name, base).forEach((point, i) => {
            expect(point[0]).toBeCloseTo(CLICKS[i][0], 9);
            expect(point[1]).toBeCloseTo(CLICKS[i][1], 9);
        });
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s previews the width it will commit at', (_label, name) => {
        const stated = halfWidthFromBase(name, baseAfterSketch(name, CLICKS));
        const seeded = screenMeters(DEFAULT_AXIS_HALF_WIDTH_PX, RESOLUTION, LATITUDE);

        expect(stated).toBeDefined();
        // Within a millimetre of the 20 screen pixels both engines open one of these at. The
        // point is placed through a projected offset and read back geodesically, so the figure
        // is calibrated rather than exact. @see axisWithWidthPoint
        expect(stated!).toBeCloseTo(seeded, 3);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s previews what MapLibre previews', (_label, name) => {
        const here = baseAfterSketch(name, CLICKS);
        const there = seededBase(name, CLICKS);

        expect(here).toHaveLength(there.length);
        here.forEach((point, i) => {
            expect(point[0]).toBeCloseTo(there[i][0], 9);
            expect(point[1]).toBeCloseTo(there[i][1], 9);
        });
    });

    /**
     * **The first click states no axis yet**, so there is nothing to hang a width off and the
     * sketch is two coordinates: the click and the rubber band. That is the one shape the old
     * reading got right, which is why the defect only showed from the second click on.
     */
    it.each(FAMILY.map(n => [String(n), n] as const))('%s opens with a width from the first segment', (_label, name) => {
        const base = baseAfterSketch(name, CLICKS.slice(0, 2));
        expect(base).toHaveLength(3);
        expect(halfWidthFromBase(name, base)!).toBeCloseTo(screenMeters(DEFAULT_AXIS_HALF_WIDTH_PX, RESOLUTION, LATITUDE), 3);
    });

    /**
     * Everything else the movement holder draws has a base whose every coordinate is a route
     * point, so a sketch and a base really are the same array and nothing is appended.
     */
    it('leaves a graphic with no width point alone', () => {
        const name = TacticalGraphicName.DirectionOfMainAttack;
        expect(carriesWidthPointInBase(name)).toBe(false);

        const base = baseAfterSketch(name, CLICKS);
        expect(base).toHaveLength(CLICKS.length);
    });
});
