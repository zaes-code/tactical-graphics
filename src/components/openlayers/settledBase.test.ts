/**
 * # The stored base is always the library's reading of it
 *
 * `normalizeDrawnBase` is what turns clicks into the points APP-06 numbers: the demolition
 * family's third point onto the perpendicular at the centreline's midpoint, block's stem
 * square to its bar, the eleven axis arrows' width point onto the arrowhead's back corner.
 * MapLibre runs it inside `buildTacticalGraphic`, so **every** door it has — draw, restore,
 * import, every move of every gesture — comes in through it. This engine has three doors and
 * ran it on two, which is a difference nothing measured.
 *
 * What that cost, both found on the running app on 2026-09-22:
 *
 * - **A restore computed the answer and threw it away.** The write-back was guarded on the
 *   point *count*, from the one fault it was added for — a base saved short of a point — so a
 *   base the normalizer re-*placed* was left as the file had it. A restored 271201-271204 held
 *   a square point 3 on MapLibre and the raw click here, and the first endpoint drag turned
 *   that into a visible difference, because each engine re-squared from a different point 3:
 *   197 m apart after a point 1 drag, 981 m after a point 2 drag.
 * - **A gesture never settled at all.** Rotate, resize and translate transform the base
 *   wholesale in projected metres, and the constraint being transformed is geodesic, so the
 *   point comes out sheared off the perpendicular. Measured over the registry: 35 graphics,
 *   up to 902 m after one rotate-resize-translate.
 *
 * The invariant is one sentence — whatever the base is, `normalizeDrawnBase` agrees with it —
 * and it is asserted at each door rather than per graphic, because the families that derive a
 * point are the ones nobody thinks to check. @see LineGraphicController.settleBase
 */
import VectorSource from 'ol/source/Vector';
import Collection from 'ol/Collection';
import {Feature} from 'ol';
import {LineString} from 'ol/geom';
import {fromLonLat, toLonLat} from 'ol/proj';
import type {Coordinate} from 'ol/coordinate';
import type {Position} from 'geojson';
import {listTacticalGraphicNames, normalizeDrawnBase, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {applyBaseGeometry} from './sampleGallery';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './persistence';

const RES = 1200;
const CX = 500_000;
const CY = 2_000_000;

/**
 * A millimetre, in projected metres. The base has made a 3857 → 4326 → 3857 trip by the time
 * it is compared and that lands far inside this; anything a normalizer means by moving a point
 * is far outside it.
 */
const SAME_M = 1e-3;

const fakeManager = () => ({
    renderingVectorSource: new VectorSource(),
    graphicControllers: [] as TacticalGraphicHandler[],
    map: {getView: () => ({on: () => undefined, getResolution: () => RES})},
    watchResolution: () => undefined,
    unwatchResolution: () => undefined,
    releaseAllGraphics: () => undefined,
} as unknown as TacticalGraphicsManager);

/** How far a base sits from what the library says it should be, in metres. */
function driftFromTheLibrary(name: TacticalGraphicName, coords: Coordinate[]): number {
    const settled = normalizeDrawnBase(name, coords.map(c => toLonLat(c)) as Position[]).map(c => fromLonLat(c as Coordinate));
    if (settled.length !== coords.length) return Infinity;
    return Math.max(...coords.map((c, i) => Math.hypot(c[0] - settled[i][0], c[1] - settled[i][1])));
}

function lineBaseOf(handler: TacticalGraphicHandler): Coordinate[] | undefined {
    const geometry = handler.graphic.base?.getGeometry();
    return geometry instanceof LineString ? geometry.getCoordinates() : undefined;
}

/**
 * A real manager on a stub map, for the one door that is the manager's rather than a
 * controller's. The four map methods it touches here are stubbed to match, as
 * `editMode.test.ts` does: nothing under test is rendering.
 */
function stubbedManager(): TacticalGraphicsManager {
    const map = {
        addInteraction: () => {},
        addLayer: () => {},
        removeInteraction: () => {},
        on: () => {},
        un: () => {},
        getView: () => ({getResolution: () => RES, on: () => ({}), un: () => {}}),
        getTargetElement: () => ({style: {}, getBoundingClientRect: () => ({left: 0, top: 0})}),
        getPixelFromCoordinate: (c: number[]) => [c[0] / RES, -c[1] / RES],
        getCoordinateFromPixel: (p: number[]) => [p[0] * RES, -p[1] * RES],
        forEachFeatureAtPixel: () => undefined,
        getInteractions: () => ({getArray: () => []}),
    };
    return new TacticalGraphicsManager(map as never);
}

/** A graphic on a fresh manager, drawn the way both sample sheets draw one. */
function drawn(name: TacticalGraphicName, manager: TacticalGraphicsManager): TacticalGraphicHandler {
    const handler = getController(name, RES);
    handler.setSymbolId(`id-${name}`);
    handler.getFeatures().forEach(f => {
        f.set('graphicName', name);
        f.set('symbolId', `id-${name}`);
    });
    applyBaseGeometry(handler, name, CX, CY, `id-${name}`);
    manager.renderingVectorSource.addFeatures(handler.getFeatures());
    manager.graphicControllers.push(handler);
    return handler;
}

const NAMES = listTacticalGraphicNames() as TacticalGraphicName[];

describe(`a base the library agrees with (${NAMES.length} names)`, () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s is drawn and left settled', (_label, name) => {
        const handler = drawn(name, fakeManager());
        const asDrawn = lineBaseOf(handler);
        // Point- and polygon-based graphics have no drawn path for the normalizer to read.
        if (!asDrawn) return;
        expect(driftFromTheLibrary(name, asDrawn)).toBeLessThan(SAME_M);

        // Every gesture the manager routes, then the end it always reaches.
        handler.handleRotate?.(0.35);
        handler.handleResize?.(1.4);
        handler.handleTranslate?.(1500, -900);
        (handler as {endGesture?: () => void}).endGesture?.();

        const afterGesture = lineBaseOf(handler);
        expect(afterGesture).toBeDefined();
        expect(driftFromTheLibrary(name, afterGesture!)).toBeLessThan(SAME_M);
    });
});

