import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import {fromLonLat, toLonLat} from 'ol/proj';
import {getDistance} from 'ol/sphere';
import {TacticalGraphicName, baseVertexCount, handleRole, isRectangular} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {getGraphicFields} from './graphicFieldRegistry';
import {readGraphicLabels} from './graphicProperties';

/**
 * # The rectangular zones — two anchor points and a width
 *
 * > This symbol requires two anchor points and a width, defined in metres, to define the
 * > boundary of the area. Points 1 and 2 will be located in the centre of two opposing
 * > sides of the rectangle. (APP-06 240202)
 *
 * FM 1-02.2 table 5-24 draws the same `AM` / "Width (m)" arrow across the edge. The user
 * dragged a **box** here until 2026-08-27, which made the same picture and cost three
 * things: the width could be read but never dragged, the zone could not be turned at all
 * because every dimension came off the projected bounding box, and points 1 and 2 existed
 * nowhere in the saved description.
 *
 * @see RectangularAreaGraphicBase, rectangleFromAxis
 */

const RESOLUTION = 20;

/**
 * The 17 rectangular *zones*, taken from the library rather than restated here.
 *
 * `TargetAreaRectangular` is handled separately below: it files a length as well as a
 * width, where every other rectangle takes its length from the two anchor points.
 */
const RECTANGULAR = (Object.values(TacticalGraphicName) as TacticalGraphicName[])
    .filter(isRectangular)
    .filter(name => name !== TacticalGraphicName.TargetAreaRectangular);

/** The axis a user draws: point 1 and point 2, about 20 km apart near 51°N. */
const axis = (halfLengthDeg = 0.14) =>
    new Feature({
        geometry: new LineString([
            fromLonLat([-halfLengthDeg, 51.5]),
            fromLonLat([halfLengthDeg, 51.5]),
        ]),
    });

const holderFor = (name: TacticalGraphicName) => {
    const controller: any = getController(name, RESOLUTION);
    controller.setBaseFeature(axis());
    return controller;
};

/**
 * The rectangular target's holder, which takes a **Point** base rather than an axis.
 * @see RectangularTargetGraphicBase
 */
const pointHolderFor = (name: TacticalGraphicName) => {
    const controller: any = getController(name, RESOLUTION);
    controller.setBaseFeature(new Feature({geometry: new Point(fromLonLat([0, 51.5]))}));
    return controller;
};

/** The built rectangle's outer ring, in projected metres. */
const ring = (controller: any): number[][] =>
    (controller.graphic.graphic.getGeometry() as Polygon).getCoordinates()[0];

/** Ground width of the built rectangle, measured across the axis the way a user would. */
const groundWidth = (controller: any): number => {
    const r = ring(controller);
    // The ring is `[left1, left2, right2, right1, left1]`, so corner 0 and corner 3 are
    // the two flanks of point 1 — one full width apart.
    return getDistance(toLonLat(r[0]), toLonLat(r[3]));
};

