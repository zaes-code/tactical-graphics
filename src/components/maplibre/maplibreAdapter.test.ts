/**
 * MapLibre adapter tests.
 *
 * These exist because of one bug that appeared **twice**, once in each renderer's
 * adapter, and was caught two completely different ways.
 *
 * `AreaDefense`, `CordonAndSearch`, `Isolate` and `Retain` emit their arcs,
 * arrowheads and solid teeth as a single `GeometryCollection`. Both adapters
 * originally returned `undefined` for that type, which meant the graphic was
 * registered as paintable, threw nothing, and drew nothing.
 *
 * On the OpenLayers side the existing hostility tests failed within the hour. On
 * the MapLibre side there was no coverage at all, and it surfaced only when the
 * sample sweep reported four graphics it could not build. This file is that
 * missing coverage.
 */

import {
    PAINTABLE_GRAPHICS,
    TacticalGraphicHostility,
    TacticalGraphicName,
    getColorByHostility,
    resetTacticalGraphicsConfig,
    supportsHostility,
} from '@zaes/tactical-graphics';
import {buildTacticalGraphic, paintTacticalGraphic, projectGeometry} from './maplibreAdapter';

const RESOLUTION = 1000;
const context = {resolution: RESOLUTION, measureText: (t: string) => t.length * 10};

beforeEach(() => resetTacticalGraphicsConfig());

describe('projectGeometry', () => {
    it('projects each geometry type, keeping its structure', () => {
        expect(projectGeometry({type: 'Point', coordinates: [0, 0]})!.type).toBe('Point');
        expect(projectGeometry({type: 'LineString', coordinates: [[0, 0], [1, 1]]})!.type).toBe('LineString');
        expect(projectGeometry({type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]})!.type).toBe('Polygon');
    });

    it('projects a GeometryCollection rather than refusing it', () => {
        const projected = projectGeometry({
            type: 'GeometryCollection',
            geometries: [
                {type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]]},
                {type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]},
            ],
        });
        expect(projected?.type).toBe('GeometryCollection');
        expect((projected as {geometries: unknown[]}).geometries).toHaveLength(2);
    });

    it('converts degrees to projected meters', () => {
        // 180° east is half the projected world — the one value worth pinning, since
        // a wrong radius or a degrees/radians slip would still produce plausible
        // numbers everywhere else.
        const point = projectGeometry({type: 'Point', coordinates: [180, 0]});
        expect((point as {coordinates: [number, number]}).coordinates[0]).toBeCloseTo(20037508.34, 1);
    });
});

describe('buildTacticalGraphic', () => {
    /**
     * Every graphic the registry claims to paint must actually build.
     *
     * This is the assertion that would have caught the GeometryCollection bug: all
     * four affected graphics were registered, so `isPaintable` said yes, and the
     * adapter then returned `undefined` for every one of them.
     */
    it('builds every paintable graphic from a base it accepts', () => {
        const failed: TacticalGraphicName[] = [];

        for (const name of PAINTABLE_GRAPHICS) {
            const candidates = [
                {type: 'LineString' as const, coordinates: [[-2, 0], [2, 0]]},
                {type: 'Polygon' as const, coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]},
                {type: 'Point' as const, coordinates: [0, 0]},
            ];
            // `rotation` is not optional in practice: the point-anchored generators feed
            // it into Math.cos/sin, and undefined yields NaN coordinates that turf
            // refuses — which reads as "the graphic just didn't draw".
            const built = candidates
                .map(geometry => buildTacticalGraphic(name, geometry, {radius: 180_000, rotation: 0}))
                .find(Boolean);
            if (!built) failed.push(name);
        }

        expect(failed).toEqual([]);
    });

    it('paints marks for every graphic it builds', () => {
        const blank: TacticalGraphicName[] = [];

        for (const name of PAINTABLE_GRAPHICS) {
            const candidates = [
                {type: 'LineString' as const, coordinates: [[-2, 0], [2, 0]]},
                {type: 'Polygon' as const, coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]},
                {type: 'Point' as const, coordinates: [0, 0]},
            ];
            const built = candidates
                .map(geometry => buildTacticalGraphic(name, geometry, {radius: 180_000, rotation: 0}))
                .find(Boolean);
            if (!built) continue;
            if (!paintTacticalGraphic(built, context).length) blank.push(name);
        }

        expect(blank).toEqual([]);
    });

    /**
     * The whole-catalog version of the exemption rule.
     *
     * `hostilityExemptions.test.ts` pins `lineColorOf`, which is where the rule is
     * enforced — but a paint function is free to resolve a color some other way,
     * and three of them legitimately do. This runs every graphic through the real
     * generator with a hostile bag and looks at the marks that come out, so a new
     * paint function that reaches for `getColorByHostility` directly is caught.
     *
     * The line of contact is the one graphic excluded, and it is excluded *because*
     * it draws a red wave: it renders both standard identities at once, by design.
     */
    it('never paints an exempt graphic in the hostile color', () => {
        const hostileRed = getColorByHostility(TacticalGraphicHostility.hostileFaker);
        const offenders: string[] = [];

        for (const name of PAINTABLE_GRAPHICS) {
            if (supportsHostility(name) || name === TacticalGraphicName.LineOfContact) continue;

            const candidates = [
                {type: 'LineString' as const, coordinates: [[-2, 0], [2, 0]]},
                {type: 'Polygon' as const, coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]},
                {type: 'Point' as const, coordinates: [0, 0]},
            ];
            const built = candidates
                .map(geometry => buildTacticalGraphic(name, geometry, {
                    radius: 180_000,
                    rotation: 0,
                    hostility: TacticalGraphicHostility.hostileFaker,
                }))
                .find(Boolean);
            if (!built) continue;

            const red = paintTacticalGraphic(built, context).some(paint =>
                paint.stroke?.color === hostileRed
                || paint.fill?.color === hostileRed
                || paint.circle?.fill?.color === hostileRed);
            if (red) offenders.push(name);
        }

        expect(offenders).toEqual([]);
    });

    /**
     * The contract is **never throw**, not "return undefined for input X".
     *
     * An earlier version of this test asserted that a one-point LineString comes back
     * `undefined`; it does not — the generators are more tolerant than expected and
     * happily build from a degenerate base. That is the generators' business. What
     * this adapter owes its caller is that a half-finished draw cannot crash the
     * render loop, so that is what is asserted.
     */
    it.each([
        ['a one-point LineString', {type: 'LineString' as const, coordinates: [[0, 0]]}],
        ['an empty LineString', {type: 'LineString' as const, coordinates: []}],
        ['an empty Polygon', {type: 'Polygon' as const, coordinates: []}],
    ])('does not throw on %s', (_label, geometry) => {
        expect(() => buildTacticalGraphic(TacticalGraphicName.PhaseLine, geometry)).not.toThrow();
    });
});

