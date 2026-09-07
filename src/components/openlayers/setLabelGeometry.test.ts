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

/**
 * A holder given its base **the way a draw gives it one**.
 *
 * `LineGraphicController` raises `shapingFromGesture` around the gesture that authors
 * geometry, and the multiple-strike zone's standoff seed hangs off it: a base arriving
 * without the flag is a *restore*, and for that graphic an absent width is the legacy
 * two-ring format rather than a gap to fill. A fixture that just calls `setBaseFeature`
 * is therefore describing a restore, whatever it meant to describe.
 * @see LineGraphicBase.standoff
 */
const drawnWith = (g: LineGraphicBase, base: Feature): LineGraphicBase => {
    g.shapingFromGesture = true;
    g.setBaseFeature(base as never);
    g.shapingFromGesture = false;
    return g;
};

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
        const g = drawnWith(new LineGraphicBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 1200), ring());
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
        const g = drawnWith(new LineGraphicBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 1200), ring());
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
        const g = drawnWith(new LineGraphicBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 1200), ring());
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
        const g = drawnWith(new LineGraphicBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 1200), ring());
        const before = gapOf(g);
        expect(before).toBeGreaterThan(0);

        g.setLabel({designation: '', width: (readGraphicGeometryState(g.getFeatures()[0]).width ?? 0) * 4});

        expect(gapOf(g)).toBeGreaterThan(before * 2);
    });

    /**
     * **A restored zone that files no width keeps its two traced rings.**
     *
     * 272101 has two base formats and `SafeDistanceZone` tells them apart by the standoff:
     * a width means the base holds zone 1 and zone 2 is derived; no width means the base
     * holds *both rings end to end*, which is what the plate has the operator trace and
     * what every graphic saved before the standoff existed carries.
     *
     * Seeding a default here destroyed that format — the twelve points read as one traced
     * ring, inner hexagon jumping to outer and closing, and the symbol came back a
     * self-crossing star with a second star offset around it. Reported off the sample
     * sweep on 2026-09-05. The fix is that the seed belongs to the authoring gesture, so
     * this fixture — deliberately *not* `drawnWith` — must file nothing.
     */
    it('leaves a restored two-ring zone alone rather than seeding a standoff into it', () => {
        const hexes = (scale: number) => Array.from({length: 6}, (_p, i) => {
            const a = Math.PI / 2 + (i * 2 * Math.PI) / 6;
            return [200_000 * scale * Math.cos(a), 200_000 * scale * Math.sin(a)];
        });
        const legacy = new Feature(new LineString([...hexes(0.5), ...hexes(0.95)]));

        const g = new LineGraphicBase(TacticalGraphicName.MinimumSafeDistanceMultipleStrike, 1200);
        g.setBaseFeature(legacy as never);   // a restore: no authoring gesture

        // Nothing invented, so the generator still sees the format the file described.
        expect(readGraphicGeometryState(g.getFeatures()[0]).width).toBeUndefined();

        // Two rings, each closed, and the second outside the first — not one crossing loop.
        const parts = (g.graphics.getGeometry() as MultiLineString).getCoordinates();
        expect(parts).toHaveLength(2);
        const span = (ring: number[][]) => Math.max(...ring.map(p => Math.hypot(p[0], p[1])));
        expect(parts[0]).toHaveLength(7);
        expect(parts[1]).toHaveLength(7);
        expect(span(parts[1])).toBeGreaterThan(span(parts[0]));
    });
});
