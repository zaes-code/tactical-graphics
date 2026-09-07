/**
 * # APP-06 152200 — search area / reconnaissance area
 *
 * Three things are pinned, and each is something the 2026-04 implementation got wrong:
 *
 * - **Two arms that vary independently**, built from three anchor points, rather than one
 *   fixed SVG path scaled and rotated about a single click.
 * - **The step in each arm.** It is what the plate draws and what tells this symbol from
 *   a fields of fire, which is otherwise the same three-point V.
 * - **Solid arrowheads.** The old path drew an open pair of strokes. Open and solid heads
 *   are not interchangeable here — several graphics are told apart by exactly that.
 */
import {TacticalGraphicName} from '../core/type';
import {renderTacticalGraphic} from '../core/render';
import type {Feature, MultiLineString, Position} from 'geojson';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {getPaintFunction, isPaintable} from './registry';
import {searchAreaPaint} from './searchAreaPaints';
import {SOLID_ARROWHEAD_HALF_ANGLE_DEG, SOLID_ARROWHEAD_PX} from './decorations';
import {SearchArea, asSearchVee} from '../graphics/SearchArea';

const context = {resolution: 100, measureText: (t: string) => t.length * 9} as unknown as PaintContext;

/** A V opening east: apex at the origin, tips north-east and south-east. */
const V: Position[] = [[10, 5], [0, 0], [10, -5]];

const armsOf = (coords: Position[] = V): Position[][] =>
    (new SearchArea().generateGraphics(
        {type: 'Feature', geometry: {type: 'LineString', coordinates: coords}, properties: {}},
        undefined,
    ) as Feature<MultiLineString>).geometry.coordinates;

function paintedFeature(coords: Position[] = V): PaintFeature {
    // Projected metres, near enough for a screen-space paint: the paint never converts.
    const arms = armsOf(coords).map(arm => arm.map(([x, y]) => [x * 111_320, y * 111_320] as ProjectedPosition));
    return {
        geometry: {type: 'MultiLineString', coordinates: arms},
        properties: {name: TacticalGraphicName.SearchArea},
    } as unknown as PaintFeature;
}

const fills = (paints: Paint[]) => paints.filter(p => p.fill && p.geometry.type === 'Polygon');

describe('the geometry', () => {
    it('builds two arms from three anchor points', () => {
        const arms = armsOf();
        expect(arms).toHaveLength(2);
        expect(arms[0]).toHaveLength(4);
        expect(arms[1]).toHaveLength(4);
    });

    it('steps each arm rather than running it straight', () => {
        /*
         * The step is the symbol. Measured as the largest departure from the straight line
         * apex → tip: a straight arm's is zero, and the plate's third waypoint sits 0.137
         * of the arm's length clear of that line.
         */
        for (const arm of armsOf()) {
            const [apex, , , tip] = [arm[0], arm[1], arm[2], arm[3]];
            const run = Math.hypot(tip[0] - V[1][0], tip[1] - V[1][1]);
            const offAxis = arm.map(p => {
                const dx = tip[0] - V[1][0];
                const dy = tip[1] - V[1][1];
                return Math.abs((p[0] - V[1][0]) * dy - (p[1] - V[1][1]) * dx) / Math.hypot(dx, dy);
            });
            expect(Math.max(...offAxis) / run).toBeGreaterThan(0.1);
            expect(apex).toBeDefined();
        }
    });

    it('steps both arms outward, whichever way the V was clicked', () => {
        /*
         * **The one a fixed sign gets wrong.** "Outward" is away from the other arm, and
         * which perpendicular that is depends on the order the three points were entered —
         * so a V drawn the other way round would have both steps cutting inward and the
         * arms crossing each other. Measured as the sign of the cross product at the arm's
         * second waypoint.
         *
         * **The arms are matched by index, not by identity** — and the first version of this
         * probe was not. It asked `coords[0] === arm[arm.length - 1]` to decide which tip an
         * arm ended at, comparing a source coordinate to a *computed* one by reference,
         * which is never true; so it always measured against the same tip and reported a
         * defect that was not there. `generateGraphics` emits arm 0 for point 1 and arm 1
         * for point 3. @see ai/conventions.md, "suspect the probe before the code"
         */
        const side = (coords: Position[]) => armsOf(coords).map((arm, index) => {
            const apex = coords[1];
            const tip = index === 0 ? coords[0] : coords[2];
            const other = index === 0 ? coords[2] : coords[0];
            const cross = (p: Position) =>
                Math.sign((tip[0] - apex[0]) * (p[1] - apex[1]) - (tip[1] - apex[1]) * (p[0] - apex[0]));
            return cross(arm[1]) === cross(other);
        });
        // False on both arms in both drawing orders: the step is never on the side the
        // other arm is on.
        expect(side(V)).toEqual([false, false]);
        expect(side([...V].reverse())).toEqual([false, false]);
    });

    it('synthesises the second arm from a two-point sketch', () => {
        const sketched = asSearchVee([[10, 0], [0, 0]]);
        expect(sketched).toHaveLength(3);
        // `[end, apex, end]`, apex in the middle — fields of fire's layout, which is what
        // `SWAP_FIRST_TWO` and `anchorVertex` both read.
        expect(sketched[1]).toEqual([0, 0]);
    });

    it('numbers its points from the vertex, the way APP-06 does', () => {
        // "Point 1 defines the vertex of the graphic." The base is stored in that order and
        // swapped into the generator's `[end, apex, end]`, so a graphic drawn vertex-first
        // must come out with its arms on the two later clicks. @see SWAP_FIRST_TWO
        const rendered = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[0, 0], [10, 5], [10, -5]]},
            properties: {tacticalGraphic: {name: TacticalGraphicName.SearchArea}},
        });
        const arms = (rendered.graphic!.geometry as MultiLineString).coordinates;
        expect(arms).toHaveLength(2);
        for (const arm of arms) {
            // Every arm starts near the vertex and ends at one of the two tips.
            expect(Math.hypot(arm[0][0], arm[0][1])).toBeLessThan(2);
            expect(Math.abs(arm[arm.length - 1][0] - 10)).toBeLessThan(0.5);
        }
    });
});