describe('rectangular zones carry their width in meters', () => {
    it('covers all seventeen rectangular zones', () => {
        expect(RECTANGULAR).toHaveLength(17);
    });

    it.each(RECTANGULAR)('%s offers a width field in the dialog', name => {
        expect(getGraphicFields(name).width).toBe(true);
    });

    it.each(RECTANGULAR)('%s takes two anchor points and offers a width handle', name => {
        // The whole point of the conversion: the base is the axis, and the third handle
        // is the width. @see handleContract
        expect(baseVertexCount(name)).toBe(2);
        expect(handleRole(name, 0)).toBe('shape');
        expect(handleRole(name, 1)).toBe('shape');
        expect(handleRole(name, 2)).toBe('offset');

        const controller = holderFor(name);
        expect((controller.graphic.base.getGeometry() as LineString).getCoordinates()).toHaveLength(2);
        // The two anchor points reshape and live in the handles feature; the width sits in
        // an `offsetHandler` feature of its own, which is how the manager tells a width
        // drag from a reshape. @see RectangularAreaGraphicBase.offsetHandle
        expect(controller.graphic.handles.getGeometry()!.getCoordinates()).toHaveLength(2);
        expect(controller.graphic.offsetHandle.getGeometry()).toBeDefined();
        expect(controller.graphic.offsetHandle.get('offsetHandler')).toBe(true);
    });

    it.each(RECTANGULAR)('%s writes the drawn width into the amplifier bag', name => {
        const controller = holderFor(name);
        const stamped = readGraphicLabels(controller.graphic.graphic).width;
        expect(stamped).toBeGreaterThan(0);
        // Ground meters, not projected: at 51° the projected value is ~1.6x larger, so a
        // zone drawn 15 km across would be filed as 24 km.
        expect(stamped).toBeCloseTo(groundWidth(controller), -2);
    });

    it.each(RECTANGULAR)('%s widens on a width drag, without moving its anchor points', name => {
        // This is the gesture the box model had no way to offer. `setOffset` is what the
        // manager's `offset` handle drag calls. @see TacticalGraphicsManager
        const controller = holderFor(name);
        const before = groundWidth(controller);
        const axisBefore = (controller.graphic.base.getGeometry() as LineString).getCoordinates();

        controller.graphic.setOffset(controller.graphic.currentOffset() * 2);

        expect(groundWidth(controller)).toBeCloseTo(before * 2, -2);
        expect((controller.graphic.base.getGeometry() as LineString).getCoordinates()).toEqual(axisBefore);
    });

    it.each(RECTANGULAR)('%s restretches when a width is typed in', name => {
        const controller = holderFor(name);
        const before = groundWidth(controller);
        const target = Math.round(before * 2);

        controller.graphic.setLabel({...controller.graphic.graphicLabels, width: target});

        expect(groundWidth(controller)).toBeCloseTo(target, -2);
        // …and the axis is untouched: width is the across-dimension only.
        const drawn = (controller.graphic.base.getGeometry() as LineString).getCoordinates();
        expect(drawn).toEqual((axis().getGeometry() as LineString).getCoordinates());
    });

    it.each(RECTANGULAR)('%s does not restretch when its own value is re-stamped', name => {
        const controller = holderFor(name);
        const before = groundWidth(controller);
        const stamped = readGraphicLabels(controller.graphic.graphic).width;

        // Exactly what the dialog sends back when the user edits some *other* field.
        controller.graphic.setLabel({...controller.graphic.graphicLabels, width: stamped});

        expect(groundWidth(controller)).toBeCloseTo(before, -1);
    });

    it('ignores a width that is not a usable number', () => {
        const controller = holderFor(TacticalGraphicName.FreeFireAreaRectangular);
        const before = groundWidth(controller);
        for (const bad of [0, -500, NaN]) {
            controller.graphic.setLabel({...controller.graphic.graphicLabels, width: bad as number});
        }
        expect(groundWidth(controller)).toBeCloseTo(before, -1);
    });

    it('turns with its anchor points, which a drawn box could not do', () => {
        // The box model measured everything off the *projected* bounding box, so there was
        // nothing for a rotate to act on. The axis carries the orientation now.
        const controller: any = getController(TacticalGraphicName.FreeFireAreaRectangular, RESOLUTION);
        controller.setBaseFeature(new Feature({
            geometry: new LineString([fromLonLat([0, 51.4]), fromLonLat([0, 51.6])]),
        }));
        const r = ring(controller);
        const xs = r.map(c => c[0]);
        const ys = r.map(c => c[1]);
        // A north-south axis makes a rectangle taller than it is wide.
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(Math.max(...xs) - Math.min(...xs));
    });
});

/**
 * The width read-out, shown live while the zone is being resized.
 *
 * The figure has to be visible *while* the drag is happening, not only afterwards in the
 * properties dialog. It runs **across the rectangle** now rather than down the projected
 * right edge — a zone can be turned, and a vertical line beside a rotated shape measures
 * nothing the shape has.
 */
