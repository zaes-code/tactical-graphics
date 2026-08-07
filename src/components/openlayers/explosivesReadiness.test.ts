import Feature from 'ol/Feature';
import MultiLineString from 'ol/geom/MultiLineString';
import Point from 'ol/geom/Point';
import {TacticalGraphicName, renderTacticalGraphic} from '@zaes/tactical-graphics';
import {barSymbolStyleFunc} from './openlayerStyles';
import {getGraphicFields} from './graphicFieldRegistry';
import {getController} from './controllerRegistry';
import {PointDropController} from './controllers/MissionTaskController';

const PLANNED = TacticalGraphicName.ExplosivesPlannedStateOfReadiness;
const SAFE = TacticalGraphicName.ExplosivesStateOfReadiness1Safe;
const ARMED = TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable;
const NAMES = [PLANNED, SAFE, ARMED];

/** Screen pixels the symbol is dropped at - keep in step with controllerRegistry. */
const EXPLOSIVES_DEFAULT_PX = 100;

const render = (name: TacticalGraphicName, radius = 600, rotation = 0) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {tacticalGraphic: {name, radius, rotation}},
    } as any) as any;

/** Which bars the style function dashes, leading bar first. */
const dashes = (name: TacticalGraphicName) => {
    const bars = render(name).graphic.geometry.coordinates;
    const styles = barSymbolStyleFunc(name)(new Feature({geometry: new MultiLineString(bars)}) as any, 20) as any[];
    return styles.map(s => !!s.getStroke().getLineDash());
};

describe('explosives states of readiness', () => {
    // The three are one shape; the dashing is the entire difference between them, so it is
    // the only thing worth asserting hard. Straight off the FM 1-02.2 table 5-19 plates.
    it('dashes each state the way the plate does', () => {
        expect(dashes(PLANNED)).toEqual([true, true]);
        expect(dashes(SAFE)).toEqual([true, false]); // left hashed, right solid
        expect(dashes(ARMED)).toEqual([false, false]);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s draws two parallel bars', (_l, name) => {
        const bars = render(name).graphic.geometry.coordinates;
        expect(bars.length).toBe(2);
        const heading = (b: number[][]) => Math.atan2(b[1][1] - b[0][1], b[1][0] - b[0][0]);
        expect(heading(bars[0])).toBeCloseTo(heading(bars[1]), 6);
        for (const bar of bars) for (const c of bar) expect(Number.isFinite(c[0]) && Number.isFinite(c[1])).toBe(true);
    });

    // Point-dropped and resizable, so `[edge, centre]` - handles[0] drives rotate and
    // resize, handles[1] drives translate. Reversing them silently breaks both gestures.
    it.each(NAMES.map(n => [String(n), n] as const))('%s emits [edge, centre] handles', (_l, name) => {
        const handles = render(name).handles.geometry.coordinates;
        expect(handles.length).toBe(2);
        expect(handles[1]).toEqual([0, 0]);
        expect(Math.hypot(handles[0][0], handles[0][1])).toBeGreaterThan(0);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s carries no amplifiers but does carry hostility', (_l, name) => {
        expect(render(name).labels.geometry.coordinates).toEqual([]);
        const fields = getGraphicFields(name);
        expect(fields.identifier1).toBe(false);
        expect(fields.status).toBe(false);
        expect(fields.hostility).toBe(true);
    });

    it('scales with radius', () => {
        const span = (r: number) => {
            const xs = render(ARMED, r).graphic.geometry.coordinates.flat().map((c: number[]) => c[0]);
            return Math.max(...xs) - Math.min(...xs);
        };
        expect(span(1200)).toBeGreaterThan(span(600));
    });

    // Fixed heading. This is not just "no rotate gesture": MissionTaskController's resize
    // drag derives an angle from the pointer and feeds it back as rotation, so a graphic
    // that honoured rotation would turn as a side effect of being scaled.
    it.each(NAMES.map(n => [String(n), n] as const))('%s ignores rotation entirely', (_l, name) => {
        const at = (rot: number) => JSON.stringify(render(name, 600, rot).graphic.geometry.coordinates);
        expect(at(90)).toEqual(at(0));
        expect(at(217)).toEqual(at(0));
    });

    // The plate has both bars spanning the same vertical extent - they are displaced
    // horizontally, not perpendicular to their own heading, which would stagger them.
    it.each(NAMES.map(n => [String(n), n] as const))('%s starts and ends both bars at the same Y', (_l, name) => {
        const [left, right] = render(name).graphic.geometry.coordinates;
        expect(left[0][1]).toBeCloseTo(right[0][1], 9);
        expect(left[1][1]).toBeCloseTo(right[1][1], 9);
        // ...and the left bar really is the left one, which is what EXPLOSIVES_DASHED indexes.
        expect(left[0][0]).toBeLessThan(right[0][0]);
        // Diagonal, not vertical or horizontal.
        expect(left[1][1]).toBeGreaterThan(left[0][1]);
        expect(left[1][0]).toBeGreaterThan(left[0][0]);
    });

    it('survives geometry it cannot draw', () => {
        for (const name of NAMES) {
            expect(() => barSymbolStyleFunc(name)(new Feature({geometry: new MultiLineString([])}) as any, 20)).not.toThrow();
            expect(() => barSymbolStyleFunc(name)(new Feature({geometry: new Point([0, 0])}) as any, 20)).not.toThrow();
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
        handler.graphic.updateGeom({size: res * EXPLOSIVES_DEFAULT_PX, center: [500000, 2000000], rotation: 0});
        const graphic = handler.getFeatures().find((f: any) => f.get('role') === 'graphic');
        const styles = (graphic.getStyle() as any)(graphic, res);

        const barPx = EXPLOSIVES_DEFAULT_PX;
        for (const st of styles) {
            const dash = st.getStroke().getLineDash();
            if (!dash) continue;
            // A dash longer than the bar it is drawn on is indistinguishable from solid.
            expect(Math.max(...dash)).toBeLessThan(barPx / 2);
        }
    });

    // One click drops it at a default size; resizing is a later, separate gesture.
    it.each(NAMES.map(n => [String(n), n] as const))('%s is dropped by a single click and stays resizable', (_l, name) => {
        const controller: any = getController(name, 20);
        expect(controller).toBeInstanceOf(PointDropController);
        expect(controller.type).toBe('Point');

        const before = controller.graphic.size;
        controller.handleResize(500);
        expect(controller.graphic.size).not.toBe(before);

        // ...but never rotatable.
        const rotation = controller.graphic.rotation;
        controller.handleRotate(45);
        expect(controller.graphic.rotation).toBe(rotation);
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