describe('a Modify drag settles the base it leaves', () => {
    /**
     * OpenLayers' own `Modify` is the fourth door, and it ends the same way the others do: a
     * shape the user has stopped changing. The manager rebuilds the graphic on `modifyend`.
     *
     * **This one was already closed, and the measurement is why it stayed that way.** A settle
     * was written into `modifyend` and then taken out again: with it reverted every row here
     * still passed, because the only graphics `Modify` can reach whose base the library
     * re-places are the eleven axis arrows — everything else with a derived point carries
     * `base: false` and never enters the interaction's collection — and `MovementGraphicBase`
     * already normalizes inside its own `setBaseFeature`. A second statement of a rule that is
     * already kept is the shape of defect this repository keeps finding, so what is left here
     * is the assertion rather than the code.
     *
     * It runs over every graphic `Modify` will actually hand back, so it fails if the holder
     * that provides this stops providing it.
     *
     * Driven against the stub map `editMode.test.ts` uses, because nothing under test here is
     * rendering: the event carries the edited feature and the handler does the rest.
     */
    const MODIFIABLE = NAMES.filter(name => {
        const manager = stubbedManager();
        const handler = drawn(name, manager);
        return lineBaseOf(handler) !== undefined && handler.graphic.base?.get('base') !== false;
    });

    it.each(MODIFIABLE.map(n => [String(n), n] as const))('%s', (_label, name) => {
        const manager = stubbedManager();
        const handler = drawn(name, manager);
        manager.addModifyInteraction();

        const base = handler.graphic.base as Feature;
        const geometry = base.getGeometry() as LineString;
        // One endpoint dragged, the way `Modify` leaves it: the vertex moved and nothing else.
        const moved = geometry.getCoordinates().map(c => [...c]);
        moved[0] = [moved[0][0] - 30_000, moved[0][1] - 20_000];
        geometry.setCoordinates(moved);

        manager.modify!.dispatchEvent({type: 'modifyend', features: new Collection([base])} as never);

        const settledBase = lineBaseOf(handler);
        expect(settledBase).toBeDefined();
        expect(driftFromTheLibrary(name, settledBase!)).toBeLessThan(SAME_M);
        // And it is the drag's own answer, not a base put back where it started.
        expect(Math.hypot(settledBase![0][0] - moved[0][0], settledBase![0][1] - moved[0][1])).toBeLessThan(SAME_M);
    });
});

describe('a restore settles the base it was handed', () => {
    /**
     * 271201's own words — *"points 1 and 2 define the endpoints of the symbol and point 3
     * defines the location of one side"* — so a point 3 carrying an along-centreline offset is
     * a file this library can be handed and not one it writes: an older save, a hand-built
     * collection, a consumer's own GeoJSON. It comes back on the perpendicular, which is where
     * MapLibre puts it and where the plate does.
     */
    it.each([
        TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
        TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
        TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
        TacticalGraphicName.RoadblockCompleteExecuted,
    ].map(n => [String(n), n] as const))('%s', (_label, name) => {
        const from = fakeManager();
        drawn(name, from);

        const snapshot = serializeTacticalGraphics(from);
        const saved = snapshot.features[0].geometry as {type: string; coordinates: Position[]};
        expect(saved.type).toBe('LineString');
        // Half the run slid sideways along the centreline, which no draw would have stored.
        const skewed = saved.coordinates.map(c => [...c]) as Position[];
        skewed[2] = [skewed[2][0] + (skewed[1][0] - skewed[0][0]) / 2, skewed[2][1]];
        saved.coordinates = skewed;

        const to = fakeManager();
        const report = restoreTacticalGraphics(to, snapshot);
        expect(report.failed).toEqual([]);
        expect(report.restored).toBe(1);

        const restored = lineBaseOf(to.graphicControllers[0]);
        expect(restored).toBeDefined();
        expect(driftFromTheLibrary(name, restored!)).toBeLessThan(SAME_M);
        // And settled to the answer the skewed file's own points give, not to some other base.
        const expected = normalizeDrawnBase(name, skewed).map(c => fromLonLat(c as Coordinate));
        restored!.forEach((c, i) => expect(Math.hypot(c[0] - expected[i][0], c[1] - expected[i][1])).toBeLessThan(SAME_M));
    });
});
