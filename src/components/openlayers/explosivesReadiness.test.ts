import Feature from 'ol/Feature';
import MultiLineString from 'ol/geom/MultiLineString';
import Point from 'ol/geom/Point';
import {TacticalGraphicName, baseVertexCount, carriesSeparationInBase, editStretches, renderTacticalGraphic} from '@zaes/tactical-graphics';
import {barSymbolStyleFunc} from './openlayerStyles';
import {getGraphicFields} from './graphicFieldRegistry';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';

const PLANNED = TacticalGraphicName.ExplosivesPlannedStateOfReadiness;
const SAFE = TacticalGraphicName.ExplosivesStateOfReadiness1Safe;
const ARMED = TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable;
const NAMES = [PLANNED, SAFE, ARMED];

/**
 * The three readiness states are a **drawn centerline with a width**, per APP-06
 * 271201 — "points 1 and 2 determine the centerline of the symbol and point 3
 * determines its width" — with FM 1-02.2's plate agreeing. They were point-anchored
 * at a fixed 45° bearing until 2026-08-13, so a demolition could not be laid across a
 * road running any other way. @see ai/app-6.md, "F2"
 *
 * Roadblock complete is **not** in this family's construction: APP-06 draws it as two
 * overlapping X's and its rule cell is inherited rather than stated, so it stays
 * point-dropped. Its own describe block below still holds it to the plate.
 */
const render = (name: TacticalGraphicName, width = 1200, coords = [[0, 0], [0.4, 0.4]]) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates: coords},
        properties: {tacticalGraphic: {name, width}},
    } as any) as any;

/** Which bars the style function dashes, left rail first. */
const dashes = (name: TacticalGraphicName) => {
    const bars = render(name).graphic.geometry.coordinates;
    const styles = barSymbolStyleFunc(name)(new Feature({geometry: new MultiLineString(bars)}) as any, 20) as any[];
    return styles.map(s => !!s.getStroke().getLineDash());
};

