import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import MultiLineString from 'ol/geom/MultiLineString';
import Point from 'ol/geom/Point';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {wireObstacleStyleFunc} from './openlayerStyles';
import {getGraphicFields} from './graphicFieldRegistry';

const NAMES = Object.values(TacticalGraphicName).filter(n => String(n).startsWith('Wire')) as TacticalGraphicName[];

/**
 * The style function is where a wire obstacle is actually drawn, and until now nothing
 * exercised it: `wireSmoke` only ever called the generator. A throw in here is a crash on
 * every render, which is what "some are still crashing" was.
 */
const styleOf = (name: TacticalGraphicName, geom: any, resolution = 20) =>
    wireObstacleStyleFunc(name)(Object.assign(new Feature({geometry: geom}), {}) as any, resolution) as any[];

const LONG = new MultiLineString([[[0, 0], [8000, 0]]]);

describe('wireObstacleStyleFunc', () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s draws marks on a normal line', (_l, name) => {
        const styles = styleOf(name, LONG);
        expect(styles.length).toBeGreaterThan(0);
        for (const s of styles) expect(s.getGeometry()).toBeTruthy();
    });

    // Everything the draw interaction and the modify interaction can hand a style function.
    const DEGENERATE: [string, any][] = [
        ['an empty MultiLineString', new MultiLineString([])],
        ['a one-point part', new MultiLineString([[[0, 0]]])],
        ['a zero-length segment', new MultiLineString([[[0, 0], [0, 0]]])],
        ['a bare LineString', new LineString([[0, 0], [500, 0]])],
        ['a Point', new Point([0, 0])],
    ];
    for (const [label, geom] of DEGENERATE) {
        it.each(NAMES.map(n => [String(n), n] as const))(`%s survives ${label}`, (_l, name) => {
            expect(() => styleOf(name, geom)).not.toThrow();
        });
    }

    it('survives a feature with no geometry at all', () => {
        for (const name of NAMES) expect(() => styleOf(name, undefined)).not.toThrow();
    });

    // Pixel-constant is the whole point of moving the marks here: zooming must not change
    // how big a mark is on screen, only how many fit.
    it('keeps marks the same size on screen across zoom levels', () => {
        const markSpan = (resolution: number) => {
            const styles = styleOf(TacticalGraphicName.WireSingleFence, new MultiLineString([[[0, 0], [100000, 0]]]), resolution);
            const marks = styles.map(s => s.getGeometry()).find(g => g instanceof MultiLineString) as MultiLineString;
            const part = marks.getCoordinates()[0];
            return Math.hypot(part[1][0] - part[0][0], part[1][1] - part[0][1]) / resolution;
        };
        // Same number of screen pixels at both zooms; only the metre size changes.
        expect(markSpan(40)).toBeCloseTo(markSpan(10), 6);
    });

    // decorationScale drops a decoration that would swamp a short line, leaving the wire.
    it('drops the marks on a line too short to carry them, keeping the route', () => {
        const styles = styleOf(TacticalGraphicName.WireSingleFence, new MultiLineString([[[0, 0], [80, 0]]]), 20);
        expect(styles.length).toBeGreaterThan(0);
        expect(styles.map(s => s.getGeometry()).some(g => g instanceof MultiLineString)).toBe(false);
    });

    // Unspecified has no rail, so if its marks scale away it would vanish entirely - the
    // user would have drawn something and seen nothing.
    it('still draws Unspecified when its marks scale away', () => {
        expect(styleOf(TacticalGraphicName.WireUnspecified, new MultiLineString([[[0, 0], [80, 0]]]), 20).length).toBeGreaterThan(0);
    });

    // The wire sits under the marks for low wire fence and through their middle elsewhere,
    // which is the only thing separating it from double apron fence.
    it('hangs the low wire fence rail under its marks', () => {
        const railY = (name: TacticalGraphicName) => {
            const styles = styleOf(name, LONG, 1);
            const rail = styles.map(s => s.getGeometry()).find(g => g instanceof LineString) as LineString;
            return rail.getCoordinates()[0][1];
        };
        expect(railY(TacticalGraphicName.WireLowWireFence)).toBeLessThan(0);
        expect(railY(TacticalGraphicName.WireDoubleApronFence)).toBe(0);
    });

    // 5 px between the two X's of a pair - the gap the user specified, in screen pixels at
    // any zoom, which is what asserting it at two resolutions proves.
    it('spaces the double fence pair 5 px apart', () => {
        const gapPx = (resolution: number) => {
            const styles = styleOf(TacticalGraphicName.WireDoubleFence, new MultiLineString([[[0, 0], [100000, 0]]]), resolution);
            const marks = (styles.map(s => s.getGeometry()).find(g => g instanceof MultiLineString) as MultiLineString).getCoordinates();
            // Marks come out as pairs of strokes per X; the 3rd stroke starts the 2nd X.
            const firstRight = Math.max(marks[0][0][0], marks[0][1][0]);
            const secondLeft = Math.min(marks[2][0][0], marks[2][1][0]);
            return (secondLeft - firstRight) / resolution;
        };
        expect(gapPx(10)).toBeCloseTo(5, 4);
        expect(gapPx(40)).toBeCloseTo(5, 4);
    });

    // No planned form, so no dash - and no status control in the dialog offering one.
    it('never dashes, whatever status is set', () => {
        for (const name of NAMES) {
            const f = new Feature({geometry: LONG});
            f.set('tacticalGraphic', {name, status: 'planned'});
            for (const st of wireObstacleStyleFunc(name)(f as any, 20) as any[])
                expect(st.getStroke()?.getLineDash() ?? null).toBeNull();
        }
    });

    it('offers neither status nor identifier fields, but does offer hostility', () => {
        for (const name of NAMES) {
            const fields = getGraphicFields(name);
            expect(fields.status).toBe(false);
            expect(fields.identifier1).toBe(false);
            expect(fields.hostility).toBe(true);
        }
    });
});
