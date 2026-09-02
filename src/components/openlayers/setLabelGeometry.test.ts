/**
 * `writeGraphicProperties` replaces `properties.tacticalGraphic` wholesale, so any
 * `setLabel` that writes only amplifiers erases the geometry state stamped beside them.
 * Nothing recomputes it until the next `updateGeometry`, so a save taken straight after
 * editing an amplifier loses the size the user dragged — silently.
 */
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import Feature from 'ol/Feature';
import {LineString, MultiLineString} from 'ol/geom';
import {AirCorridor} from './graphics/AirCorridor';
import {LineGraphicBase} from './graphics/LineGraphicBase';
import {readGraphicGeometryState, readGraphicLabels, writeGraphicProperties} from './graphicProperties';
import {shownLabels} from '../tactical-graphics-dialog';

const line = () => new Feature(new LineString([[0, 0], [100_000, 0]]));

/** A traced ring, which is what the multiple-strike zone's base holds. */
const ring = () => new Feature(new LineString([[0, 0], [200_000, 0], [200_000, 150_000], [0, 150_000], [0, 0]]));

/** Distance from the first inner edge's midpoint to the outer ring, in projected metres. */
const gapOf = (g: LineGraphicBase): number => {
    const [inner, outer] = (g.graphics.getGeometry() as MultiLineString).getCoordinates();
    const mid = [(inner[0][0] + inner[1][0]) / 2, (inner[0][1] + inner[1][1]) / 2];
    let best = Infinity;
    for (let i = 0; i < outer.length - 1; i++) {
        const [ax, ay] = outer[i];
        const [bx, by] = outer[i + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((mid[0] - ax) * dx + (mid[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(mid[0] - (ax + t * dx), mid[1] - (ay + t * dy)));
    }
    return best;
};

describe('setLabel keeps the geometry state', () => {
    /**
     * The dialog seeds its input from `shownLabels`, which dropped `width` because shape
     * inputs are normally re-derived. A typed standoff is the one that is not, so the box
     * opened empty every time and offered to replace a real gap with nothing.
     */
    it('offers the stored width back to the dialog', () => {
        const g = new LineGraphicBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 1200);
        g.setBaseFeature(ring() as never);
        const stamped = readGraphicGeometryState(g.getFeatures()[0]).width;
        expect(stamped).toBeGreaterThan(0);

        const shown = shownLabels({
            id: 'x',
            graphicName: TacticalGraphicName.MinimumSafeDistanceMultipleStrike,
            labels: readGraphicLabels(g.getFeatures()[0]),
            echelon: '',
            measured: readGraphicGeometryState(g.getFeatures()[0]),
        } as never);
        expect(shown.width).toBe(stamped);
    });

    it('air corridor keeps its dragged width', () => {
        const c = new AirCorridor(TacticalGraphicName.AirCorridor, 20 * 1200, 1200);
        c.setBaseFeature(line() as never);
        c.setOffset(9000);
        expect(readGraphicGeometryState(c.getFeatures()[0]).width).toBe(18000);

        c.setLabel({designation: 'CORRIDOR-1'});          // what the dialog sends: amplifiers only
        expect(readGraphicGeometryState(c.getFeatures()[0]).width).toBe(18000);
    });

    it('line graphic keeps its stamped decoration size', () => {
        const g = new LineGraphicBase(TacticalGraphicName.PassageLane, 1200);
        g.setBaseFeature(line() as never);
        const before = readGraphicGeometryState(g.getFeatures()[0]).decorationSize;
        expect(before).toBeGreaterThan(0);

        g.setLabel({designation: 'PL-1'});
        expect(readGraphicGeometryState(g.getFeatures()[0]).decorationSize).toBe(before);
    });

    it('multiple-strike zone keeps its standoff', () => {
        const g = new LineGraphicBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 1200);
        g.setBaseFeature(ring() as never);
        const before = readGraphicGeometryState(g.getFeatures()[0]).width;
        expect(before).toBeGreaterThan(0);

        g.setLabel({designation: 'STRIKE-1'});
        expect(readGraphicGeometryState(g.getFeatures()[0]).width).toBe(before);
    });

    /**
     * **The order the dialog actually uses.**
     *
     * `featurePropertiesSource.apply` writes the new labels onto the feature and only THEN
     * calls `setLabel`. So by the time the holder is asked, the bag already holds the number
     * the operator typed — and a rebuild check that compared against the bag concluded
     * nothing had changed and left the picture alone. The user's report: the gap "takes
     * effect only when on edit mode and the user tries to drag a handle".
     *
     * The check is against the standoff the geometry was built from, which is why this
     * writes the bag first, exactly as the app does.
     */
    it('multiple-strike zone rebuilds even when the bag was written first', () => {
        const g = new LineGraphicBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 1200);
        g.setBaseFeature(ring() as never);
        const before = gapOf(g);
        const typed = (readGraphicGeometryState(g.getFeatures()[0]).width ?? 0) * 4;

        // What apply() does, in its order.
        writeGraphicProperties(g.getFeatures(), TacticalGraphicName.MinimumSafeDistanceMultipleStrike, {
            designation: '',
            width: typed,
        } as never);
        g.setLabel({designation: '', width: typed} as never);

        expect(gapOf(g)).toBeGreaterThan(before * 2);
    });

    /**
     * **And a typed one has to move the ring.** The standoff is the distance the outer zone
     * is derived from, so writing the bag without regenerating changed the number in the
     * file and left the picture alone until some later gesture happened to rebuild it.
     */
    it('multiple-strike zone rebuilds when a new standoff is typed', () => {
        const g = new LineGraphicBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 1200);
        g.setBaseFeature(ring() as never);
        const before = gapOf(g);
        expect(before).toBeGreaterThan(0);

        g.setLabel({designation: '', width: (readGraphicGeometryState(g.getFeatures()[0]).width ?? 0) * 4});

        expect(gapOf(g)).toBeGreaterThan(before * 2);
    });
});