describe('the live width read-out', () => {
    it('is empty until a gesture arms it, and empty again after', () => {
        const controller = holderFor(TacticalGraphicName.FreeFireAreaRectangular);
        expect(controller.graphic.measure.getGeometry()).toBeUndefined();
        controller.graphic.showMeasure(true);
        expect(controller.graphic.measure.getGeometry()).toBeDefined();
        controller.graphic.showMeasure(false);
        expect(controller.graphic.measure.getGeometry()).toBeUndefined();
    });

    it('is put away by the drag ending, not only by a caller remembering to', () => {
        // `endGesture` is what the manager calls when any drag finishes.
        // `MissionTaskController` has always had one; the line controller never needed it
        // until a line holder drew a read-out, so the hashed line and its figure stayed on
        // the map afterwards and read as part of the symbol. (User's report, 2026-08-27.)
        const controller = holderFor(TacticalGraphicName.FreeFireAreaRectangular);
        controller.graphic.showMeasure(true);
        expect(controller.graphic.measure.getGeometry()).toBeDefined();

        controller.endGesture();
        expect(controller.graphic.measure.getGeometry()).toBeUndefined();
    });

    it('previews level, so the shape does not jump at the last click', () => {
        // The holder is also the preview: `LineGraphicController` republishes the base on
        // every pointer move. It followed the mouse in any direction while the committed
        // geometry came out level. (User's report, 2026-08-27.)
        const controller: any = getController(TacticalGraphicName.FreeFireAreaRectangular, RESOLUTION);
        controller.graphic.drawing = true;
        controller.setBaseFeature(new Feature({
            geometry: new LineString([fromLonLat([-0.2, 51.5]), fromLonLat([0.2, 51.62])]),
        }));
        const drawn = (controller.graphic.base.getGeometry() as LineString).getCoordinates();
        expect(drawn[1][1]).toBeCloseTo(drawn[0][1], 6);
    });

    it('runs across the rectangle, in from one short side and clear of the label', () => {
        // Across the middle it ran straight through the designation and the date-time
        // group. (User's call, 2026-08-27.)
        const controller = holderFor(TacticalGraphicName.FreeFireAreaRectangular);
        controller.graphic.showMeasure(true);
        const coords = controller.graphic.measure.getGeometry()!.getCoordinates() as number[][];
        const drawn = (controller.graphic.base.getGeometry() as LineString).getCoordinates();
        const midX = (drawn[0][0] + drawn[1][0]) / 2;

        // Perpendicular to an east-west axis, so both ends share one meridian…
        expect(coords[0][0]).toBeCloseTo(coords[1][0], 6);
        expect(coords[0][1]).not.toBeCloseTo(coords[1][1], 0);
        // …and that meridian is well away from the middle, inside the far short side.
        expect(coords[0][0]).toBeGreaterThan(midX);
        expect(coords[0][0]).toBeLessThan(drawn[1][0]);
    });

    /**
     * The reason `measureMeters` exists. The style function measures Euclidean distance
     * across projected coordinates, which at 51 degrees is 1.6x the ground distance — so
     * the hashed line would have read 7.2 km beside an amplifier filed as 4.4 km.
     */
    it('states the ground distance rather than the projected one', () => {
        const controller = holderFor(TacticalGraphicName.FreeFireAreaRectangular);
        controller.graphic.showMeasure(true);
        const stated = controller.graphic.measure.get('measureMeters') as number;
        const coords = controller.graphic.measure.getGeometry()!.getCoordinates() as number[][];
        const projected = Math.hypot(coords[1][0] - coords[0][0], coords[1][1] - coords[0][1]);

        expect(stated).toBeCloseTo(groundWidth(controller), -1);
        expect(projected / stated).toBeGreaterThan(1.5); // ...and they really do differ
    });

    it('follows the shape while the gesture is still running', () => {
        const controller = holderFor(TacticalGraphicName.FreeFireAreaRectangular);
        controller.graphic.showMeasure(true);
        const before = controller.graphic.measure.get('measureMeters') as number;
        controller.graphic.setOffset(controller.graphic.currentOffset() * 2); // mid-drag
        expect(controller.graphic.measure.get('measureMeters') as number).toBeGreaterThan(before * 1.8);
    });

    it('stays clear of graphics that are not rectangles', () => {
        const controller: any = getController(TacticalGraphicName.AssemblyArea, RESOLUTION);
        controller.setBaseFeature(new Feature({
            geometry: new Polygon([[
                fromLonLat([-0.1, 51.4]), fromLonLat([0.1, 51.4]),
                fromLonLat([0.1, 51.6]), fromLonLat([-0.1, 51.6]), fromLonLat([-0.1, 51.4]),
            ]]),
        }));
        controller.graphic.showMeasure(true);
        expect(controller.graphic.measure.getGeometry()).toBeUndefined();
    });
});

