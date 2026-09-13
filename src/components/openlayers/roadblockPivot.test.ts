/**
 * # A gesture holds the point the library says it holds, even when that is not the centre
 *
 * A point-anchored holder keeps `{center, size, rotation}` and rebuilds its anchors from
 * those three, so advancing `rotation` turns the symbol about its **frame centre** and
 * scaling `size` grows it about the same place — whatever `rotationPivot` and
 * `rotationAnchor` answer. For every graphic on this controller but one those are the same
 * point, which is why it went unnoticed.
 *
 * 271204 is the one. Its plate puts point 3 on a crossing and the pivot there with it
 * (user's call, 2026-09-07: *"resize and rotate icons can use point 3 as pivot"*), so
 * MapLibre — which turns and scales the coordinates themselves — swung the whole figure
 * about that crossing while this engine left the centre where it was. Measured with a
 * deliberate quarter turn on the running app, the two agreed on the angle to within a
 * degree and on the size to within 0.1%, and put the symbol 5.5 km apart.
 *
 * The centre now moves with the gesture, so the stated point stays under the cursor.
 *
 * @see MissionTaskController.centerTurnedAboutThePivot, centerScaledAboutTheAnchor
 */
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {fromLonLat, toLonLat} from 'ol/proj';
import type {Position} from 'geojson';
import {TacticalGraphicName, drawnAnchors, rotationAnchor, rotationPivot} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import type {MissionTaskController} from './controllers/MissionTaskController';

const RES = 1200;
const NAME = TacticalGraphicName.RoadblockCompleteExecuted;
const CENTRE: Position = [7, 45];
const SPAN = 60_000;

/** A controller holding the three anchor points 271204 stores, unturned. */
function seeded(): MissionTaskController {
    const controller = getController(NAME, RES) as unknown as MissionTaskController;
    const anchors = drawnAnchors(NAME, {center: CENTRE, size: SPAN, rotation: 0})!;
    controller.setBaseFeature(new Feature(new LineString(anchors.map(p => fromLonLat(p as [number, number])))) as never);
    return controller;
}

/** The graphic's stored anchor points, back in degrees. */
function anchorsOf(controller: MissionTaskController): Position[] {
    const geometry = controller.graphic.base.getGeometry() as LineString;
    return geometry.getCoordinates().map(c => toLonLat(c) as Position);
}

/** Metres between two lon/lat points, near enough at this latitude for a tolerance. */
const apart = (a: Position, b: Position): number =>
    Math.hypot((a[0] - b[0]) * Math.cos((CENTRE[1] * Math.PI) / 180), a[1] - b[1]) * 111_320;

describe('271204 turns and scales about point 3', () => {
    it('is a graphic whose pivot is not its centre, or this suite proves nothing', () => {
        const anchors = drawnAnchors(NAME, {center: CENTRE, size: SPAN, rotation: 0})!;
        const geometry = {type: 'LineString', coordinates: anchors};
        expect(rotationPivot(geometry, NAME)).toEqual(anchors[2]);
        expect(apart(anchors[2], CENTRE)).toBeGreaterThan(1_000);
    });

    it('leaves the pivot where it was through a rotate', () => {
        const controller = seeded();
        const before = anchorsOf(controller)[2];
        controller.handleRotate(40);
        const after = anchorsOf(controller)[2];
        // A tenth of a percent of the span: the round trip through lon/lat and the
        // difference between turning in projected metres and rebuilding on a sphere.
        expect(apart(before, after)).toBeLessThan(SPAN / 1000);
    });

    it('still turns the symbol, rather than holding it still', () => {
        const controller = seeded();
        const before = anchorsOf(controller)[1];
        controller.handleRotate(40);
        expect(apart(before, anchorsOf(controller)[1])).toBeGreaterThan(SPAN / 4);
    });

    it('leaves the anchor where it was through a resize', () => {
        const controller = seeded();
        const before = anchorsOf(controller)[2];
        controller.handleResize(1.6);
        const after = anchorsOf(controller);
        expect(apart(before, after[2])).toBeLessThan(SPAN / 1000);
        // And it really did grow: points 1 and 2 are the span's two ends.
        expect(apart(after[0], after[1])).toBeGreaterThan(SPAN * 1.5);
    });

    it('asks the library for the point a resize scales from', () => {
        const controller = seeded();
        const stated = rotationAnchor({type: 'LineString', coordinates: anchorsOf(controller)}, NAME);
        expect(apart(toLonLat(controller.getCenter()) as Position, stated as Position)).toBeLessThan(1);
    });
});
