/**
 * # A corner-anchored symbol turns and scales about the middle of its two corners
 *
 * Three plates describe their two anchor points as *corners* — 218400 navigational line,
 * 290400 mine cluster, 291000 fortified position — and a symbol described that way has no
 * growing end. Anchoring a resize on one of them scales the graphic correctly and walks it
 * sideways out of that corner while doing it, which is what a user reported on the mine
 * cluster on 2026-09-05: "the resize does not resize the whole graphic wholesomely".
 *
 * Two things are asserted here, and they are different claims:
 *
 * 1. **Both engines name the same point.** OpenLayers asks its controller's `getCenter()`
 *    in projected metres; MapLibre asks the library's `rotationAnchor` in lon/lat. A pivot
 *    stated twice is a pivot that drifts — a fields-of-fire once rotated about its middle
 *    on one engine and about its left leg on the other, from the same drag.
 * 2. **The pivot is the midpoint, so a resize moves both ends.** The old behaviour left
 *    `coordinates[0]` exactly where it was; that is the defect, and `0` moved is what this
 *    would report if the rule were reverted.
 */

import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import {fromLonLat, toLonLat} from 'ol/proj';
import {
    TacticalGraphicName,
    listTacticalGraphicNames,
    rotationAnchor,
    usesCornerAnchors,
} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

const RESOLUTION = 100;

/** The three the plates put in the class, named rather than derived, so a silent drop shows. */
const CORNERS: TacticalGraphicName[] = [
    TacticalGraphicName.NavigationalLine,
    TacticalGraphicName.MineCluster,
    TacticalGraphicName.FortifiedPosition,
];

/**
 * A base that is **not** horizontal and **not** on the equator.
 *
 * Both matter. A horizontal chord hides a wrong y, and a chord at the equator hides the
 * difference between a midpoint taken in degrees and one taken in the Mercator frame —
 * which is the whole reason the library's rule converts before it averages.
 */
const CORNER_A: [number, number] = [-77.0, 30.0];
const CORNER_B: [number, number] = [-76.0, 50.0];

/**
 * A controller with a real base on it, in projected metres.
 *
 * **`graphicName` has to be stamped.** `openlayersAdapter.projectedPivot` reads the name
 * off the feature, because two of `rotationAnchor`'s answers depend on which graphic is
 * asking — and a base without one silently gets the plain drawn-line rule. The manager
 * stamps it on every feature it makes; a test that builds its own must too, or it measures
 * the fallback and reports the defect it was written to catch.
 */
function seeded(name: TacticalGraphicName) {
    const handler = getController(name, RESOLUTION);
    const base = handler.graphic.base as Feature;
    base.set('graphicName', name);
    base.setGeometry(new LineString([fromLonLat(CORNER_A), fromLonLat(CORNER_B)]));
    handler.setBaseFeature(base as never);
    return handler;
}

describe('the corner class is what the plates say it is', () => {
    it('holds exactly the three graphics whose anchor points are corners', () => {
        const flagged = listTacticalGraphicNames()
            .filter((name): name is TacticalGraphicName => name in TacticalGraphicName)
            .filter(usesCornerAnchors);
        expect(flagged.sort()).toEqual([...CORNERS].sort());
    });

    /**
     * The near-misses, kept as an assertion because each was read and rejected. Trip wire
     * is the one that matters: its point 2 sits **at the mine**, so one end is a real place
     * on the ground and pivoting there means something.
     */
    it('leaves the tips, the endpoints and the trip wire out', () => {
        for (const name of [
            TacticalGraphicName.FerryCrossing,
            TacticalGraphicName.RaftSite,
            TacticalGraphicName.BearingLine,
            TacticalGraphicName.LinearTarget,
            TacticalGraphicName.TripWire,
            TacticalGraphicName.Mineline,
        ]) {
            expect(usesCornerAnchors(name)).toBe(false);
        }
    });
});

describe('both engines pivot a corner symbol about the same point', () => {
    it.each(CORNERS)('%s', name => {
        const openlayers = seeded(name).getCenter();
        const maplibre = fromLonLat(
            rotationAnchor({type: 'LineString', coordinates: [CORNER_A, CORNER_B]}, name),
        );

        // A metre either way is fine; a different corner is 2,000 km away.
        expect(Math.hypot(openlayers[0] - maplibre[0], openlayers[1] - maplibre[1])).toBeLessThan(1);
    });

    it('puts that point between the two corners, not on one of them', () => {
        for (const name of CORNERS) {
            const [lon, lat] = toLonLat(seeded(name).getCenter());
            expect(lon).toBeCloseTo((CORNER_A[0] + CORNER_B[0]) / 2, 6);
            // Mercator's y is not linear in latitude, so the midpoint of 30 and 50 sits
            // at 40.746, not at 40. Averaging the degrees is the mistake this pins.
            expect(lat).toBeCloseTo(40.7458, 3);
        }
    });
});

describe('a resize grows a corner symbol from its middle', () => {
    it.each(CORNERS)('%s moves both corners', name => {
        const handler = seeded(name);
        const before = (handler.graphic.base.getGeometry() as LineString).getCoordinates();
        const middle = handler.getCenter();

        handler.handleResize(1.5);

        const after = (handler.graphic.base.getGeometry() as LineString).getCoordinates();
        const span = (c: number[][]) => Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
        expect(span(after) / span(before)).toBeCloseTo(1.5, 2);

        /*
         * **A quarter of the span each, and the same quarter.** That is what scaling by
         * 1.5 about the midpoint means: the span grows by half, shared evenly between the
         * two ends. Asserting it as a share rather than a distance is what makes it read
         * as the geometry rather than as a number someone measured once.
         *
         * The defect this replaces reported exactly `0` for the first of the two.
         */
        const moved = after.map((p, i) => Math.hypot(p[0] - before[i][0], p[1] - before[i][1]));
        expect(moved[0] / span(before)).toBeCloseTo(0.25, 6);
        expect(moved[1] / span(before)).toBeCloseTo(0.25, 6);

        // And the point the gesture was measured about did not move.
        const middleAfter = handler.getCenter();
        expect(Math.hypot(middleAfter[0] - middle[0], middleAfter[1] - middle[1])).toBeLessThan(span(before) / 1000);
    });
});