describe('explosives states of readiness', () => {
    // The three are one shape; the dashing is the entire difference between them, so it is
    // the only thing worth asserting hard. Straight off the FM 1-02.2 table 5-19 plates,
    // and APP-06's templates draw them identically.
    it('dashes each state the way the plate does', () => {
        expect(dashes(PLANNED)).toEqual([true, true]);
        expect(dashes(SAFE)).toEqual([true, false]); // left hashed, right solid
        expect(dashes(ARMED)).toEqual([false, false]);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s draws two parallel rails', (_l, name) => {
        const bars = render(name).graphic.geometry.coordinates;
        expect(bars.length).toBe(2);
        const heading = (b: number[][]) => Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]);
        expect(heading(bars[0])).toBeCloseTo(heading(bars[1]), 3);
        for (const bar of bars) for (const c of bar) expect(Number.isFinite(c[0]) && Number.isFinite(c[1])).toBe(true);
    });

    // The movement family's contract: `[start, end, width]`. Reversing it silently breaks
    // both the vertex drag and the width drag.
    it.each(NAMES.map(n => [String(n), n] as const))('%s emits [start, end, width] handles', (_l, name) => {
        const handles = render(name).handles.geometry.coordinates;
        expect(handles.length).toBe(3);
        expect(handles[0]).toEqual([0, 0]);
        expect(handles[1][0]).toBeCloseTo(0.4, 6);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s carries no amplifiers but does carry hostility', (_l, name) => {
        expect(render(name).labels.geometry.coordinates).toEqual([]);
        const fields = getGraphicFields(name);
        expect(fields.identifier1).toBe(false);
        expect(fields.status).toBe(false);
        expect(fields.hostility).toBe(true);
    });

    // The whole point of the change: the symbol lies along whatever the user drew,
    // rather than at a fixed 45°.
    it.each(NAMES.map(n => [String(n), n] as const))('%s follows the drawn line’s bearing', (_l, name) => {
        const heading = (coords: number[][]) => {
            const b = render(name, 1200, coords).graphic.geometry.coordinates[0];
            return Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]);
        };
        const east = heading([[0, 0], [0.5, 0]]);
        const north = heading([[0, 0], [0, 0.5]]);
        expect(Math.abs(east - north)).toBeGreaterThan(1); // radians: nowhere near parallel
    });

    it('separates the rails by the width it is given', () => {
        const gap = (width: number) => {
            const [left, right] = render(ARMED, width).graphic.geometry.coordinates;
            return Math.hypot(left[0][0] - right[0][0], left[0][1] - right[0][1]);
        };
        expect(gap(4000)).toBeGreaterThan(gap(1200));
    });

    it('survives geometry it cannot draw', () => {
        for (const name of NAMES) {
            expect(() => barSymbolStyleFunc(name)(new Feature({geometry: new MultiLineString([])}) as any, 20)).not.toThrow();
            expect(() => barSymbolStyleFunc(name)(new Feature({geometry: new Point([0, 0])}) as any, 20)).not.toThrow();
            expect(() => render(name, 1200, [[0, 0]])).not.toThrow();
        }
    });

    /**
     * Through the *holder*, not the style function. Every assertion above called
     * `barSymbolStyleFunc` directly, which is how a dash length of
     * `[10 * resolution, 7 * resolution]` shipped: OL's lineDash is canvas pixels, so at a
     * real resolution the dash became 200 px on a bar 50 px long and every state rendered
     * solid. Calling the function proves the flag; only drawing proves the dash.
     */
    it.each(NAMES.map(n => [String(n), n] as const))('%s dashes visibly at map scale', (_l, name) => {
        const res = 20;
        const handler: any = getController(name, res);
        handler.setBaseFeature(new Feature({geometry: new (require('ol/geom/LineString').default)([[500000, 2000000], [502000, 2002000]])}));
        const graphic = handler.getFeatures().find((f: any) => f.get('role') === 'graphic');
        const styles = (graphic.getStyle() as any)(graphic, res);

        // The rails are ~2800 m long at this base, i.e. 140 px at resolution 20.
        const railPx = 140;
        for (const st of styles) {
            const dash = st.getStroke()?.getLineDash();
            if (!dash) continue;
            // A dash longer than the rail it is drawn on is indistinguishable from solid.
            expect(Math.max(...dash)).toBeLessThan(railPx / 2);
        }
    });

    /**
     * **Three placed points as of 2026-09-05**, not two and a derived offset.
     *
     * 271201 names them and the third does a job of its own: *"point 3 defines the location
     * of one side of the symbol"*. It was a width amplifier the offset handle set; it is a
     * stored vertex now, so the separation is measured from the coordinates and every one of
     * the three is grabbable. @see carriesSeparationInBase
     */
    it.each(NAMES.map(n => [String(n), n] as const))('%s is drawn from three placed points', (_l, name) => {
        const controller: any = getController(name, 20);
        expect(controller).toBeInstanceOf(LineGraphicController);
        expect(controller.maxPoints).toBe(3);
        expect(baseVertexCount(name)).toBe(3);
        // All three move independently: an end lengthens the symbol, the side widens it.
        expect(controller.dragsVertices).toBe(true);
        // ...and a drag that grabs none of them does not quietly scale the whole graphic,
        // which would move the length and the width at once. @see NO_EDIT_STRETCH
        expect(editStretches(name)).toBe(false);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s keeps no width beside its base', (_l, name) => {
        // The coordinates carry the separation, so a stamped width would be a second copy.
        expect(carriesSeparationInBase(name)).toBe(true);
    });
});

/*
 * # 271204 is switched off — see ai/excluded-graphics.md
 *
 * Its Draw Rules cell is empty and the row inherits 271201's, so the Template is the only
 * statement of how three points lay four strokes out — and three readings of it produced
 * three different pictures. The graphic was commented out rather than shipped as a guess
 * (user's call, 2026-09-05), so these assertions have no enum member to name.
 *
 * **Kept, commented, next to the block they belong to.** They are the measurements the next
 * attempt has to satisfy, and re-deriving them from the plate is the expensive part. Uncomment
 * with the enum member.
 */