describe('the paint', () => {
    it('is registered', () => {
        expect(isPaintable(TacticalGraphicName.SearchArea)).toBe(true);
        expect(getPaintFunction(TacticalGraphicName.SearchArea)?.graphic).toBeDefined();
    });

    it('caps a solid arrowhead on each arm', () => {
        const heads = fills(searchAreaPaint()(paintedFeature(), context));
        expect(heads).toHaveLength(2);
        for (const head of heads) {
            // A closed triangle: tip, two barbs, back to the tip.
            expect((head.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0]).toHaveLength(4);
        }
    });

    it('puts each head on its own arm tip', () => {
        const arms = (paintedFeature().geometry as {coordinates: ProjectedPosition[][]}).coordinates;
        const tips = arms.map(a => a[a.length - 1]);
        for (const head of fills(searchAreaPaint()(paintedFeature(), context))) {
            const [tip] = (head.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
            expect(tips.some(t => Math.hypot(t[0] - tip[0], t[1] - tip[1]) < 1)).toBe(true);
        }
    });

    it('holds the head at one screen size however long the arms are', () => {
        /*
         * The arms "vary independently", so a head sized as a share of one would come out a
         * different size on each. Measured tip-to-base in screen pixels across a tenfold
         * change of run.
         */
        const reach = (coords: Position[]) => {
            const head = fills(searchAreaPaint()(paintedFeature(coords), context))[0];
            const [tip, left, right] = (head.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
            const mid = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
            return Math.hypot(tip[0] - mid[0], tip[1] - mid[1]) / context.resolution;
        };
        expect(reach([[10, 5], [0, 0], [10, -5]])).toBeCloseTo(reach([[100, 50], [0, 0], [100, -50]]), 4);
    });

    it('draws the same head Fix does, not one of its own', () => {
        /*
         * **The user's call, 2026-09-04:** *"make arrowhead look like the fix. The current
         * one is too wide and unlike others we've been using."* The first version measured
         * the plate at a 46-degree half-angle and 20 px, which is correct against that
         * drawing and unlike every other solid head in this library.
         *
         * Asserted as the *shape* — reach against half-width — because that is what reads
         * as a different family, and because it holds whatever the two constants are set to.
         * `createArrowHeadPolygon` puts the base one size back and half a size to each side,
         * so the ratio is 2:1 and the half-angle `atan(0.5)`.
         */
        const [head] = fills(searchAreaPaint()(paintedFeature(), context));
        const [tip, left, right] = (head.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
        const mid = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
        const reach = Math.hypot(tip[0] - mid[0], tip[1] - mid[1]);
        const halfWidth = Math.hypot(left[0] - right[0], left[1] - right[1]) / 2;
        expect(reach / halfWidth).toBeCloseTo(2, 2);
        expect(Math.atan(halfWidth / reach) * (180 / Math.PI)).toBeCloseTo(SOLID_ARROWHEAD_HALF_ANGLE_DEG, 2);
        // And the same reach, so it is the family's size and not merely its proportions.
        expect(reach / context.resolution).toBeCloseTo(SOLID_ARROWHEAD_PX, 6);
    });

    it('shrinks the head rather than swamping a short arm', () => {
        const short = fills(searchAreaPaint()(paintedFeature([[0.02, 0.01], [0, 0], [0.02, -0.01]]), context));
        const long = fills(searchAreaPaint()(paintedFeature(), context));
        const size = (paints: Paint[]) => {
            const [tip, left] = (paints[0].geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
            return Math.hypot(tip[0] - left[0], tip[1] - left[1]);
        };
        expect(size(short)).toBeLessThan(size(long));
    });
});
