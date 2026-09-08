/**
 * # Parity guards for the style-function port
 *
 * The port moves each style function into `tacticalgraphics/symbology/` and leaves
 * a one-line adapter behind in `openlayerStyles.ts`. That is what stops the two
 * renderers drifting — but it introduces two new ways to be wrong, and these are
 * the tests for them.
 *
 * **1. The paint registry and the OpenLayers routing can disagree.** MapLibre asks
 * `getPaintFunction(name)`; OpenLayers still decides from a `switch` inside
 * `LineGraphicBase`. Until the holders consult the registry, a graphic can be
 * ported for one renderer and not the other, and nothing would say so.
 *
 * **2. A ported function can quietly return nothing.** `toPaintFeature` returns
 * `undefined` for a geometry it does not understand, and `asStyleFunction` then
 * renders an empty list. That is precisely how routing the arc mission tasks
 * through the bridge broke `AreaDefense` and `CordonAndSearch` — a
 * `GeometryCollection` fell through to `undefined` and both drew nothing at all.
 * It threw no error and only two tests noticed.
 */

import Feature from 'ol/Feature';
import {Circle, GeometryCollection, LineString, MultiLineString, Point, Polygon} from 'ol/geom';
import {
    PAINTABLE_GRAPHICS,
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicName,
    getPaintFunction,
    isPaintable,
    resetTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';
import GeoJSON from 'ol/format/GeoJSON';
import {baseGeometryFor, listTacticalGraphicNames, renderTacticalGraphic} from '@zaes/tactical-graphics';
import {asStyleFunction, fromOlGeometry, paintContext, toPaintFeature} from './paintToOpenLayers';
import {stylesFor} from './stylesFor';

const RESOLUTION = 1000;

/** A 400 km line — long enough to carry decorations at `RESOLUTION`. */
const line = () => new LineString([[0, 0], [400_000, 0]]);

/** A 400 km square ring, for the area graphics. Closed, as a polygon ring must be. */
const ring = () => new Polygon([[[0, 0], [400_000, 0], [400_000, 400_000], [0, 400_000], [0, 0]]]);

function feature(name: TacticalGraphicName, geometry: LineString | Polygon = line()): Feature {
    const f = new Feature(geometry);
    f.set(TACTICAL_GRAPHIC_KEY, {name, designation: 'X'});
    f.set('graphicName', name);
    return f;
}

beforeEach(() => resetTacticalGraphicsConfig());

describe('the paint registry matches what OpenLayers routes', () => {
    it('lists every graphic it claims to paint', () => {
        expect(PAINTABLE_GRAPHICS.length).toBeGreaterThan(0);
        for (const name of PAINTABLE_GRAPHICS) {
            expect(isPaintable(name)).toBe(true);
            expect(getPaintFunction(name)).toBeDefined();
        }
    });

    it('names only live enum members', () => {
        // A commented-out graphic reaching the registry would be a silent revival of
        // something switched off on purpose. `MovingConvoy` and `HaltedConvoy` are the
        // live example — see ai/excluded-graphics.md.
        const live = new Set(Object.values(TacticalGraphicName) as string[]);
        for (const name of PAINTABLE_GRAPHICS) expect(live.has(name)).toBe(true);
    });

    /**
     * A paint function must never throw on a base of the wrong shape.
     *
     * **It is allowed to return nothing**, and many do: this test hands each graphic
     * a hand-made LineString and Polygon, but a good number of paint functions
     * consume the *generator's output* rather than the drawn base — a direction
     * arrow reads a MultiLineString of route-plus-arrowhead, the arc mission tasks
     * read a GeometryCollection. Feeding those a bare LineString correctly produces
     * an empty list.
     *
     * "Every registered graphic actually paints marks" is asserted in
     * `maplibre/maplibreAdapter.test.ts`, which runs each name through
     * `buildTacticalGraphic` and so through the real generator. That is the right
     * place for it; an earlier version of this test tried to assert it from
     * hand-made geometry and was wrong by construction.
     */
    it('never throws, whatever base geometry a paint function is handed', () => {
        for (const name of PAINTABLE_GRAPHICS) {
            const painters = getPaintFunction(name)!;
            for (const geometry of [line(), ring()]) {
                const paintFeature = toPaintFeature(feature(name, geometry));
                if (!paintFeature) continue;
                expect(() => painters.graphic(paintFeature, paintContext(RESOLUTION))).not.toThrow();
                if (painters.label) {
                    expect(() => painters.label!(paintFeature, paintContext(RESOLUTION))).not.toThrow();
                }
            }
        }
    });

    it('hatches the limited-access family and nothing else in it', () => {
        // The hatch is the one piece of area symbology that needs a renderer to
        // realize a pattern rather than a color, so it is worth asserting it is
        // actually asked for — a dropped `pattern` would render as a flat wash and
        // look merely wrong rather than broken.
        const hatched = getPaintFunction(TacticalGraphicName.LimitedAccessArea)!
            .graphic(toPaintFeature(feature(TacticalGraphicName.LimitedAccessArea, ring()))!, paintContext(RESOLUTION));
        expect(hatched.some(m => m.fill?.pattern?.kind === 'diagonal')).toBe(true);
        // …and the flat color is still set, because that is the documented fallback
        // for a renderer that cannot build the pattern.
        expect(hatched.find(m => m.fill)?.fill?.color).toBeTruthy();
    });
});


describe('toPaintFeature understands every geometry the generators emit', () => {
    it.each([
        ['Point', new Point([0, 0])],
        ['LineString', line()],
        ['MultiLineString', new MultiLineString([[[0, 0], [1, 1]]])],
        ['Polygon', new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]])],
    ])('reads a %s', (_label, geometry) => {
        expect(fromOlGeometry(geometry)).toBeDefined();
    });

    it('reads a GeometryCollection, which the arc mission tasks emit', () => {
        // The regression this file exists for: returning `undefined` here made
        // AreaDefense and CordonAndSearch render nothing at all.
        const collection = new GeometryCollection([
            new MultiLineString([[[0, 0], [1, 1]]]),
            new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]),
        ]);
        const read = fromOlGeometry(collection);
        expect(read).toBeDefined();
        expect(read!.type).toBe('GeometryCollection');
        expect((read as {geometries: unknown[]}).geometries).toHaveLength(2);
    });

    it('refuses a Circle rather than guessing a segment count', () => {
        // Not an oversight: Circle is a live editing geometry the holders resolve to
        // a Polygon before styling, so a paint function should draw nothing for it.
        expect(fromOlGeometry(new Circle([0, 0], 100))).toBeUndefined();
    });
});

