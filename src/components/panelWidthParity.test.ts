/**
 * # The panel shows the same width on both engines, or it shows an empty box
 *
 * The eleven axis arrows state their width as the last coordinate of the base, so the saved
 * bag holds none and `measured.width` has to be **derived** on the way to the dialog. The
 * OpenLayers source does that. The MapLibre source read the bag and found nothing, and the
 * dialog's own gate — *"a width the geometry cannot supply is typed instead"* — then drew the
 * typed input: an empty `Width (m)` box on a number the operator sets by dragging, with no way
 * to fill it in that means anything. (User's report, 2026-09-11.)
 *
 * One fact, two properties sources, and nothing between them. So this drives both for real,
 * from one base, and asserts they report the same figure.
 *
 * The two are handed the same coordinates in the projection each speaks — lon/lat here,
 * EPSG:3857 there — which is the only difference a renderer is allowed to make to this answer.
 */

import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import {fromLonLat} from 'ol/proj';
import type {Position} from 'geojson';
import {
    TacticalGraphicName,
    axisAndWidth,
    axisWithWidthPoint,
    carriesWidthPointInBase,
    hasAxisAndWidth,
    listTacticalGraphicNames,
    storedOrder,
    widthFromBase,
} from '@zaes/tactical-graphics';
import {createOpenLayersPropertiesSource} from './openlayers/featurePropertiesSource';
import {createMapLibrePropertiesSource} from './maplibre/featurePropertiesSource';
import {buildTacticalGraphic, type MapLibreTacticalGraphic} from './maplibre/maplibreAdapter';
import type {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import type {SelectedGraphic} from './featurePropertiesSource';

/** The half-width the fixture states, in ground metres. */
const HALF_WIDTH = 12_000;

/** The delay the OpenLayers source waits before hit-testing. @see HIT_TEST_DELAY_MS */
const HIT_TEST_DELAY_MS = 60;

const FAMILY = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(carriesWidthPointInBase);

/** One arrow's stored base, in lon/lat, with its width point already on the end. */
function baseFor(name: TacticalGraphicName): Position[] {
    const axis = storedOrder(name, [[-1.6, 39.8], [0.9, 40.0]] as Position[]) as Position[];
    return axisWithWidthPoint(name, axis, HALF_WIDTH) as Position[];
}

/** Drives the MapLibre source for a graphic that is already built. */
function maplibreSelectionFor(graphic: MapLibreTacticalGraphic): SelectedGraphic | null {
    let handler: ((event: {point: {x: number; y: number}}) => void) | undefined;
    const map = {
        on: (_event: string, fn: typeof handler) => {
            handler = fn;
        },
        off: () => {},
    };
    const source = createMapLibrePropertiesSource(map as never, {hitTest: () => graphic} as never);
    let selection: SelectedGraphic | null = null;
    source.onSelect(next => {
        selection = next;
    });
    handler?.({point: {x: 10, y: 10}});
    return selection;
}

/** What the MapLibre panel is handed when the operator clicks this graphic. */
function maplibreSelection(name: TacticalGraphicName, coordinates: Position[]): SelectedGraphic | null {
    const graphic = {
        id: 'g1',
        name,
        // No `width` in the bag, which is the point: these file none.
        properties: {name, rotation: 0},
        base: {type: 'Feature', geometry: {type: 'LineString', coordinates}, properties: {}},
    };

    let handler: ((event: {point: {x: number; y: number}}) => void) | undefined;
    const map = {
        on: (_event: string, fn: typeof handler) => {
            handler = fn;
        },
        off: () => {},
    };
    const source = createMapLibrePropertiesSource(map as never, {hitTest: () => graphic} as never);

    let selection: SelectedGraphic | null = null;
    source.onSelect(next => {
        selection = next;
    });
    handler?.({point: {x: 10, y: 10}});
    return selection;
}

/** And what the OpenLayers panel is handed for the same base. */
function openlayersSelection(name: TacticalGraphicName, coordinates: Position[]): SelectedGraphic | null {
    const projected = coordinates.map(position => fromLonLat(position as [number, number]));
    const base = new Feature({geometry: new LineString(projected)});

    const feature = new Feature({geometry: new LineString(projected)});
    feature.set('symbolId', 'g1');
    feature.set('graphicName', name);

    const manager = {
        isDrawing: () => false,
        isEditing: () => false,
        lastDrawEndedAt: 0,
        graphicControllers: [{getSymbolId: () => 'g1', graphic: {graphicName: name, base}}],
    } as unknown as TacticalGraphicsManager;

    let handler: ((event: {pixel: number[]}) => void) | undefined;
    const map = {
        on: (_event: string, fn: typeof handler) => {
            handler = fn;
        },
        un: () => {},
        forEachFeatureAtPixel: (_pixel: number[], fn: (f: Feature) => unknown) => fn(feature),
        getInteractions: () => ({getArray: () => []}),
    };
    const source = createOpenLayersPropertiesSource(map as never, manager);

    let selection: SelectedGraphic | null = null;
    source.onSelect(next => {
        selection = next;
    });
    handler?.({pixel: [10, 10]});
    vi.advanceTimersByTime(HIT_TEST_DELAY_MS + 5);
    return selection;
}

describe('the width in the properties panel', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('has all eleven arrows to check', () => {
        expect(FAMILY).toHaveLength(11);
    });

    it.each(FAMILY.map(name => [String(name), name] as const))(
        '%s reports the width its base states, on both engines',
        (_label, name) => {
            const coordinates = baseFor(name);
            // The library's own reading of the same base, so the two engines are compared
            // against the number rather than only against each other.
            const stated = widthFromBase(name, coordinates);
            expect(stated).toBeCloseTo(HALF_WIDTH * 2, 0);

            const maplibre = maplibreSelection(name, coordinates);
            const openlayers = openlayersSelection(name, coordinates);

            // **Defined, before anything else.** An absent measurement is what the dialog
            // answers with the typed input, and that is the whole defect.
            expect(maplibre?.measured.width).toBeDefined();
            expect(openlayers?.measured.width).toBeDefined();
            expect(maplibre!.measured.width).toBeCloseTo(stated!, 0);
            expect(openlayers!.measured.width).toBeCloseTo(stated!, 0);
        },
    );

    /**
     * **The other read-out the panel draws from a measurement.**
     *
     * The five plates that state a length and a width about one anchor point file both, and
     * both engines file the same numbers — measured, 80,000 m for 200101 on each. The panel
     * showed the figure on OpenLayers and nothing at all on MapLibre, because that source
     * reported every geometry input except this one. @see hasAxisAndWidth
     */
    it.each([
        TacticalGraphicName.LaunchAreaEllipse,
        TacticalGraphicName.DefendedAreaEllipse,
        TacticalGraphicName.ShipAreaOfInterestEllipse,
        TacticalGraphicName.CuedAcquisitionDoctrine,
        TacticalGraphicName.TargetAreaRectangular,
    ])('reports a length for %s on both engines', name => {
        expect(hasAxisAndWidth(name)).toBe(true);
        const derived = axisAndWidth(name, 40_000);
        expect(derived?.length).toBeGreaterThan(0);

        // The MapLibre source's own payload, built the way the dialog receives it.
        const graphic = buildTacticalGraphic(name, {type: 'Point', coordinates: [0, 40]}, {radius: 40_000, rotation: 0}, 1200);
        expect(graphic).toBeDefined();
        expect(graphic!.properties.length).toBeCloseTo(derived!.length, 3);

        const selection = maplibreSelectionFor(graphic!);
        expect(selection?.measured.length).toBeCloseTo(derived!.length, 3);
    });

    /**
     * A graphic whose width really is an amplifier keeps reporting the amplifier, so the
     * derivation cannot have been applied to everything. 290600 safe lane states a lane width
     * its plate letters and nothing on the map measures it; it must still be typable.
     */
    it('leaves a graphic whose width is an amplifier alone', () => {
        const name = TacticalGraphicName.SafeLaneOrGap;
        expect(carriesWidthPointInBase(name)).toBe(false);
        expect(widthFromBase(name, [[0, 0], [1, 0], [1.2, 0.2]] as Position[])).toBeUndefined();
    });
});
