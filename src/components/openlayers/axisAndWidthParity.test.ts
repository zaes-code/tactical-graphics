/**
 * # A drag gives one number; five graphics need two
 *
 * APP-06 240802 and the four maritime areas built like it take **one anchor point** and
 * state a length, a width and an attitude as amplifiers. So the drag that sizes them
 * yields a radius, and the other dimension has to be derived from it.
 *
 * **That derivation lived in an OpenLayers holder, as a private `0.66`.** MapLibre's draw
 * stamps a radius and nothing else, so on that engine the length fell through to the
 * generator's flat 2 km default while the width came out as whatever the drag measured — a
 * box 2 km long and hundreds of kilometres wide, which renders as a vertical stroke. That
 * is what 240802 has looked like on MapLibre since it became point-anchored in 3.2.0; the
 * three maritime ellipses and the cued acquisition doctrine inherited it on the day they
 * were added, and it was found by drawing all twelve on both engines and comparing the
 * screenshots.
 *
 * Nothing caught it, because nothing stated the rule anywhere both engines could read.
 * `axisAndWidth` does now, and this is the guard.
 */
import type {Feature as GeoJSONFeature} from 'geojson';
import {
    TacticalGraphicName,
    axisAndWidth,
    hasAxisAndWidth,
    listTacticalGraphicNames,
} from '@zaes/tactical-graphics';
/*
 * **The MapLibre adapter, from a suite that lives beside the OpenLayers one.** The defect
 * was a disagreement between the two engines, so the test has to hold both — this is the
 * shape the other parity suites here already have. @see editStretchParity.test.ts
 */
import {buildTacticalGraphic} from '../maplibre/maplibreAdapter';
/*
 * **Through the registry, not straight at the holder.** Importing
 * `graphics/MissionTaskGraphicBase` first enters a module cycle -- it pulls in
 * `LineGraphicController`, which pulls in `controllerRegistry`, which extends the class
 * that is still being defined -- and the suite dies with "Class extends value undefined".
 * Every other suite here reaches a holder the same way, through `getController`.
 */
import {getController} from './controllerRegistry';

/** The five, named — a subset check would not notice one dropping out. */
const AXIS_AND_WIDTH: readonly TacticalGraphicName[] = [
    TacticalGraphicName.TargetAreaRectangular,
    TacticalGraphicName.LaunchAreaEllipse,
    TacticalGraphicName.DefendedAreaEllipse,
    TacticalGraphicName.ShipAreaOfInterestEllipse,
    TacticalGraphicName.CuedAcquisitionDoctrine,
];

const RESOLUTION = 2445.98;
const CENTRE: GeoJSONFeature['geometry'] = {type: 'Point', coordinates: [0, 0]};
const DRAWN_RADIUS_M = 400_000;

/**
 * The shape MapLibre builds from a given stamp, as its longer dimension over its shorter.
 *
 * Through the MapLibre adapter, because that is where the defect was: `sizeDefaults` turns
 * a stamped `radius` into a full `width` for every point-anchored graphic, so a drag radius
 * of 400 km arrived as an 800 km *width* while the length stayed at the generator's 2 km
 * default. A ratio in degrees is enough to tell a box from a stroke.
 */
function aspect(name: TacticalGraphicName, stamped: Record<string, unknown>): number {
    const built = buildTacticalGraphic(name, CENTRE, stamped, RESOLUTION)?.graphic;
    const ring = (built?.geometry as {coordinates?: number[][][]})?.coordinates?.[0] ?? [];
    if (ring.length < 4) return NaN;
    const xs = ring.map(p => p[0]);
    const ys = ring.map(p => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    return Math.max(w, h) / Math.max(1e-12, Math.min(w, h));
}

describe('the family is named, not inferred', () => {
    it('is exactly the five graphics whose plate states a length and a width', () => {
        const flagged = (listTacticalGraphicNames() as TacticalGraphicName[])
            .filter(name => name in TacticalGraphicName)
            .filter(hasAxisAndWidth);
        expect([...flagged].sort()).toEqual([...AXIS_AND_WIDTH].sort());
    });

    it('gives every one of them a length twice the drag and a width under it', () => {
        for (const name of AXIS_AND_WIDTH) {
            const derived = axisAndWidth(name, DRAWN_RADIUS_M)!;
            expect(derived.length).toBe(DRAWN_RADIUS_M * 2);
            // Both are **full** figures in the public schema's terms, and the width is a
            // share of the length: a ratio over 1 would make the "length" the shorter side.
            expect(derived.width).toBeGreaterThan(0);
            expect(derived.width).toBeLessThan(derived.length);
        }
    });

    it('answers for nothing else', () => {
        expect(hasAxisAndWidth(TacticalGraphicName.TargetAreaCircular)).toBe(false);
        // The *two*-anchor-point rectangles take their length from the two points, so they
        // have nothing to derive. @see isRectangular
        expect(hasAxisAndWidth(TacticalGraphicName.DefendedAreaRectangle)).toBe(false);
        expect(axisAndWidth(TacticalGraphicName.TargetAreaCircular, DRAWN_RADIUS_M)).toBeUndefined();
    });
});

describe('the shape a drawn radius produces', () => {
    it.each(AXIS_AND_WIDTH)('%s is a stroke when only a radius is stamped', name => {
        /*
         * **The defect, stated as the property it broke.** This is what MapLibre did: a
         * radius and no length, so the generator's own 2 km default became the length while
         * the width was the drag. It is here as a *failing* shape rather than as a comment
         * so that anyone who removes the fix sees what comes back.
         */
        expect(aspect(name, {radius: DRAWN_RADIUS_M, rotation: 0})).toBeGreaterThan(20);
    });

    it.each(AXIS_AND_WIDTH)('%s is a box once both dimensions are derived', name => {
        // Both plates' own proportions sit between 1.5:1 and 2:1; anything under 4 is a
        // shape rather than a line, which is the distinction that matters here.
        expect(aspect(name, {...axisAndWidth(name, DRAWN_RADIUS_M)!, rotation: 0})).toBeLessThan(4);
    });
});

describe('the OpenLayers holder reads the same statement', () => {
    it.each(AXIS_AND_WIDTH)('%s derives its options from axisAndWidth', name => {
        /*
         * The holder is what MapLibre could not see. Asserting it against the library's
         * answer is what stops the 0.66 reappearing as a private constant — the shape the
         * defect had for two releases.
         */
        const controller = getController(name, RESOLUTION) as unknown as {
            graphic: {size: number; generatorOptions(): {length: number; radius: number}};
        };
        controller.graphic.size = DRAWN_RADIUS_M;
        // The holder speaks the *generator's* vocabulary — a half-width called `radius` —
        // so the comparison halves the library's full width. The factor of two is the one
        // `toGraphicOptions` applies everywhere else, and stating it here is what stops a
        // private ratio reappearing in this file.
        const derived = axisAndWidth(name, DRAWN_RADIUS_M)!;
        expect(controller.graphic.generatorOptions()).toEqual({length: derived.length, radius: derived.width / 2});
    });
});
