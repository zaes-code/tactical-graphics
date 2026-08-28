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
        // Same number of screen pixels at both zooms; only the meter size changes.
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

    // High wire fence is low wire fence plus an overline, so it carries two wires - one
    // under the marks and one over - where low wire fence carries only the lower.
    it('gives high wire fence a wire above and below its marks', () => {
        const railYs = (name: TacticalGraphicName) =>
            (styleOf(name, LONG, 1).map(s => s.getGeometry()).filter(g => g instanceof LineString) as LineString[])
                .map(g => g.getCoordinates()[0][1])
                .sort((a, b) => a - b);
        const high = railYs(TacticalGraphicName.WireHighWireFence);
        expect(high.length).toBe(2);
        expect(high[0]).toBeLessThan(0);
        expect(high[1]).toBeGreaterThan(0);
        expect(railYs(TacticalGraphicName.WireLowWireFence).length).toBe(1);
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

    // The failure this missed for two rounds: every test above draws a straight line, and
    // on a straight line a wrong offset is still parallel. A bend is what separates a true
    // parallel from a per-segment one - the under-wire and over-wire visibly splayed.
    //
    // Parallelism is asserted per *segment*, not per vertex. Two true parallels meet their
    // corners on the bisector, so their miter vertices sit further apart than the lines
    // themselves - measuring vertex to vertex reports a gap that is correct and looks wrong.
    it.each([
        ['high wire fence', TacticalGraphicName.WireHighWireFence],
        ['triple strand concertina', TacticalGraphicName.WireTripleStrandConcertina],
    ])('keeps %s rails parallel around a bend', (_l, name) => {
        const bent = new MultiLineString([[[0, 0], [4000, 0], [7000, 3000], [11000, 3000]]]);
        const rails = (wireObstacleStyleFunc(name)(new Feature({geometry: bent}) as any, 1) as any[])
            .map(st => st.getGeometry())
            .filter(g => g instanceof LineString) as LineString[];
        expect(rails.length).toBe(2);

        const [a, b] = rails.map(r => r.getCoordinates());
        expect(a.length).toBe(b.length);

        const seps: number[] = [];
        for (let i = 0; i + 1 < a.length; i++) {
            const [ax, ay] = [a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]];
            const [bx, by] = [b[i + 1][0] - b[i][0], b[i + 1][1] - b[i][1]];
            const [la, lb] = [Math.hypot(ax, ay), Math.hypot(bx, by)];
            // Same heading: the cross product of the two unit directions is zero.
            expect((ax / la) * (by / lb) - (ay / la) * (bx / lb)).toBeCloseTo(0, 9);
            // Perpendicular distance from b's segment to a's line - constant if parallel.
            seps.push(Math.abs(((b[i][0] - a[i][0]) * -ay + (b[i][1] - a[i][1]) * ax) / la));
        }
        for (const sep of seps) expect(sep).toBeCloseTo(seps[0], 6);
        expect(seps[0]).toBeGreaterThan(0);
    });
});