/**
 * The APP-06 constructions, through MapLibre's own build-and-paint path.
 *
 * The two renderers share the paint layer, so a geometry assertion in
 * `core/app6Conformance.test.ts` already covers what both of them draw. What is
 * *not* shared is this adapter — the decoration size it supplies, and whether it
 * hands the painter a feature the painter recognises. That is the half that broke
 * when abatis stopped being point-anchored, so it is the half tested here.
 *
 * MapLibre cannot be checked in a browser from this harness: its render loop is
 * driven by `requestAnimationFrame`, which a hidden automation tab never fires, so
 * the map's style never loads. @see ai/app-6.md, "Verifying MapLibre"
 */
describe('APP-06 constructions through the MapLibre adapter', () => {
    // At RESOLUTION the tooth is 26 km of ground, so both fixtures are drawn well
    // clear of it: a route shorter than twice the tooth is clamped on purpose, and
    // comparing a clamped tooth against an unclamped one proves nothing.
    const ABATIS_ROUTE = {
        type: 'LineString' as const,
        coordinates: [[-3.0, 51.0], [-1.5, 51.3], [0.5, 51.0], [2.0, 51.4]],
    };
    const ABATIS_SHORT = {type: 'LineString' as const, coordinates: [[-1.2, 51.0], [-0.2, 51.0]]};

    /** Distance in projected meters between two points of the painted line work. */
    const span = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    const abatisPath = (geometry: typeof ABATIS_ROUTE) => {
        const built = buildTacticalGraphic(TacticalGraphicName.Abatis, geometry, {}, RESOLUTION);
        expect(built).toBeDefined();
        const g = built!.graphic.geometry;
        expect(g.type).toBe('MultiLineString');
        return (g as {coordinates: number[][][]}).coordinates[0];
    };

    it('builds abatis from a drawn route and paints it', () => {
        const built = buildTacticalGraphic(TacticalGraphicName.Abatis, ABATIS_ROUTE, {}, RESOLUTION);
        expect(built).toBeDefined();
        expect(paintTacticalGraphic(built!, context).length).toBeGreaterThan(0);
    });

    it('sizes the tooth from the zoom, not from the length of the obstacle', () => {
        const long = abatisPath(ABATIS_ROUTE);
        const short = abatisPath(ABATIS_SHORT);

        // Points 0 and 2 are the tooth's feet, whatever the route does after them.
        const longTooth = span(long[0], long[2]);
        const shortTooth = span(short[0], short[2]);

        expect(longTooth).toBeGreaterThan(0);
        // Compared as a ratio, not an absolute: the tooth is a fixed *geodesic* size and
        // these are *projected* meters, so Mercator stretches it slightly differently at
        // each fixture's latitude. 2% is far tighter than the 5x a length-driven tooth
        // would show, and loose enough not to pin the projection's arithmetic.
        expect(Math.abs(shortTooth - longTooth) / longTooth).toBeLessThan(0.02);
        // ...and the two routes are genuinely different lengths.
        expect(span(long[0], long[long.length - 1])).toBeGreaterThan(span(short[0], short[short.length - 1]) * 3);
    });

    it('keeps the route’s own vertices, so the obstacle can follow a road', () => {
        expect(abatisPath(ABATIS_ROUTE).length).toBeGreaterThan(3);
    });

    it('offers a handle per end plus the chevron apex', () => {
        const built = buildTacticalGraphic(TacticalGraphicName.Abatis, ABATIS_ROUTE, {}, RESOLUTION);
        expect(built!.handles).toHaveLength(3);
    });
});