describe('asStyleFunction', () => {
    it('returns an empty list rather than throwing on an unreadable geometry', () => {
        const styled = asStyleFunction(() => [{
            geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]},
            stroke: {color: '#000', widthPx: 2},
        }]);
        expect(styled(new Feature(new Circle([0, 0], 100)), RESOLUTION)).toEqual([]);
    });

    it('sets an explicit geometry on every style it produces', () => {
        // A mark whose geometry fell back to the feature's would silently draw the
        // undecorated shape — no teeth, no cut arc, no label anchor.
        const styles = asStyleFunction(() => [{
            geometry: {type: 'Point', coordinates: [5, 5]},
            text: {text: 'A', font: 'bold 16px sans-serif', fill: '#000'},
        }])(feature(TacticalGraphicName.PhaseLine), RESOLUTION);

        expect(styles).toHaveLength(1);
        expect(styles[0].getGeometry()).toBeDefined();
        expect((styles[0].getGeometry() as Point).getCoordinates()).toEqual([5, 5]);
    });

    it('carries a host-resolved hostilityColor onto the line work', () => {
        const f = feature(TacticalGraphicName.PhaseLine);
        f.set('hostilityColor', 'rgb(1, 2, 3)');
        expect(toPaintFeature(f)!.hostilityColor).toBe('rgb(1, 2, 3)');
    });
});

/**
 * # The country code has to survive both routes to the same paint
 *
 * `defaultLinePaint` is reached two ways: MapLibre reads it out of the registry, and
 * OpenLayers calls it from `getDefaultLineStyle` with **no options object at all**. So an
 * option table kept anywhere but inside the paint reaches one engine and not the other --
 * which is what happened on 2026-09-01, when the fire-support lines gained a country code
 * that MapLibre drew and OpenLayers silently dropped. Nothing failed: the field was
 * offered, saved and restored, and one renderer just never painted it.
 *
 * These assert the text itself rather than that a paint exists, because "a paint exists"
 * was true throughout the defect.
 */
