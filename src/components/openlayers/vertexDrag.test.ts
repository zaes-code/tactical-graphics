/**
 * Vertex dragging: an edit-mode drag on an opted-in graphic moves the grabbed vertex
 * rather than scaling the whole shape.
 *
 * Opt-in matters as much as the behaviour. The line family is overwhelmingly "a drawn path
 * plus decorations", where a uniform resize is what a user expects, so turning this on
 * everywhere would change 40 graphics nobody asked about.
 */
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';

const RES = 1200;
const V: number[][] = [[0, 0], [100_000, -60_000], [200_000, 0]];

const build = (name: TacticalGraphicName) => {
    const c = getController(name, RES) as LineGraphicController;
    c.setBaseFeature(new Feature(new LineString(V.map(p => [...p]))) as never);
    return c;
};

const coordsOf = (c: LineGraphicController) =>
    (c.graphic.base.getGeometry() as LineString).getCoordinates().map(p => [Math.round(p[0]), Math.round(p[1])]);

describe('per-handle vertex dragging', () => {
    it('Fields of Fire opts in', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        expect(c.dragsVertices).toBe(true);
        expect(typeof c.handleVertexDrag).toBe('function');
    });

    it('moves only the grabbed vertex', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        c.handleVertexDrag!(2, [260_000, 40_000]);
        const after = coordsOf(c);
        expect(after[0]).toEqual([0, 0]);              // other leg untouched
        expect(after[1]).toEqual([100_000, -60_000]);  // apex untouched
        expect(after[2]).toEqual([260_000, 40_000]);   // dragged end moved
    });

    it('never drops a vertex, so the V keeps its two segments', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        c.handleVertexDrag!(0, [100_001, -60_001]);    // dragged onto the apex
        expect(coordsOf(c)).toHaveLength(3);
    });

    it('ignores an out-of-range index rather than corrupting the geometry', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        const before = coordsOf(c);
        c.handleVertexDrag!(9, [1, 1]);
        c.handleVertexDrag!(-1, [1, 1]);
        expect(coordsOf(c)).toEqual(before);
    });

    it('the apex moves the whole graphic, keeping the V rigid', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        const before = coordsOf(c);
        c.handleVertexDrag!(1, [130_000, -20_000]);   // drag the apex
        const after = coordsOf(c);
        const dx = 130_000 - before[1][0];
        const dy = -20_000 - before[1][1];
        // Every vertex shifted by the same delta — the shape is unchanged, only placed.
        after.forEach((p, i) => {
            expect(p[0]).toBe(before[i][0] + dx);
            expect(p[1]).toBe(before[i][1] + dy);
        });
    });

    it('publishes three handles: two ends and an apex', () => {
        const c = build(TacticalGraphicName.FieldsOfFire);
        expect(c.anchorVertex).toBe(1);
        const handles = c.graphic.getFeatures().find(f => f.get('role') === 'handle')?.getGeometry();
        expect((handles as unknown as {getCoordinates(): number[][]}).getCoordinates().length).toBeGreaterThanOrEqual(3);
    });

    it('leaves the rest of the line family alone', () => {
        for (const name of [TacticalGraphicName.PhaseLine, TacticalGraphicName.ObstacleLine,
                            TacticalGraphicName.PassageLane, TacticalGraphicName.Route]) {
            const c = getController(name, RES) as LineGraphicController;
            expect(c.dragsVertices).toBe(false);
            // The manager routes on the method's presence, so absence is the contract.
            expect(c.handleVertexDrag).toBeUndefined();
        }
    });
});
