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
import {readGraphicGeometryState} from './graphicProperties';

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