describe('the fire-support lines set their country code on both engines', () => {
    const WITH_CODE = [
        TacticalGraphicName.FireSupportCoordinationLine,
        TacticalGraphicName.BattlefieldCoordinationLine,
        TacticalGraphicName.BattlefieldHandoverLine,
        TacticalGraphicName.DelayLine,
    ];

    /** Every string a paint sets, given a designation and a country code. */
    const painted = (name: TacticalGraphicName) => {
        const f = new Feature(line());
        f.set(TACTICAL_GRAPHIC_KEY, {name, designation: 'ALPHA', countryCode: 'GBR'});
        f.set('graphicName', name);
        return (getPaintFunction(name)?.graphic?.(toPaintFeature(f)!, paintContext(RESOLUTION)) ?? [])
            .map(p => p.text?.text)
            .filter((t): t is string => Boolean(t));
    };

    it.each(WITH_CODE)('%s brackets the code after the designation', name => {
        const texts = painted(name);
        expect(texts.some(t => t.includes('ALPHA (GBR)'))).toBe(true);
    });

    it('does not hand a country code to a line whose plate has no box for one', () => {
        // The line of departure is the control: same paint, same fields on the feature, and
        // no `AS` on its plate, so the bag carrying a code must change nothing.
        const texts = painted(TacticalGraphicName.LineOfDeparture);
        expect(texts.some(t => t.includes('GBR'))).toBe(false);
    });
});

/**
 * # The two halves of registering a paint have to be done together
 *
 * A bespoke paint is wired in **two** places: `symbology/registry.ts`, which MapLibre and
 * the catalog generator read, and the OpenLayers dispatch — `getStyleFromLabels` for an
 * area outline, `getAreaLabelStylesFromLabels` for its label, a holder's `setStyle` switch
 * for anything point-anchored. Wire the first alone and the symbol is correct on MapLibre,
 * correct in the picker thumbnail, and silently wrong in the app.
 *
 * **That has now happened four times**, most recently to `defeat`: its four arrows are
 * filled rings, the registry filled them, the thumbnail showed them filled, and OpenLayers
 * fell through to the default and stroked their outlines instead. No test noticed, because
 * every test asked whether a graphic drew *something*.
 *
 * So this asks the sharper question, of every graphic at once: **do the two engines agree
 * about whether this symbol is filled?** Fill against stroke is the axis a fall-through
 * lands on, it is cheap to compute on both sides, and it holds with no exemptions today —
 * which is what makes it worth pinning. @see ai/app-6.md, "Registering a bespoke area paint
 * takes TWO edits"
 */
