import Feature from 'ol/Feature';
import Fill from 'ol/style/Fill';
import LineString from 'ol/geom/LineString';
import MultiLineString from 'ol/geom/MultiLineString';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import {TacticalGraphicName, renderTacticalGraphic} from '@zaes/tactical-graphics';
import {antiTankDitchStyleFunc} from './openlayerStyles';
import {getGraphicFields} from './graphicFieldRegistry';

const UNDER = TacticalGraphicName.AntiTankDitchUnderConstruction;
const DONE = TacticalGraphicName.AntiTankDitchCompleted;
const MINED = TacticalGraphicName.AntiTankDitchReinforcedWithMines;
const NAMES = [UNDER, DONE, MINED];

const LONG = new MultiLineString([[[0, 0], [4000, 0]]]);
const styleOf = (name: TacticalGraphicName, geom: any = LONG, resolution = 4) =>
    antiTankDitchStyleFunc(name)(new Feature({geometry: geom}) as any, resolution) as any[];

/** Everything after the route stroke: the teeth, then the mines. */
const decorations = (name: TacticalGraphicName, resolution = 4) => styleOf(name, LONG, resolution).slice(1);

describe('anti-tank ditches', () => {
    // Line-drawn like the wire obstacles, not point-dropped: the geometry is the route the
    // user drew and the teeth are a screen-space decoration.
    it.each(NAMES.map(n => [String(n), n] as const))('%s returns the drawn route, not the teeth', (_l, name) => {
        const out: any = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[0, 0], [0.05, 0]]},
            properties: {tacticalGraphic: {name}},
        } as any);
        expect(out.graphic.geometry.coordinates).toEqual([[[0, 0], [0.05, 0]]]);
    });

    // Teeth fill consecutive slots, so their bases touch. On the reinforced state every
    // other slot holds a mine instead, which is what keeps the mines legible - see the
    // style function - so there the teeth touch the mines rather than each other.
    it.each([['under construction', UNDER], ['completed', DONE]] as const)('%s teeth touch base to base', (_l, name) => {
        const ringOf = (st: any) => {
            const g = st.getGeometry();
            return g instanceof Polygon ? g.getCoordinates()[0] : (g as LineString).getCoordinates();
        };
        const teeth = decorations(name);
        expect(teeth.length).toBeGreaterThan(2);
        for (let i = 0; i + 1 < teeth.length; i++) {
            expect(ringOf(teeth[i])[1][0]).toBeCloseTo(ringOf(teeth[i + 1])[0][0], 6);
        }
    });

    // Equilateral, on every state. The ratio is also what governs how open the notch
    // between two teeth is, so a "tidy" round number here silently squeezes the mines.
    it.each(NAMES.map(n => [String(n), n] as const))('%s draws equilateral teeth', (_l, name) => {
        const ringOf = (st: any) => {
            const g = st.getGeometry();
            return g instanceof Polygon ? g.getCoordinates()[0] : (g as LineString).getCoordinates();
        };
        const tooth = decorations(name).find(st => ringOf(st).length === 4);
        const [a1, b1, apex] = ringOf(tooth);
        const side = (p: number[], q: number[]) => Math.hypot(q[0] - p[0], q[1] - p[1]);
        const base = side(a1, b1);
        expect(side(b1, apex)).toBeCloseTo(base, 6);
        expect(side(apex, a1)).toBeCloseTo(base, 6);
    });

    // Fill is the whole distinction between the first two states; the geometry is identical.
    it('outlines under construction and fills completed', () => {
        for (const st of decorations(UNDER)) {
            expect(st.getFill()).toBeFalsy();
            expect(st.getGeometry()).not.toBeInstanceOf(Polygon);
        }
        for (const st of decorations(DONE)) {
            expect(st.getFill()).toBeInstanceOf(Fill);
            expect(st.getGeometry()).toBeInstanceOf(Polygon);
        }
        expect(decorations(UNDER).length).toBe(decorations(DONE).length);
    });

    it('nests one mine per notch, never at either end', () => {
        const all = decorations(MINED);
        const isTooth = (st: any) => (st.getGeometry() as Polygon).getCoordinates()[0].length === 4;
        const teeth = all.filter(isTooth);
        const mines = all.filter((st: any) => !isTooth(st));

        // A notch needs a tooth either side, so there is exactly one fewer mine than tooth.
        // Any other count means one landed past the end of the run.
        expect(mines.length).toBe(teeth.length - 1);
        expect(mines.length).toBeGreaterThan(0);
        for (const m of mines) expect(m.getFill()).toBeInstanceOf(Fill);

        const midX = (st: any) => {
            const xs = (st.getGeometry() as Polygon).getCoordinates()[0].map((c: number[]) => c[0]);
            return (Math.min(...xs) + Math.max(...xs)) / 2;
        };
        // Each mine sits in the notch between the two teeth either side of it.
        const sorted = [...mines].sort((a, b) => midX(a) - midX(b));
        sorted.forEach((m, i) => {
            expect(midX(m)).toBeGreaterThan(midX(teeth[i]));
            expect(midX(m)).toBeLessThan(midX(teeth[i + 1]));
        });
    });

    // Filled shapes are not also stroked. A stroke straddles its edge, so it inflates the
    // shape by half a line width - two teeth sharing a base corner then overlap by a full
    // stroke rather than meeting, and a stroked mine eats the gap keeping it legible.
    it('does not stroke the shapes it fills', () => {
        for (const st of decorations(DONE)) {
            expect(st.getFill()).toBeInstanceOf(Fill);
            expect(st.getStroke()).toBeFalsy();
        }
        for (const st of decorations(MINED)) expect(st.getStroke()).toBeFalsy();
        // ...but an outlined tooth is all stroke, so it must keep one.
        for (const st of decorations(UNDER)) expect(st.getStroke()).toBeTruthy();
    });

    // Pixel-constant, the reason the teeth moved into the style function at all.
    //
    // Measured on a long route on purpose. `decorationScale` caps the teeth against the
    // shape's own on-screen size, so on a short one they legitimately shrink as you zoom
    // out - an earlier version of this test straddled that cap and read the cap engaging
    // as a loss of pixel-constancy.
    it('keeps teeth the same size on screen across zoom levels', () => {
        const toothPx = (resolution: number) => {
            const geom = new MultiLineString([[[0, 0], [40000, 0]]]);
            const st = styleOf(DONE, geom, resolution).slice(1)[0];
            const ring = (st.getGeometry() as Polygon).getCoordinates()[0];
            return Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]) / resolution;
        };
        expect(toothPx(2)).toBeCloseTo(toothPx(8), 6);
    });

    it('drops the teeth on a route too short to carry them, keeping the line', () => {
        const styles = styleOf(DONE, new MultiLineString([[[0, 0], [60, 0]]]), 20);
        expect(styles.length).toBe(1);
        expect(styles[0].getGeometry()).toBeInstanceOf(LineString);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s carries affiliation and nothing else', (_l, name) => {
        const fields = getGraphicFields(name);
        expect(fields.hostility).toBe(true);
        expect(fields.identifier1).toBe(false);
        expect(fields.status).toBe(false);
    });

    it('survives geometry it cannot draw', () => {
        for (const name of NAMES) {
            expect(() => styleOf(name, new MultiLineString([]))).not.toThrow();
            expect(() => styleOf(name, new MultiLineString([[[0, 0]]]))).not.toThrow();
            expect(() => styleOf(name, new Point([0, 0]))).not.toThrow();
        }
    });
});
