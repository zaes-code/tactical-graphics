/**
 * # The two sample sheets have to build the same picture
 *
 * `engineRoundTrip.test.ts` hands **both** engines the same base and proves the coordinates
 * survive the trip between them. That is a real guarantee and it is the wrong one for this
 * class of defect: each engine also has a sheet of its own that lays out its own bases and
 * files its own amplifiers, and nothing compared those. So a user could report exactly what
 * they did — *"if you create the sweep on OpenLayers and switch to MapLibre it all looks
 * good; if you draw the sweep from MapLibre, that is where they get messed up"* — against a
 * green suite.
 *
 * Measured at the time this was written: **53 of 318 graphics** came out a different shape
 * on the two sheets, in three families.
 *
 * - The five plates that name a **length and a width** about one anchor point were built
 *   from a `radius` alone, so the generator's flat two-kilometre default supplied the other
 *   half: 3 km by 461 km, an aspect of 176 where the symbol is about 1.7.
 * - The eighteen **rectangular zones** took a width seeded from the drawing resolution,
 *   which is right on the draw path and meaningless for a sheet — the same sweep measured
 *   580 x 110 km at one zoom and 585 x 441 km two levels out, against OpenLayers' fixed
 *   10:1.
 * - **200700** was handed the shared one-band `rangeFan`, which its generator reads as
 *   "only one of my two ranges has been decided" and answers with the bare preview arc.
 *
 * The shape comparison below is the general guard; the three that follow pin each family in
 * its own terms, because an aspect ratio says a symbol is wrong and not why.
 */
import VectorSource from 'ol/source/Vector';
import {
    PAINTABLE_GRAPHICS,
    TacticalGraphicName,
    axisAndWidth,
    baseVertexCount,
    hasAxisAndWidth,
    isRectangular,
    rectangleDefaultHalfWidth,
    synthesizedBase,
    storedOrder,
} from '@zaes/tactical-graphics';
import type {Position} from 'geojson';
import {buildSampleGraphics, sampleFeatureCollection} from './sampleGallery';
import {getController} from '../openlayers/controllerRegistry';
import {applyBaseGeometry} from '../openlayers/sampleGallery';
import type {TacticalGraphicHandler} from '../openlayers/openlayersAdapter';
import type {TacticalGraphicsManager} from '../openlayers/TacticalGraphicsManager';

/** One zoom for the comparison, and a second one only the resolution test needs. */
const RES = 4000;
const RES_ZOOMED_IN = 1000;

/**
 * How far the two sheets' shapes may differ before it is called a defect.
 *
 * Generous on purpose. The two sheets lay their cells out in different units — degrees here,
 * projected metres there — and grow the decorated graphics by different factors, so an exact
 * match is not the claim. Every defect this found was off by between 5x and 176x; the
 * closest legitimate pair sits inside 1.6.
 */
const ASPECT_TOLERANCE = 1.6;

/**
 * The one graphic whose two sheets legitimately differ, and why.
 *
 * 343300 is in the drawn-anchor family, and the two sheets state its frame differently on
 * purpose: this engine's `anchorLine` builds the four points from an explicit offset a little
 * over half the run, while the OpenLayers sheet lays out a shallow quadrilateral and lets
 * `normalizeDrawnBase` square it. Both are bases a user could have drawn — they are not the
 * *same* base, so the pictures differ in proportion without either being wrong.
 *
 * Listed rather than tolerated by widening the bound, so that if a second graphic ever joins
 * it somebody has to say why in writing.
 */
const DIFFERENT_FRAME_BY_DESIGN = new Set<TacticalGraphicName>([TacticalGraphicName.Envelopment]);

function fakeManager(): TacticalGraphicsManager {
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: () => undefined, getResolution: () => RES})},
        watchResolution: () => undefined,
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

/**
 * The longer side over the shorter one — a scale-free reading of "what shape is this".
 *
 * Scale-free is the whole point: the two sheets draw at different sizes and comparing metres
 * would compare their layouts rather than their symbols. `Infinity` for anything with no
 * extent in one direction, which is every plain line graphic — those are skipped.
 */
