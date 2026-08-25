import Feature from 'ol/Feature';
import MultiLineString from 'ol/geom/MultiLineString';
import Point from 'ol/geom/Point';
import {TacticalGraphicName, renderTacticalGraphic} from '@zaes/tactical-graphics';
import {barSymbolStyleFunc} from './openlayerStyles';
import {getGraphicFields} from './graphicFieldRegistry';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';
import {PointDropController} from './controllers/MissionTaskController';

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

    // Drawn as a two-point line now, not dropped by one click.
    it.each(NAMES.map(n => [String(n), n] as const))('%s is drawn as a two-point line', (_l, name) => {
        const controller: any = getController(name, 20);
        expect(controller).toBeInstanceOf(LineGraphicController);
        expect(controller.maxPoints).toBe(2);
    });
});

describe('roadblock complete (executed)', () => {
    const NAME = TacticalGraphicName.RoadblockCompleteExecuted;
    const geom = (): number[][][] => {
        const out: any = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'Point', coordinates: [0, 0]},
            properties: {tacticalGraphic: {name: NAME, radius: 1000}},
        } as any);
        return out.graphic.geometry.coordinates;
    };

    it('draws two overlapping crosses - four bars, a leaning pair each way', () => {
        const bars = geom();
        expect(bars.length).toBe(4);
        const lean = (b: number[][]) => Math.sign(b[1][1] - b[0][1]) * Math.sign(b[1][0] - b[0][0]);
        // Two bars lean one way, two the other. A symbol whose bars all lean together is
        // two parallel pairs, not a pair of crosses.
        const leans = bars.map(lean);
        expect(leans.filter(l => l > 0).length).toBe(2);
        expect(leans.filter(l => l < 0).length).toBe(2);
    });

    it('keeps the crosses level and side by side', () => {
        const bars = geom();
        // Within each lean, the pair shares its Y range - displaced east/west, not
        // perpendicular, which would set one cross diagonally above the other.
        for (const [i, j] of [[0, 1], [2, 3]]) {
            expect(bars[i][0][1]).toBeCloseTo(bars[j][0][1], 9);
            expect(bars[i][1][1]).toBeCloseTo(bars[j][1][1], 9);
            expect(bars[i][0][0]).toBeLessThan(bars[j][0][0]);
        }
    });

    // Read off the plate: `1 + SEPARATION_RATIO / cos45`. Too wide and it stops reading as
    // one overlapping symbol and becomes two separate X's, which is what 0.42 gave.
    it('matches the plate proportions', () => {
        const all = geom().flat();
        const xs = all.map(c => c[0]);
        const ys = all.map(c => c[1]);
        const aspect = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
        expect(aspect).toBeGreaterThan(1.2);
        expect(aspect).toBeLessThan(1.36);
    });

    it('draws every bar solid', () => {
        const bars = geom();
        const styles = barSymbolStyleFunc(NAME)(new Feature({geometry: new MultiLineString(bars)}) as any, 20) as any[];
        expect(styles.length).toBe(4);
        for (const st of styles) expect(st.getStroke().getLineDash()).toBeFalsy();
    });

    it('is dropped by a single click, resizable, never rotated', () => {
        const controller: any = getController(NAME, 20);
        expect(controller).toBeInstanceOf(PointDropController);
        expect(controller.type).toBe('Point');
        const size = controller.graphic.size;
        controller.handleResize(400);
        expect(controller.graphic.size).not.toBe(size);
        const rotation = controller.graphic.rotation;
        controller.handleRotate(45);
        expect(controller.graphic.rotation).toBe(rotation);
    });

    it('carries affiliation and nothing else', () => {
        const fields = getGraphicFields(NAME);
        expect(fields.hostility).toBe(true);
        expect(fields.identifier1).toBe(false);
        expect(fields.status).toBe(false);
    });
});
