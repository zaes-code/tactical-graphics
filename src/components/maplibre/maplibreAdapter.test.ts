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

    it('converts degrees to projected metres', () => {
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
     * The whole-catalogue version of the exemption rule.
     *
     * `hostilityExemptions.test.ts` pins `lineColorOf`, which is where the rule is
     * enforced — but a paint function is free to resolve a colour some other way,
     * and three of them legitimately do. This runs every graphic through the real
     * generator with a hostile bag and looks at the marks that come out, so a new
     * paint function that reaches for `getColorByHostility` directly is caught.
     *
     * The line of contact is the one graphic excluded, and it is excluded *because*
     * it draws a red wave: it renders both standard identities at once, by design.
     */
    it('never paints an exempt graphic in the hostile colour', () => {
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