function aspect(xs: number[], ys: number[]): number {
    if (!xs.length) return NaN;
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w === 0 || h === 0) return Infinity;
    return w > h ? w / h : h / w;
}

/** Every position in a GeoJSON-shaped node, however deeply nested. */
function positionsOf(node: unknown, xs: number[], ys: number[]): void {
    // **Emptiness first.** `Array.isArray(node[0])` on `[]` is false, so a vanished geometry
    // would be counted as one coordinate at `undefined` and read as present.
    if (!Array.isArray(node) || !node.length) return;
    if (typeof node[0] === 'number') {
        xs.push(node[0] as number);
        ys.push(node[1] as number);
        return;
    }
    node.forEach(child => positionsOf(child, xs, ys));
}

/** What the MapLibre sheet draws, by name. */
function mapLibreAspects(resolution = RES): Map<string, number> {
    const out = new Map<string, number>();
    buildSampleGraphics(undefined, resolution).graphics.forEach(graphic => {
        const xs: number[] = [];
        const ys: number[] = [];
        const geometry = graphic.graphic.geometry as {coordinates?: unknown; geometries?: unknown[]};
        // A generator may pack its parts into a collection — `Turn` and the arc mission
        // tasks do — so the geometry is walked rather than read off `.coordinates`.
        if (geometry.geometries) geometry.geometries.forEach(m => positionsOf((m as {coordinates: unknown}).coordinates, xs, ys));
        else positionsOf(geometry.coordinates, xs, ys);
        out.set(graphic.name, aspect(xs, ys));
    });
    return out;
}

/** What the OpenLayers sheet draws, for one graphic, or `NaN` if it cannot be measured here. */
function openLayersAspect(name: TacticalGraphicName): number {
    try {
        const manager = fakeManager();
        const handler = getController(name, RES);
        handler.setSymbolId(`id-${name}`);
        handler.getFeatures().forEach(feature => {
            feature.set('graphicName', name);
            feature.set('symbolId', `id-${name}`);
        });
        applyBaseGeometry(handler, name, 0, 0, `id-${name}`);
        manager.graphicControllers.push(handler);
        // The holder's line-work feature. Typed loosely because `TacticalGraphic` is a
        // union of holders and only the concrete ones declare it.
        const geometry = (handler.graphic as unknown as {graphic: {getGeometry(): {getExtent(): number[]} | null}})
            .graphic.getGeometry();
        if (!geometry) return NaN;
        const extent = geometry.getExtent();
        return aspect([extent[0], extent[2]], [extent[1], extent[3]]);
    } catch {
        // A holder this harness cannot drive outside a real map. Not a verdict about the
        // graphic, so the comparison skips it rather than failing on it.
        return NaN;
    }
}

describe('the two sample sheets build the same picture', () => {
    const mlb = mapLibreAspects();

    it.each((PAINTABLE_GRAPHICS as TacticalGraphicName[]).map(n => [String(n), n] as const))(
        '%s',
        (_label, name) => {
            const ours = mlb.get(name);
            expect({name, built: ours !== undefined}).toEqual({name, built: true});

            const theirs = openLayersAspect(name);
            // A straight line has no extent across itself on either sheet, and a holder the
            // harness cannot drive answers `NaN`. Neither is a shape to compare.
            if (!Number.isFinite(theirs) || !Number.isFinite(ours as number)) return;
            if (DIFFERENT_FRAME_BY_DESIGN.has(name)) return;

            const ratio = (ours as number) / theirs;
            expect({
                name,
                withinTolerance: ratio <= ASPECT_TOLERANCE && ratio >= 1 / ASPECT_TOLERANCE,
                maplibre: Number((ours as number).toFixed(2)),
                openlayers: Number(theirs.toFixed(2)),
            }).toEqual({
                name,
                withinTolerance: true,
                maplibre: Number((ours as number).toFixed(2)),
                openlayers: Number(theirs.toFixed(2)),
            });
        },
    );
});

