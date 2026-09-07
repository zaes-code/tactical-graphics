/**
 * # Where this engine puts a host-supplied centre symbol
 *
 * Five graphics carry one: the three security operations, the two follow tasks and the
 * escort. `imageKey.test.ts` covers how the raster is keyed once a placement exists; this
 * covers whether there is a placement at all, and whether it lands on the graphic.
 *
 * Both halves shipped broken on this engine and neither could be seen from a unit test,
 * because the placement was read by a private helper and the only assertion downstream of it
 * needed a GL context:
 *
 * - **Cover, guard and screen** fell through to a branch that required a `Point` base. They
 *   had one until 2026-08-29, when APP-06's four anchor points made the base a `LineString`;
 *   the branch has been unreachable ever since, so `placed` was `undefined` and the centre
 *   was empty on this engine while OpenLayers drew the symbol.
 * - **Follow and assume / follow and support** ran the *already projected* graphic geometry
 *   through `projectGeometry` a second time, which reads metres as degrees. A body centred at
 *   x = 7,532,595 came back at 828,283,312,397 with the latitude clamped to Mercator's limit,
 *   so the icon was registered and placed off the map.
 *
 * The assertion is therefore "the symbol sits inside the graphic it belongs to", which is
 * false in both ways at once — absent, and present at nonsense coordinates.
 */
import {
    TacticalGraphicName,
    setSecuritySymbolProvider,
    type SecuritySymbolProvider,
} from '@zaes/tactical-graphics';
import {buildSampleGraphics} from '../sampleGallery';
import type {MapLibreTacticalGraphic} from '../maplibreAdapter';
import {centerSymbolPlacement} from './NativeLayerRenderer';

const RES = 4000;
const CONTEXT = {resolution: RES, measureText: (text: string) => text.length * 8};

/**
 * A provider that returns an image and nothing else.
 *
 * Deliberately not milsymbol: nothing in this package names it, and what is under test is
 * the placement rather than the picture. @see core/securitySymbol.ts
 */
const PROVIDER: SecuritySymbolProvider = () => ({src: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E', sizePx: 25});

const SECURITY_OPERATIONS = [
    TacticalGraphicName.Cover,
    TacticalGraphicName.Guard,
    TacticalGraphicName.Screen,
];
const FOLLOW_TASKS = [TacticalGraphicName.FollowAndAssume, TacticalGraphicName.FollowAndSupport];

/** The graphic's own extent in projected metres, which is the frame its centre must fall in. */
function boundsOfGraphic(graphic: MapLibreTacticalGraphic): {minX: number; minY: number; maxX: number; maxY: number} {
    const xs: number[] = [];
    const ys: number[] = [];
    const walk = (node: unknown): void => {
        if (!Array.isArray(node) || !node.length) return;
        if (typeof node[0] === 'number') {
            xs.push(node[0] as number);
            ys.push(node[1] as number);
            return;
        }
        node.forEach(walk);
    };
    const geometry = graphic.graphic.geometry as {coordinates?: unknown; geometries?: unknown[]};
    if (geometry.geometries) geometry.geometries.forEach(m => walk((m as {coordinates: unknown}).coordinates));
    else walk(geometry.coordinates);
    return {minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys)};
}

describe('the centre symbol lands on its graphic', () => {
    let sheet: MapLibreTacticalGraphic[] = [];

    beforeAll(() => {
        setSecuritySymbolProvider(PROVIDER);
        sheet = buildSampleGraphics(undefined, RES).graphics;
    });
    afterAll(() => setSecuritySymbolProvider(undefined));

    /**
     * **Driven through the dispatch, not through the helper each family happens to use.**
     * The security operations' defect was in *which* helper they reached — the helper itself
     * was correct and unused — so a test that called it directly would have passed against
     * the bug. @see centerSymbolPlacement
     */
    const cases = [...SECURITY_OPERATIONS, ...FOLLOW_TASKS, TacticalGraphicName.Escort]
        .map(name => [String(name), name] as const);

    it.each(cases)('%s', (_label, name) => {
        const graphic = sheet.find(g => g.name === name)!;
        expect(graphic).toBeDefined();

        const placed = centerSymbolPlacement(graphic, CONTEXT);
        expect({name, placed: placed !== undefined}).toEqual({name, placed: true});

        // Returned in lon/lat, because that is what the icon source holds. A doubly
        // projected position clamps the latitude to Mercator's limit and runs the longitude
        // to hundreds of billions of metres, so both bounds matter.
        const [lon, lat] = placed!.at;
        expect({name, lon: Math.abs(lon) <= 180, lat: Math.abs(lat) <= 85}).toEqual({name, lon: true, lat: true});

        // And it is *this* graphic's centre, not merely a plausible coordinate.
        const at = toMercator(lon, lat);
        const bounds = boundsOfGraphic(graphic);
        expect({
            name,
            inside: at[0] >= bounds.minX && at[0] <= bounds.maxX && at[1] >= bounds.minY && at[1] <= bounds.maxY,
        }).toEqual({name, inside: true});

        expect(placed!.sizePx).toBeGreaterThan(0);
    });

    /**
     * Registering nothing is a supported state and must stay one — a host that has not asked
     * for a symbol gets an empty centre rather than a broken graphic. @see securitySymbol.ts
     */
    it('places nothing when no provider is registered', () => {
        setSecuritySymbolProvider(undefined);
        try {
            const cover = sheet.find(g => g.name === TacticalGraphicName.Cover)!;
            expect(centerSymbolPlacement(cover, CONTEXT)).toBeUndefined();
        } finally {
            setSecuritySymbolProvider(PROVIDER);
        }
    });
});

/** lon/lat → projected metres. Local, so this suite pulls in no renderer module for it. */
function toMercator(lon: number, lat: number): [number, number] {
    const R = 6378137;
    return [
        (lon * Math.PI * R) / 180,
        R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
    ];
}
