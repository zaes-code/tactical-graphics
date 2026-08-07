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

    it('alternates tooth and mine, and never starts or ends with a mine', () => {
        const all = decorations(MINED);
        const isTooth = (st: any) => (st.getGeometry() as Polygon).getCoordinates()[0].length === 4;

        // Strict alternation, starting and ending with a tooth. Asserting the *sequence*
        // rather than the counts is what catches a mine landing at either end.
        expect(all.map(isTooth)).toEqual(all.map((_, i) => i % 2 === 0));
        expect(isTooth(all[0])).toBe(true);
        expect(isTooth(all[all.length - 1])).toBe(true);
        expect(all.length % 2).toBe(1);

        const mines = all.filter((st: any) => !isTooth(st));
        expect(mines.length).toBe(all.filter(isTooth).length - 1);
        for (const m of mines) expect(m.getFill()).toBeInstanceOf(Fill);
    });

    // Pixel-constant, the reason the teeth moved into the style function at all.
    it('keeps teeth the same size on screen across zoom levels', () => {
        const toothPx = (resolution: number) => {
            const st = decorations(DONE, resolution)[0];
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
