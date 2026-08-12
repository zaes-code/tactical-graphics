import {TacticalGraphicName, TacticalGraphicsRegistry, renderTacticalGraphic} from '../index';

/**
 * Every generator's declared `type` must match the base geometry it actually
 * consumes.
 *
 * That field has exactly one reader: `renderTacticalGraphic`'s guard, which
 * rejects a base of the wrong shape before the generator ever sees it. Ten
 * generators — the whole block family plus Exploitation, Fix and Penetration —
 * declared `'Point'` while taking a `Feature<LineString>`, so the **published**
 * entry point threw for every base a consumer could supply. Nothing caught it
 * because the OpenLayers holders call the registry directly and bypass the guard;
 * it surfaced only when the MapLibre adapter, which goes through the public API,
 * could not build them.
 *
 * The test is written against behavior rather than the field, so it stays honest
 * if the guard is ever reimplemented.
 */

const LINE = {type: 'LineString' as const, coordinates: [[-2, 0], [2, 0]]};
const POINT = {type: 'Point' as const, coordinates: [0, 0]};
const POLYGON = {type: 'Polygon' as const, coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]};

/** The line-driven graphics that used to be mislabelled as point-anchored. */
const LINE_DRIVEN: TacticalGraphicName[] = [
    TacticalGraphicName.Block,
    TacticalGraphicName.TacticalBlock,
    TacticalGraphicName.Breach,
    TacticalGraphicName.Bypass,
    TacticalGraphicName.Canalize,
    TacticalGraphicName.Clear,
    TacticalGraphicName.Disrupt,
    TacticalGraphicName.TacticalDisrupt,
    TacticalGraphicName.Exploitation,
    TacticalGraphicName.Fix,
    TacticalGraphicName.Penetration,
    TacticalGraphicName.AttackByFire,
    TacticalGraphicName.SupportByFire,
];

/**
 * A property bag generous enough for any generator to find what it needs.
 *
 * `radius` and `width` land on different generator options — `size` and the
 * half-width `radius` respectively — and a given graphic reads one or the other.
 * Supplying both means a failure here is the *base geometry* being wrong rather
 * than a missing dimension, which is what this file is about.
 */
const render = (name: TacticalGraphicName, geometry: unknown) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry: geometry as never,
        properties: {tacticalGraphic: {name, radius: 180_000, width: 360_000, rotation: 0}},
    } as never);

describe('the public entry point accepts the base each graphic is drawn from', () => {
    it.each(LINE_DRIVEN)('%s renders from a LineString', name => {
        expect(() => render(name, LINE)).not.toThrow();
        expect(render(name, LINE).graphic.geometry).toBeDefined();
    });

    it.each(LINE_DRIVEN)('%s rejects a Point, naming what it wanted', name => {
        expect(() => render(name, POINT)).toThrow(/expects a LineString base geometry/);
    });
});

describe('every registered generator declares a base geometry it can consume', () => {
    /**
     * A weaker but broader check than the list above: for each registered name, at
     * least one of the three base shapes must render. A generator whose declared
     * type is wrong fails all three, which is the failure mode this guards.
     */
    /**
     * The three security operations are excluded, and the reason is a **real gap in
     * the published API**, not a quirk of this test.
     *
     * `SecurityOperationOptions` requires `centerPadding`, `arrowLength`,
     * `arrowDepth`, `arrowHeadLength` and `arrowHeadDegree`. None of those exists as
     * a field on `TacticalGraphicProperties`, so `toGraphicOptions` has nothing to
     * map and the generator throws "distance is required" whatever base it is given.
     * They render in the demo only because the OpenLayers holder supplies the five
     * options directly, bypassing the public entry point.
     *
     * Closing it means adding the dimensions to the public schema. Listed here so
     * the exclusion is a recorded gap rather than a silent skip.
     */
    const UNREACHABLE_THROUGH_PUBLIC_API = new Set(['Cover', 'Screen', 'Guard']);

    it('renders from at least one of Point, LineString or Polygon', () => {
        const unrenderable: string[] = [];

        for (const name of TacticalGraphicsRegistry.list()) {
            if (UNREACHABLE_THROUGH_PUBLIC_API.has(name)) continue;
            const ok = [POINT, LINE, POLYGON].some(geometry => {
                try {
                    return !!render(name as TacticalGraphicName, geometry).graphic.geometry;
                } catch {
                    return false;
                }
            });
            if (!ok) unrenderable.push(name);
        }

        expect(unrenderable).toEqual([]);
    });
});