/**
 * The rectangular target carries **both** dimensions, and is the only rectangle that
 * does.
 *
 * FM 1-02.2 table 5-25: "greater than 200 meters in length and width described by four
 * grids **or by a center grid, a length, width, and an altitude**". APP-06 240802 names
 * them outright — "the target length (AM1) in metres and target width (AM) in metres".
 */
describe('the rectangular target states its length and width', () => {
    const TARGET = TacticalGraphicName.TargetAreaRectangular;

    it('offers a length, a width and an attitude', () => {
        expect(getGraphicFields(TARGET).width).toBe(true);
        expect(getGraphicFields(TARGET).length).toBe(true);
        expect(getGraphicFields(TARGET).attitude).toBe(true);
    });

    it('takes one anchor point, not two', () => {
        /*
         * The whole reason it left the rectangle family: APP-06 240802 "requires one (1)
         * anchor point" and gives the shape as amplifiers.
         *
         * `baseVertexCount` stays *undefined*, like every other point-anchored graphic —
         * that table caps line draws, and a one-point base is a `Point` draw with no second
         * click to cap. The holder taking a Point base is the real assertion, and
         * `pointHolderFor` makes it in the tests below. @see RectangularTarget
         */
        expect(isRectangular(TARGET)).toBe(false);
        expect(baseVertexCount(TARGET)).toBeUndefined();
    });

    it('files a length and a width that the box actually measures', () => {
        // Stated, not derived. The holder is the source of both numbers now, so the test
        // is that the drawn ring agrees with what it filed — the opposite direction from
        // the two-point zones, which read their width back off the ring.
        const controller = pointHolderFor(TARGET);
        const bag = readGraphicLabels(controller.graphic.graphic);
        expect(bag.length).toBeGreaterThan(0);
        expect(bag.width).toBeGreaterThan(0);

        const r = ring(controller);
        // `[left1, left2, right2, right1, left1]` — corner 0 to corner 3 is one full width
        // across the axis, corner 0 to corner 1 one full length along it.
        expect(getDistance(toLonLat(r[0]), toLonLat(r[3]))).toBeCloseTo(bag.width!, -2);
        expect(getDistance(toLonLat(r[0]), toLonLat(r[1]))).toBeCloseTo(bag.length!, -2);
    });

    it('resizes to a width the operator types', () => {
        const controller = pointHolderFor(TARGET);
        controller.graphic.setLabel({...readGraphicLabels(controller.graphic.graphic), width: 4000});
        const r = ring(controller);
        expect(getDistance(toLonLat(r[0]), toLonLat(r[3]))).toBeCloseTo(4000, -2);
    });

    it('keeps its proportions through a uniform resize', () => {
        /*
         * A circle has one number, so a resize is just `size × factor`. This graphic has
         * two, and once a width is typed it stops following the length — so a resize that
         * moved only `size` stretched the box instead of scaling it. Driven through the
         * controller, which is where the gesture applies the factor, beside the arrowhead
         * scaling it mirrors. @see MissionTaskController.handleResize
         */
        const holder = pointHolderFor(TARGET);
        const typed = 6000;
        holder.graphic.setLabel({...readGraphicLabels(holder.graphic.graphic), width: typed});

        const before = readGraphicLabels(holder.graphic.graphic);
        const ratio = before.width! / before.length!;
        holder.handleResize(2);
        const after = readGraphicLabels(holder.graphic.graphic);

        expect(after.length).toBeCloseTo(before.length! * 2, -1);
        expect(after.width).toBeCloseTo(typed * 2, -1);
        expect(after.width! / after.length!).toBeCloseTo(ratio, 5);
    });

    it('is still the only rectangle that files a length', () => {
        // The two-point zones derive both dimensions from their anchor points, so a length
        // on one of them would be a number nothing set. @see RECTANGLE_LENGTH_GRAPHICS
        for (const name of RECTANGULAR) {
            expect(readGraphicLabels(holderFor(name).graphic.graphic).length).toBeUndefined();
        }
    });
});
