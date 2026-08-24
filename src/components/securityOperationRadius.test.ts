/**
 * # One figure for a symbol that is pinned to the screen
 *
 * Cover, Guard and Screen are pure screen geometry: every arm is
 * `SECURITY_OPERATION_HALF_EXTENT_PX` times the live resolution, so the symbol holds
 * 410 x 29 px at every zoom and refuses a resize — its size is not a user input.
 *
 * The two engines described that size differently. MapLibre computed the half-extent
 * inline and re-derived it on every build; OpenLayers filed **nothing**, so whatever a
 * snapshot happened to carry passed straight through. `compare:engines` read it as
 * `radius 180000 vs 1320000` for weeks — a stale figure from the file's own zoom beside a
 * current one.
 *
 * **Not inert, which is the trap here.** Clearing the number instead of sharing it looked
 * right in a unit test — the adapter still returned a graphic — and collapsed the symbol
 * to 17 x 1 px in the running app, because the generator lays the arms out from it. The
 * app is what caught that; these assertions are what keep the two engines saying the same
 * thing about it.
 */

import {SECURITY_OPERATION_HALF_EXTENT_PX, SECURITY_OPERATION_PX, TacticalGraphicName} from '@zaes/tactical-graphics';
import {Feature} from 'ol';
import {Point} from 'ol/geom';
import {getController} from './openlayers/controllerRegistry';
import {buildTacticalGraphic} from './maplibre/maplibreAdapter';

const RES = 2_000;
const SECURITY_OPERATIONS = [TacticalGraphicName.Cover, TacticalGraphicName.Guard, TacticalGraphicName.Screen];

const openlayersRadius = (name: TacticalGraphicName): number | undefined => {
    const handler = getController(name, RES) as unknown as {
        graphic: {setBaseFeature(base: Feature<Point>): void};
        getFeatures(): Feature[];
    };
    handler.graphic.setBaseFeature(new Feature(new Point([0, 0])));
    return handler.getFeatures()
        .map(feature => (feature.get('tacticalGraphic') as {radius?: number} | undefined)?.radius)
        .find(radius => radius !== undefined);
};

const maplibreRadius = (name: TacticalGraphicName, supplied: {radius?: number} = {}): number | undefined =>
    buildTacticalGraphic(name, {type: 'Point', coordinates: [0, 0]}, supplied, RES)?.properties.radius;

describe('the size a security operation files', () => {
    it('is the arms and the label padding, stated by the library', () => {
        expect(SECURITY_OPERATION_HALF_EXTENT_PX).toBe(
            SECURITY_OPERATION_PX.labelPadding + SECURITY_OPERATION_PX.labelGap + 2 * SECURITY_OPERATION_PX.arrowLength,
        );
        expect(SECURITY_OPERATION_HALF_EXTENT_PX).toBe(220);
    });

    it.each(SECURITY_OPERATIONS)('is the same on both engines — %s', name => {
        const expected = SECURITY_OPERATION_HALF_EXTENT_PX * RES;

        expect(maplibreRadius(name)).toBeCloseTo(expected, 0);
        expect(openlayersRadius(name)).toBeCloseTo(expected, 0);
    });

    /**
     * **And a figure from a file cannot outrank it.** A snapshot's `radius` is metres from
     * some other zoom; honouring it would build the symbol at a size it is not drawn at,
     * which is exactly what the override in `buildTacticalGraphic` is there to stop.
     */
    it('overrides whatever the description carried', () => {
        expect(maplibreRadius(TacticalGraphicName.Screen, {radius: 7_000}))
            .toBeCloseTo(SECURITY_OPERATION_HALF_EXTENT_PX * RES, 0);
    });

    /** The override is this family's rule, not a general one. */
    it('leaves a sized circle alone', () => {
        const secure = buildTacticalGraphic(
            TacticalGraphicName.Secure,
            {type: 'Point', coordinates: [0, 0]},
            // `rotation` as well: a point-anchored generator reaches `Math.cos` with it and
            // comes back NaN, so a bag without one builds nothing at all.
            {radius: 70_000, rotation: 0},
            RES,
        );
        expect(secure!.properties.radius).toBe(70_000);
    });
});