describe('the two engines agree about which graphics are filled', () => {
    /** A base of the kind each graphic is drawn from, big enough that nothing collapses. */
    const LINE_BASE: [number, number][] = [[0, 0], [0.4, 0], [0.8, 0]];
    const POLY_BASE: [number, number][][] = [[[0, 0], [0.6, 0], [0.6, 0.4], [0, 0.4], [0, 0]]];

    /** The graphic feature a consumer would build, as OpenLayers sees it. */
    const graphicFeature = (name: TacticalGraphicName): Feature | undefined => {
        const kind = baseGeometryFor(name);
        const geometry =
            kind === 'Point' ? {type: 'Point' as const, coordinates: [10, 40]}
            : kind === 'Polygon' ? {type: 'Polygon' as const, coordinates: POLY_BASE}
            : {type: 'LineString' as const, coordinates: LINE_BASE};
        let rendered;
        try {
            rendered = renderTacticalGraphic({
                type: 'Feature',
                geometry: geometry as never,
                properties: {tacticalGraphic: {name, rotation: 0, radius: 20_000, decorationSize: 20_000, width: 20_000}},
            });
        } catch {
            return undefined;
        }
        const feature = new GeoJSON({featureProjection: 'EPSG:3857'}).readFeature(rendered.graphic as never) as Feature;
        feature.set(TACTICAL_GRAPHIC_KEY, {name});
        feature.set('graphicName', name);
        return feature;
    };

    it('every one of them, with no exemptions', () => {
        const disagreements: string[] = [];
        for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
            const feature = graphicFeature(name);
            const paint = getPaintFunction(name)?.graphic;
            const painted = feature && toPaintFeature(feature);
            if (!feature || !paint || !painted) continue;

            const registryFills = paint(painted, paintContext(40)).some(mark => !!mark.fill);
            const openLayersFills = [stylesFor(name).graphic(feature, 40)]
                .flat()
                .filter(Boolean)
                .some(style => !!(style as import('ol/style/Style').default).getFill?.()?.getColor?.());

            if (registryFills !== openLayersFills) {
                disagreements.push(`${name}: registry fills ${registryFills}, OpenLayers fills ${openLayersFills}`);
            }
        }
        // Listed rather than counted, so a failure names the graphic and which side is wrong.
        expect(disagreements).toEqual([]);
    });

    /**
     * **The trap this whole file was written for, and the one it did not actually cover.**
     *
     * Registering a bespoke paint takes *two* edits: the entry in `symbology/registry.ts`,
     * which serves MapLibre, the thumbnails and the zaes.com catalog, and an arm in the
     * relevant OpenLayers holder's `setStyle` switch. Miss the second and the graphic falls
     * through to the generic line style: **every generated picture is correct and only the
     * app is wrong**, so a thumbnail sweep, a catalog render and a plate comparison all
     * agree while the running renderer draws a bare line.
     *
     * That has now happened five times — most recently to the nine bearing lines, whose
     * style functions were imported into `LineGraphicBase` and never called, and before that
     * to Defeat's filled arrows. The tests above guard the registry against *itself*; none
     * of them ever asked OpenLayers what it drew, and the fill sweep above catches only the
     * subset whose defect shows up as a missing fill.
     *
     * Text is the discriminator that generalises. A bespoke paint that draws a letter, a
     * bearing or a designation is the common case, the generic fallback draws none of it,
     * and "the registry drew text and OpenLayers drew none" is unambiguous. The check runs
     * **one way on purpose**: OpenLayers legitimately puts some amplifiers on a separate
     * label feature this comparison never asks for, so it may draw *more*, never less.
     */
    it('never lets OpenLayers drop text the registry paints', () => {
        const textOf = (mark: {text?: {text?: string}}) => mark.text?.text;
        const silent: string[] = [];

        for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
            const feature = graphicFeature(name);
            const paint = getPaintFunction(name)?.graphic;
            const painted = feature && toPaintFeature(feature);
            if (!feature || !paint || !painted) continue;

            const registryTexts = paint(painted, paintContext(40)).map(textOf).filter((t): t is string => !!t);
            if (!registryTexts.length) continue;

            const openLayersTexts = [stylesFor(name).graphic(feature, 40)]
                .flat()
                .filter(Boolean)
                .map(style => (style as import('ol/style/Style').default).getText?.()?.getText?.())
                .filter(Boolean);

            if (!openLayersTexts.length) {
                silent.push(`${name}: registry paints ${JSON.stringify(registryTexts)}, OpenLayers paints none`);
            }
        }
        expect(silent).toEqual([]);
    });

    /**
     * **A missed dispatch does not always show up as missing text, and the worse case is
     * when it does not.**
     *
     * The nine bearing lines proved it. With no arm in `LineGraphicBase`, the generic line
     * style still drew each one's letter — at *both* ends, the way a phase line carries its
     * designation — so the text check above passed them all. What the generic style did not
     * carry was the dash, and 220104 acoustic (ambiguous) is separated from 220103 acoustic
     * **by the dash alone**: both are lettered `A`. The two symbols rendered as the same
     * picture in the running app while every generated thumbnail showed them correctly.
     *
     * That is the mined anti-tank ditch defect exactly — two graphics, one picture, no test
     * objecting — so the pattern gets its own assertion rather than relying on the text one
     * happening to notice. Same one-way rule: OpenLayers may dash something the registry
     * leaves solid (status dashes ride a separate path), never the reverse.
     */
    it('never lets OpenLayers drop a dash the registry paints', () => {
        const undashed: string[] = [];

        for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
            const feature = graphicFeature(name);
            const paint = getPaintFunction(name)?.graphic;
            const painted = feature && toPaintFeature(feature);
            if (!feature || !paint || !painted) continue;

            const registryDashes = paint(painted, paintContext(40)).some(mark => !!mark.stroke?.dashPx?.length);
            if (!registryDashes) continue;

            const openLayersDashes = [stylesFor(name).graphic(feature, 40)]
                .flat()
                .filter(Boolean)
                .some(style => !!(style as import('ol/style/Style').default).getStroke?.()?.getLineDash?.()?.length);

            if (!openLayersDashes) undashed.push(`${name}: registry dashes, OpenLayers draws solid`);
        }
        expect(undashed).toEqual([]);
    });
});
