/**
 * # A rectangle's `radius` is not its half-width, and must not be spent as one
 *
 * A restore replays "the holder's own scalar" — `decorationSize`, else half the stored
 * `width`, else `radius`. That last fallback is right for a graphic whose number is a *reach*
 * from a centre, and wrong for a rectangle, whose number is a half-width and whose plate gives
 * it two anchor points. No rectangle files a `radius`, so the fallback only ever fires on a
 * bag from somewhere else: a hand-written file, or an older format.
 *
 * When it fired, the box came back twice the radius wide. Measured against MapLibre, which
 * ignores the field and seeds a rectangle from `rectangleDefaultHalfWidth` like the library
 * says: 80 km here against its own figure for the same file, on all twenty rectangles in the
 * properties-panel sweep.
 *
 * What this pins is narrow and deliberate: a `radius` in the bag must not decide a rectangle's
 * width. What the width *should* be with nothing stated is the holder's own seed, and that is
 * `rectangleDefaultHalfWidth`'s business rather than this file's.
 */

import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import {RECTANGLE_DEFAULT_HALF_WIDTH_PX, TacticalGraphicName, isRectangular, listTacticalGraphicNames} from '@zaes/tactical-graphics';
import type {FeatureCollection} from 'geojson';
import {restoreTacticalGraphics} from './persistence';
import {readGraphicGeometryState} from './graphicProperties';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';
import type {TacticalGraphicHandler} from './openlayersAdapter';

/** The resolution the restoring map is showing. */
const VIEW_RES = 1200;
/** A radius nothing should read, far enough from any seeded figure to be unmistakable. */
const STRAY_RADIUS = 40_000;
/** Where the fixture sits. Far enough from the equator that a projected metre is not a real one. */
const LATITUDE = 40;

/** The same stand-in `persistence.test.ts` uses, cut to what a restore touches. */
function fakeManager(): TacticalGraphicsManager {
    const watched: TacticalGraphicHandler[] = [];
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: () => undefined, getResolution: () => VIEW_RES})},
        watchResolution: (handler: TacticalGraphicHandler) => {
            if (!watched.includes(handler)) watched.push(handler);
        },
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => {
            watched.length = 0;
        },
    } as unknown as TacticalGraphicsManager;
}

/**
 * A rectangle saved the way one is saved today: **the two anchor points, as a line.**
 *
 * Not the drawn ring. A ring carries its own half-width, which `axisFromRectangleRing` reads
 * back before the scalar chain is ever reached — so a fixture built that way cannot see this
 * defect, and the first version of this file could not. The line is the current format and the
 * one a stray `radius` actually reaches. @see restoreGeometry
 */
function snapshotFor(name: TacticalGraphicName, bag: Record<string, unknown>): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [[-0.7, LATITUDE], [0, LATITUDE]]},
            properties: {tacticalGraphic: {name, ...bag}, role: 'base', graphicName: name, symbolId: `r-${name}`},
        }],
        // @ts-expect-error the version rides beside the collection, as `toSnapshot` writes it
        tacticalGraphicsVersion: 2,
    };
}

/** The width the restored holder ended up filing. */
function restoredWidth(name: TacticalGraphicName, bag: Record<string, unknown>): number | undefined {
    const manager = fakeManager();
    restoreTacticalGraphics(manager, snapshotFor(name, bag));
    const handler = manager.graphicControllers[0];
    if (!handler) return undefined;
    for (const feature of handler.getFeatures() as Feature[]) {
        const state = readGraphicGeometryState(feature);
        if (state.width !== undefined) return state.width;
    }
    return undefined;
}

const RECTANGLES = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(isRectangular);

describe('a rectangle restored from a bag carrying a stray radius', () => {
    it('has the whole family to check', () => {
        expect(RECTANGLES.length).toBeGreaterThan(15);
    });

    it.each(RECTANGLES.map(name => [String(name), name] as const))(
        '%s does not come back twice the radius wide',
        (_label, name) => {
            const width = restoredWidth(name, {radius: STRAY_RADIUS, rotation: 0});
            if (width === undefined) return;
            expect(width).not.toBeCloseTo(STRAY_RADIUS * 2, 0);
        },
    );

    /**
     * **And the width it falls back to is a ground distance.**
     *
     * A screen-pixel default costs `RECTANGLE_DEFAULT_HALF_WIDTH_PX` times *ground* metres per
     * pixel, and the two differ by `1 / cos(latitude)`. `getController`'s latitude argument
     * exists for exactly this and a restore was taking its equator default, so a zone with no
     * stated width came back 132 km across at 40 degrees north where MapLibre, which converts,
     * built the same file at 101. The error grows with latitude: half again at 50 degrees.
     */
    it.each(RECTANGLES.slice(0, 6).map(name => [String(name), name] as const))(
        '%s falls back to a width measured on the ground, not in projected metres',
        (_label, name) => {
            const width = restoredWidth(name, {rotation: 0});
            if (width === undefined) return;
            const ground = RECTANGLE_DEFAULT_HALF_WIDTH_PX * VIEW_RES * Math.cos((LATITUDE * Math.PI) / 180) * 2;
            expect(width).toBeCloseTo(ground, -2);
            // And emphatically not the projected figure, which is what it used to be.
            expect(width).not.toBeCloseTo(RECTANGLE_DEFAULT_HALF_WIDTH_PX * VIEW_RES * 2, -2);
        },
    );

    /**
     * **And a width the file does state is still honoured**, which is what keeps this from
     * being a rule that ignores the bag. The radius sits beside it and changes nothing.
     */
    it.each(RECTANGLES.slice(0, 6).map(name => [String(name), name] as const))(
        '%s still takes the width its file states',
        (_label, name) => {
            const stated = 123_000;
            const width = restoredWidth(name, {width: stated, radius: STRAY_RADIUS, rotation: 0});
            if (width === undefined) return;
            expect(width).toBeCloseTo(stated, 0);
        },
    );
});