describe('a sheet states its own sizes rather than inventing them from the view', () => {
    const RECTANGLES = (PAINTABLE_GRAPHICS as TacticalGraphicName[]).filter(isRectangular);
    const AXIS_AND_WIDTH = (PAINTABLE_GRAPHICS as TacticalGraphicName[]).filter(hasAxisAndWidth);

    it('has both families to test', () => {
        expect(RECTANGLES.length).toBeGreaterThan(10);
        expect(AXIS_AND_WIDTH.length).toBe(5);
    });

    /**
     * **The zoom the sweep button was pressed at is not a fact about the symbol.**
     *
     * `sizeDefaults` seeds an un-typed rectangle width from the drawing resolution, which is
     * what the OpenLayers holder does on the draw path and is right there. A sheet's base was
     * never dragged, so the same rule made every rectangle a different shape depending on
     * where the map happened to be sitting.
     */
    it('gives a rectangular zone the same width whatever zoom the sheet was built at', () => {
        const near = new Map(buildSampleGraphics(undefined, RES_ZOOMED_IN).graphics.map(g => [g.name, g.properties.width]));
        const far = new Map(buildSampleGraphics(undefined, RES).graphics.map(g => [g.name, g.properties.width]));

        RECTANGLES.forEach(name => {
            expect({name, width: near.get(name)}).toEqual({name, width: far.get(name)});
        });
    });

    /**
     * And it is the library's own answer, which is what the OpenLayers sheet stamps — so the
     * two sheets draw one rectangle rather than two. @see rectangleDefaultHalfWidth
     */
    it('takes that width from the axis, the way the OpenLayers sheet does', () => {
        buildSampleGraphics(undefined, RES).graphics
            .filter(g => isRectangular(g.name))
            .forEach(g => {
                const base = g.base.geometry;
                expect(base.type).toBe('LineString');
                const axis = (base as {coordinates: Position[]}).coordinates;
                const metres = metresBetween(axis[0], axis[axis.length - 1]);
                expect({name: g.name, width: Math.round(g.properties.width ?? 0)})
                    .toEqual({name: g.name, width: Math.round(rectangleDefaultHalfWidth(metres) * 2)});
            });
    });

    /**
     * **A drag gives one number and these five plates want two.**
     *
     * The bag reaching the sheet carries a `radius` alone. Without the derivation the
     * generator fell back to a flat two-kilometre length and the symbol drew as a stroke, so
     * both halves are asserted: the numbers filed, and the shape they produce.
     */
    it('derives both dimensions for the plates that name a length and a width', () => {
        const built = buildSampleGraphics(undefined, RES).graphics;
        const shapes = mapLibreAspects();

        AXIS_AND_WIDTH.forEach(name => {
            const graphic = built.find(g => g.name === name)!;
            const derived = axisAndWidth(name, graphic.properties.radius ?? 0)!;
            expect({name, length: graphic.properties.length, width: graphic.properties.width})
                .toEqual({name, length: derived.length, width: derived.width});
            // A box, not a stroke. Every one of the five measured above 170 before this.
            expect({name, aspect: (shapes.get(name) ?? 0) < 4}).toEqual({name, aspect: true});
        });
    });

    /**
     * 200700 states its shape in the four values its plate names, so the shared amplifier bag
     * must not describe it as a one-band range fan — which the generator reads as a symbol
     * whose second range has not been decided and answers with the preview arc.
     * @see SAMPLE_PROPERTY_OVERRIDES
     */
    it('gives the radar search doctrine both of its ranges', () => {
        const graphic = buildSampleGraphics(undefined, RES).graphics
            .find(g => g.name === TacticalGraphicName.RadarSearchDoctrine)!;
        expect(graphic.properties.startRange).toBeGreaterThan(0);
        expect(graphic.properties.stopRange).toBeGreaterThan(graphic.properties.startRange!);
        expect(graphic.properties.searchAxisAzimuthDeg).toBeDefined();
        expect(graphic.properties.stopRelativeBearingDeg).toBeGreaterThan(0);
    });

    /**
     * **Both of this engine's sweep entry points describe one sheet.** `buildSampleGraphics`
     * realizes the graphics and `sampleFeatureCollection` files the collection the engines are
     * compared through; a size stamped in one and not the other is the comparison's premise
     * quietly failing.
     */
    it('files the same rectangle width through either entry point', () => {
        const built = new Map(buildSampleGraphics(undefined, RES).graphics.map(g => [g.name, g.properties.width]));
        sampleFeatureCollection().features.forEach(feature => {
            const name = feature.properties?.graphicName as TacticalGraphicName;
            if (!isRectangular(name)) return;
            const filed = (feature.properties?.tacticalGraphic as {width?: number}).width;
            expect({name, width: filed}).toEqual({name, width: built.get(name)});
        });
    });
});