// describe('roadblock complete (executed)', () => {
//     const NAME = TacticalGraphicName.RoadblockCompleteExecuted;
//
//     /**
//      * A drawn centreline running due east, plus a half-width.
//      *
//      * **271204 is drawn, not dropped, as of 2026-09-05.** Its own Draw Rules cell is empty
//      * and the row inherits 271201's — the centreline-and-width rule that governs the whole
//      * demolition block — and its Template letters PT 1, PT 2 and PT 3 against the crosses.
//      * @see RoadblockComplete
//      */
//     const geom = (width = 2000): number[][][] => {
//         const out: any = renderTacticalGraphic({
//             type: 'Feature',
//             geometry: {type: 'LineString', coordinates: [[0, 0], [0.09, 0]]},
//             properties: {tacticalGraphic: {name: NAME, width}},
//         } as any);
//         return out.graphic.geometry.coordinates;
//     };
//
//     it('draws two overlapping crosses - four bars, a leaning pair each way', () => {
//         const bars = geom();
//         expect(bars.length).toBe(4);
//         const lean = (b: number[][]) => Math.sign(b[1][1] - b[0][1]) * Math.sign(b[1][0] - b[0][0]);
//         // Two bars lean one way, two the other. A symbol whose bars all lean together is
//         // two parallel pairs, not a pair of crosses.
//         const leans = bars.map(lean);
//         expect(leans.filter(l => l > 0).length).toBe(2);
//         expect(leans.filter(l => l < 0).length).toBe(2);
//     });
//
//     it('spans the box points 1, 2 and 3 describe, so every handle lands on the figure', () => {
//         /*
//          * **The defect a user reported, stated as a measurement.** The four strokes used to be
//          * laid out from the *centre* at a fixed 45-degree lean, half a span long each way — so
//          * the figure's extent had nothing to do with where the three points were. Both end
//          * grips sat outside the drawing and the side grip floated beside it.
//          *
//          * They are the diagonals of the same box the readiness states fill with rails, so the
//          * symbol reaches points 1 and 2 the way an explosives rail does. (User's call,
//          * 2026-09-05.) @see ExplosivesReadiness.rails
//          */
//         const out: any = renderTacticalGraphic({
//             type: 'Feature',
//             geometry: {type: 'LineString', coordinates: [[0, 0], [0.09, 0], [0.045, 0.02]]},
//             properties: {tacticalGraphic: {name: NAME}},
//         } as any);
//         const bars: number[][][] = out.graphic.geometry.coordinates;
//         const handles: number[][] = out.handles.geometry.coordinates;
//
//         const lons = bars.flat().map(c => c[0]);
//         const lats = bars.flat().map(c => c[1]);
//         // Points 1 and 2 lie within the figure's own span rather than outside it, and the
//         // side grip is inside its height. The old layout failed all three.
//         for (const grip of handles) {
//             expect(grip[0]).toBeGreaterThanOrEqual(Math.min(...lons) - 1e-9);
//             expect(grip[0]).toBeLessThanOrEqual(Math.max(...lons) + 1e-9);
//             expect(grip[1]).toBeGreaterThanOrEqual(Math.min(...lats) - 1e-9);
//             expect(grip[1]).toBeLessThanOrEqual(Math.max(...lats) + 1e-9);
//         }
//         // ...and the box's own corners are reached: the figure is as wide as point 3 says.
//         expect(Math.max(...lats)).toBeGreaterThan(0.015);
//     });
//
//     it('doubles each arm, so the four strokes are two parallel pairs', () => {
//         // The plate draws an X with each arm doubled, which is two crossings rather than one.
//         // A pair whose members are not parallel is a different picture entirely.
//         const bars = geom();
//         const bearing = (b: number[][]) => Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]);
//         expect(bearing(bars[0])).toBeCloseTo(bearing(bars[1]), 3);
//         expect(bearing(bars[2])).toBeCloseTo(bearing(bars[3]), 3);
//         /*
//          * ...and the two pairs are not parallel to each other, or there is no cross at all.
//          *
//          * **How wide the X opens is now a consequence of the box, not a constant.** The
//          * strokes used to lean a fixed 45 degrees off the axis whatever was drawn; as the
//          * box's diagonals they open with its aspect ratio, so a long thin roadblock draws a
//          * flat X and a short wide one a steep cross. That follows from taking points 1, 2 and
//          * 3 seriously as the figure's extent, which is what put the handles back on the
//          * symbol — so the floor here is "the pairs genuinely cross", not a fixed angle.
//          */
//         expect(Math.abs(bearing(bars[0]) - bearing(bars[2]))).toBeGreaterThan(0.1);
//     });
//
//     it('offsets the doubled arm ALONG the axis, because it cannot be done inside the box', () => {
//         /*
//          * **Why the doubling moves the whole X rather than sliding one stroke sideways.**
//          *
//          * A stroke parallel to a box diagonal keeps *both* ends on the two end edges only
//          * when it is that diagonal: with the ends at `p1 + a·n` and `p2 - b·n`, staying
//          * parallel needs `a + b = 2·half`, which inside the box (`a, b <= half`) has the
//          * single solution `a = b = half`. So the second arm has to be the first X displaced,
//          * and the displacement runs along the drawn axis. (User's call, 2026-09-05.)
//          */
//         const bars = geom();
//         const mid = (b: number[][]) => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
//         // The centreline runs due east, so along it is east-west: within each lean the two
//         // strokes share a latitude and differ in longitude. Across would be the reverse.
//         for (const [back, front] of [[0, 1], [2, 3]]) {
//             expect(mid(bars[back])[1]).toBeCloseTo(mid(bars[front])[1], 9);
//             expect(mid(bars[front])[0]).toBeGreaterThan(mid(bars[back])[0]);
//         }
//     });
//
//     it('keeps the two crossings on the centreline, symmetric about its middle', () => {
//         // The figure is centred on the line the operator drew: displacing the X along the
//         // axis moves the crossings along it and nowhere else, so the symbol cannot drift to
//         // one side of the road it is laid across.
//         const bars = geom();
//         const mid = (b: number[][]) => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
//         const centres = bars.map(mid);
//         for (const c of centres) expect(c[1]).toBeCloseTo(0, 9);
//         const centre = 0.045;
//         const offsets = centres.map(c => c[0] - centre);
//         expect(Math.max(...offsets)).toBeCloseTo(-Math.min(...offsets), 9);
//     });
//
//     it('turns with the line it was drawn along', () => {
//         /*
//          * The whole point of leaving the point-drop: a roadblock could only ever be laid
//          * across a road running the default way. Drawn north-east, the symbol goes with it.
//          */
//         const out: any = renderTacticalGraphic({
//             type: 'Feature',
//             geometry: {type: 'LineString', coordinates: [[0, 0], [0.06, 0.06]]},
//             properties: {tacticalGraphic: {name: NAME, width: 2000}},
//         } as any);
//         const bars: number[][][] = out.graphic.geometry.coordinates;
//         /*
//          * Drawn north-east, the doubling runs north-east too: the second X is the first
//          * displaced **along** the axis. Asserted as a dot product, which is the statement
//          * itself — an offset square to the axis would put the two crossings either side of
//          * the road rather than along it.
//          */
//         const mid = (b: number[][]) => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
//         const [a, c] = [mid(bars[0]), mid(bars[1])];
//         const offset = [c[0] - a[0], c[1] - a[1]];
//         const axis = [0.06, 0.06];
//         const along = offset[0] * axis[0] + offset[1] * axis[1];
//         const across = offset[0] * axis[1] - offset[1] * axis[0];
//         expect(Math.abs(across)).toBeLessThan(Math.abs(along) * 1e-6);
//     });
//
//     it('spreads the crosses by the width, not by a locked ratio', () => {
//         // Point 3 sets the separation. It used to be pinned at the plate's own proportion,
//         // which is now only the default a freshly drawn symbol opens at.
//         const spread = (bars: number[][][]) => {
//             // Across the centreline now, so the separation is a distance rather than a
//             // difference in longitude. @see RoadblockComplete.bars
//             const mid = (b: number[][]) => [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
//             const [a, c] = [mid(bars[0]), mid(bars[1])];
//             return Math.hypot(c[0] - a[0], c[1] - a[1]);
//         };
//         expect(spread(geom(6000))).toBeGreaterThan(spread(geom(2000)) * 2);
//     });
//
//     it('draws every bar solid', () => {
//         const bars = geom();
//         const styles = barSymbolStyleFunc(NAME)(new Feature({geometry: new MultiLineString(bars)}) as any, 20) as any[];
//         expect(styles.length).toBe(4);
//         for (const st of styles) expect(st.getStroke().getLineDash()).toBeFalsy();
//     });
//
//     it('is drawn from three placed points, and turns', () => {
//         const controller: any = getController(NAME, 20);
//         expect(controller.maxPoints).toBe(3);
//         expect(controller.type).toBe('LineString');
//         expect(baseVertexCount(NAME)).toBe(3);
//         expect(controller.dragsVertices).toBe(true);
//         expect(carriesSeparationInBase(NAME)).toBe(true);
//     });
//
//     it('carries affiliation and nothing else', () => {
//         const fields = getGraphicFields(NAME);
//         expect(fields.hostility).toBe(true);
//         expect(fields.identifier1).toBe(false);
//         expect(fields.status).toBe(false);
//     });
// });
