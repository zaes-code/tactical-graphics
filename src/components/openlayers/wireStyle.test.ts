import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import MultiLineString from 'ol/geom/MultiLineString';
import Point from 'ol/geom/Point';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {wireObstacleStyleFunc} from './openlayerStyles';

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
});
