import Feature from 'ol/Feature';
import MultiLineString from 'ol/geom/MultiLineString';
import Point from 'ol/geom/Point';
import {TacticalGraphicName, renderTacticalGraphic} from '@zaes/tactical-graphics';
import {explosivesReadinessStyleFunc} from './openlayerStyles';
import {getGraphicFields} from './graphicFieldRegistry';

const PLANNED = TacticalGraphicName.ExplosivesPlannedStateOfReadiness;
const SAFE = TacticalGraphicName.ExplosivesStateOfReadiness1Safe;
const ARMED = TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable;
const NAMES = [PLANNED, SAFE, ARMED];

const render = (name: TacticalGraphicName, radius = 600, rotation = 0) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {tacticalGraphic: {name, radius, rotation}},
    } as any) as any;

/** Which bars the style function dashes, leading bar first. */
const dashes = (name: TacticalGraphicName) => {
    const bars = render(name).graphic.geometry.coordinates;
    const styles = explosivesReadinessStyleFunc(name)(new Feature({geometry: new MultiLineString(bars)}) as any, 20) as any[];
    return styles.map(s => !!s.getStroke().getLineDash());
};

describe('explosives states of readiness', () => {
    // The three are one shape; the dashing is the entire difference between them, so it is
    // the only thing worth asserting hard. Straight off the FM 1-02.2 table 5-19 plates.
    it('dashes each state the way the plate does', () => {
        expect(dashes(PLANNED)).toEqual([true, true]);
        expect(dashes(SAFE)).toEqual([false, true]);
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

    it('scales with radius and turns with rotation', () => {
        const span = (r: number, rot = 0) => {
            const all = render(ARMED, r, rot).graphic.geometry.coordinates.flat();
            const xs = all.map((c: number[]) => c[0]);
            return Math.max(...xs) - Math.min(...xs);
        };
        expect(span(1200)).toBeGreaterThan(span(600));
        expect(span(600, 90)).not.toBeCloseTo(span(600, 0), 6);
    });

    it('survives geometry it cannot draw', () => {
        for (const name of NAMES) {
            expect(() => explosivesReadinessStyleFunc(name)(new Feature({geometry: new MultiLineString([])}) as any, 20)).not.toThrow();
            expect(() => explosivesReadinessStyleFunc(name)(new Feature({geometry: new Point([0, 0])}) as any, 20)).not.toThrow();
        }
    });
});
