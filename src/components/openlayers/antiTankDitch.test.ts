import Feature from 'ol/Feature';
import Fill from 'ol/style/Fill';
import MultiLineString from 'ol/geom/MultiLineString';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import {ANTI_TANK_DITCH_TEETH, TacticalGraphicName, renderTacticalGraphic} from '@zaes/tactical-graphics';
import {antiTankDitchStyleFunc} from './openlayerStyles';
import {getGraphicFields} from './graphicFieldRegistry';
import {getController} from './controllerRegistry';
import {PointDropController} from './controllers/MissionTaskController';

const UNDER = TacticalGraphicName.AntiTankDitchUnderConstruction;
const DONE = TacticalGraphicName.AntiTankDitchCompleted;
const MINED = TacticalGraphicName.AntiTankDitchReinforcedWithMines;
const NAMES = [UNDER, DONE, MINED];

const rings = (name: TacticalGraphicName, radius = 1000): number[][][] => {
    const out: any = renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {tacticalGraphic: {name, radius}},
    } as any);
    return out.graphic.geometry.coordinates;
};

const styles = (name: TacticalGraphicName) =>
    antiTankDitchStyleFunc(name)(new Feature({geometry: new MultiLineString(rings(name))}) as any, 20) as any[];

describe('anti-tank ditches', () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s draws three closed teeth', (_l, name) => {
        const r = rings(name);
        expect(r.length).toBeGreaterThanOrEqual(ANTI_TANK_DITCH_TEETH);
        for (let i = 0; i < ANTI_TANK_DITCH_TEETH; i++) {
            // Closed ring, and the base is two points with the apex between them.
            expect(r[i][0]).toEqual(r[i][r[i].length - 1]);
            expect(r[i].length).toBe(4);
        }
    });

    // Fill is the whole distinction between the first two states. Asserted through the
    // style function, because it is the only place fill exists - the geometry is identical.
    it('outlines under construction and fills completed', () => {
        const teeth = (name: TacticalGraphicName) => styles(name).slice(0, ANTI_TANK_DITCH_TEETH);
        for (const st of teeth(UNDER)) {
            expect(st.getFill()).toBeFalsy();
            expect(st.getGeometry()).not.toBeInstanceOf(Polygon);
        }
        for (const st of teeth(DONE)) {
            expect(st.getFill()).toBeInstanceOf(Fill);
            expect(st.getGeometry()).toBeInstanceOf(Polygon);
        }
        // The two share their geometry exactly, so nothing but the style may differ.
        expect(rings(UNDER)).toEqual(rings(DONE));
    });

    it('puts a solid mine between each pair of teeth, and only on the reinforced state', () => {
        expect(rings(UNDER).length).toBe(ANTI_TANK_DITCH_TEETH);
        expect(rings(DONE).length).toBe(ANTI_TANK_DITCH_TEETH);
        expect(rings(MINED).length).toBe(ANTI_TANK_DITCH_TEETH + (ANTI_TANK_DITCH_TEETH - 1));

        const r = rings(MINED);
        const midX = (ring: number[][]) => (Math.min(...ring.map(c => c[0])) + Math.max(...ring.map(c => c[0]))) / 2;
        // Each mine sits between the teeth either side of it - the thing the user asked for.
        for (let m = ANTI_TANK_DITCH_TEETH; m < r.length; m++) {
            const i = m - ANTI_TANK_DITCH_TEETH;
            expect(midX(r[m])).toBeGreaterThan(Math.max(...r[i].map(c => c[0])));
            expect(midX(r[m])).toBeLessThan(Math.min(...r[i + 1].map(c => c[0])));
        }
        // Mines are mines, not outlines of mines - solid even though the flag governs teeth.
        for (const st of styles(MINED).slice(ANTI_TANK_DITCH_TEETH)) expect(st.getFill()).toBeInstanceOf(Fill);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s ignores rotation and scales with radius', (_l, name) => {
        const out = (radius: number, rotation: number) => {
            const o: any = renderTacticalGraphic({
                type: 'Feature',
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {tacticalGraphic: {name, radius, rotation}},
            } as any);
            return JSON.stringify(o.graphic.geometry.coordinates);
        };
        expect(out(1000, 90)).toEqual(out(1000, 0));
        expect(out(2000, 0)).not.toEqual(out(1000, 0));
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s is one click, resizable, never rotated', (_l, name) => {
        const controller: any = getController(name, 20);
        expect(controller).toBeInstanceOf(PointDropController);
        expect(controller.type).toBe('Point');
        const size = controller.graphic.size;
        controller.handleResize(400);
        expect(controller.graphic.size).not.toBe(size);
        const rotation = controller.graphic.rotation;
        controller.handleRotate(45);
        expect(controller.graphic.rotation).toBe(rotation);
    });

    it.each(NAMES.map(n => [String(n), n] as const))('%s carries affiliation and nothing else', (_l, name) => {
        const fields = getGraphicFields(name);
        expect(fields.hostility).toBe(true);
        expect(fields.identifier1).toBe(false);
        expect(fields.status).toBe(false);
    });

    it('survives geometry it cannot draw', () => {
        for (const name of NAMES) {
            expect(() => antiTankDitchStyleFunc(name)(new Feature({geometry: new MultiLineString([])}) as any, 20)).not.toThrow();
            expect(() => antiTankDitchStyleFunc(name)(new Feature({geometry: new Point([0, 0])}) as any, 20)).not.toThrow();
        }
    });
});