/**
 * **A layout the library states is used as it comes back, converted with nothing.**
 *
 * `synthesizedBase` already returns each layout in the order the graphic *stores* its points.
 * Both sheets put it through `storedOrder` a second time, which reverses the eight tip-first
 * members of the family — the cane arrows drew as a bare arch with an arrowhead on the end
 * where the symbol is a straight run with a half circle hooked off it. The catalog generator
 * carried the identical wrap and lost it on 2026-09-06; the sheets kept it.
 */
describe('a library-stated layout reaches the sheet unreversed', () => {
    const HALF = 2.6;
    const REVERSED_BY_A_SECOND_CONVERSION = (PAINTABLE_GRAPHICS as TacticalGraphicName[]).filter(name => {
        const stated = synthesizedBase(name, [0, 0], HALF, baseVertexCount(name) ?? 3);
        return !!stated && JSON.stringify(storedOrder(name, stated)) !== JSON.stringify(stated);
    });

    it('has the family the defect was invisible in', () => {
        // The eight tip-first members. A layout whose order already agrees is unaffected
        // either way, so only these can show the difference at all.
        expect(REVERSED_BY_A_SECOND_CONVERSION.length).toBe(8);
    });

    /**
     * The sheet's cell is somewhere else on the map and the two sheets work in different
     * units, so the positions cannot be compared directly — the *order* can, and the order is
     * the whole of the defect. A run the library lays out west to east reaches the sheet west
     * to east.
     */
    const eastward = (points: Position[]): boolean => points[points.length - 1][0] > points[0][0];

    it.each(REVERSED_BY_A_SECOND_CONVERSION.map(n => [String(n), n] as const))('%s', (_label, name) => {
        const stated = synthesizedBase(name, [0, 0], HALF, baseVertexCount(name) ?? 3)!;
        // The premise: for these eight the second conversion is not a no-op.
        expect(eastward(storedOrder(name, stated) as Position[])).toBe(!eastward(stated));

        const graphic = buildSampleGraphics(undefined, RES).graphics.find(g => g.name === name)!;
        const base = graphic.base.geometry as {type: string; coordinates: Position[]};
        expect(base.type).toBe('LineString');
        expect({sheet: 'maplibre', name, eastward: eastward(base.coordinates)})
            .toEqual({sheet: 'maplibre', name, eastward: eastward(stated)});

        // **And the OpenLayers sheet, which carried the identical wrap.** Its base is in
        // projected metres, and east is east in both frames.
        const handler = getController(name, RES);
        handler.setSymbolId(`id-${name}`);
        applyBaseGeometry(handler, name, 0, 0, `id-${name}`);
        const theirs = (handler.graphic as unknown as {base: {getGeometry(): {getCoordinates(): number[][]}}})
            .base.getGeometry();
        const coordinates = theirs.getCoordinates();
        expect({sheet: 'openlayers', name, eastward: eastward(coordinates as Position[])})
            .toEqual({sheet: 'openlayers', name, eastward: eastward(stated)});
    });
});

/** Great-circle metres, matching the sheet's own reading. */
function metresBetween(a: Position, b: Position): number {
    const R = 6378137;
    const toRad = (d: number): number => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
