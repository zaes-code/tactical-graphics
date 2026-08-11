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
import {GeometryCollection, LineString, MultiLineString, Point, Polygon} from 'ol/geom';
import {
    PAINTABLE_GRAPHICS,
    TACTICAL_GRAPHIC_KEY,
    TacticalGraphicName,
    getPaintFunction,
    isPaintable,
    resetTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';
import {asStyleFunction, fromOlGeometry, paintContext, toPaintFeature} from './paintToOpenLayers';

const RESOLUTION = 1000;

/** A 400 km line — long enough to carry decorations at `RESOLUTION`. */
const line = () => new LineString([[0, 0], [400_000, 0]]);

/** A 400 km square ring, for the area graphics. Closed, as a polygon ring must be. */
const ring = () => new Polygon([[[0, 0], [400_000, 0], [400_000, 400_000], [0, 400_000], [0, 0]]]);

function feature(name: TacticalGraphicName, geometry: LineString | Polygon = line()): Feature {
    const f = new Feature(geometry);
    f.set(TACTICAL_GRAPHIC_KEY, {name, label: 'X'});
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
        // realise a pattern rather than a colour, so it is worth asserting it is
        // actually asked for — a dropped `pattern` would render as a flat wash and
        // look merely wrong rather than broken.
        const hatched = getPaintFunction(TacticalGraphicName.LimitedAccessArea)!
            .graphic(toPaintFeature(feature(TacticalGraphicName.LimitedAccessArea, ring()))!, paintContext(RESOLUTION));
        expect(hatched.some(m => m.fill?.pattern?.kind === 'diagonal')).toBe(true);
        // …and the flat colour is still set, because that is the documented fallback
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
        const {Circle} = jest.requireActual('ol/geom');
        expect(fromOlGeometry(new Circle([0, 0], 100))).toBeUndefined();
    });
});

describe('asStyleFunction', () => {
    it('returns an empty list rather than throwing on an unreadable geometry', () => {
        const {Circle} = jest.requireActual('ol/geom');
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
