/**
 * # A round trip has an origin, and both origins are a test
 *
 * The engine toggle hands graphics over as a snapshot, and a host writes the same thing to
 * disk. **The two engines do not stamp the same keys for the same fact**: MapLibre files a
 * rectangular target's size as `length` and no `radius`; OpenLayers files both. So "it
 * survives the toggle" is two questions, and asking only one proves half of it.
 *
 * That is not hypothetical. Eleven driven flows and a fifteen-graphic sweep, every one of
 * them drawing on OpenLayers first, all came back clean — while a target drawn on **MapLibre**
 * came back two orders of magnitude small, first try, because the restore's geometry reader
 * had quietly dropped `length` and the holder fell back to its constructor seed: the *view
 * resolution*. (User's export, 2026-09-04.)
 *
 * These are unit tests over the portable description rather than a driven browser, because
 * the handover *is* that description — `MapEngineHandle.snapshot()` produces it and
 * `restore()` consumes it, and a defect in between shows here without a map.
 * @see tmp/probe-roundtrip-sweep.mjs, which drives the same thing with `--from-maplibre`
 */
import VectorSource from 'ol/source/Vector';
import {TacticalGraphicName, SNAPSHOT_VERSION, toSnapshot} from '@zaes/tactical-graphics';
import type {Feature as GeoFeature, Geometry} from 'geojson';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './openlayers/persistence';
import {readGraphicLabels} from './openlayers/graphicProperties';
import type {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';

/** A manager with just enough on it for persistence to run. @see persistence.test.ts */
function fakeManager(): TacticalGraphicsManager {
    const source = new VectorSource();
    return {
        map: {getView: () => ({getResolution: () => 100})},
        renderingVectorSource: source,
        graphicControllers: [] as unknown[],
        addGraphic: () => undefined,
        watchResolution: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

/**
 * A base feature shaped the way **MapLibre** writes one.
 *
 * The differences from OpenLayers' own output are the whole point: no `radius`, no
 * `designation`, a `decorationSize` where a point-anchored holder would have filed a size,
 * and — until 2026-09-04 — no `tacticalGraphicsVersion` on the collection around it.
 */
function maplibreBase(name: TacticalGraphicName, bag: Record<string, unknown>): GeoFeature<Geometry> {
    return {
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [-123.5, 32.3]},
        properties: {
            role: 'base',
            symbolId: 'mlb-253',
            graphicName: name,
            tacticalGraphic: {name, ...bag},
        },
    } as GeoFeature<Geometry>;
}

/** The geometry inputs on the rebuilt graphic, as the next snapshot would carry them. */
function restoredBag(snapshot: unknown): Record<string, number> {
    const to = fakeManager();
    const report = restoreTacticalGraphics(to, snapshot as never);
    expect(report.failed).toEqual([]);
    const controller = to.graphicControllers[0];
    expect(controller).toBeDefined();
    const graphic = controller.getFeatures().find(f => f.get('role') === 'graphic');
    return readGraphicLabels(graphic!) as unknown as Record<string, number>;
}

describe('the handover, from each origin', () => {
    it('restores a MapLibre-shaped bag: a length, and no radius at all', () => {
        /*
         * **The defect, pinned.** `state.length !== undefined ? state.length / 2 :
         * state.radius` always fell to `radius`, because the reader's object literal had no
         * `length` in it and `GraphicGeometryState` is a `Pick` of optionals — so the
         * compiler had no opinion. Right for a file OpenLayers wrote; wrong for one MapLibre
         * wrote, where it left the graphic with no size at all.
         */
        const bag = restoredBag(toSnapshot([
            maplibreBase(TacticalGraphicName.TargetAreaRectangular, {
                length: 585_928, width: 386_712, rotation: -17.7, decorationSize: 59_381,
            }),
        ]));
        expect(bag.length).toBeCloseTo(585_928, 0);
        expect(bag.radius).toBeCloseTo(585_928 / 2, 0);
    });

    it('restores an OpenLayers-shaped bag: a radius, and a length beside it', () => {
        // The other origin, which is the one that could never fail — it stamps both keys.
        const bag = restoredBag(toSnapshot([
            maplibreBase(TacticalGraphicName.TargetAreaRectangular, {
                radius: 292_964, length: 585_928, width: 386_712, rotation: -17.7,
            }),
        ]));
        expect(bag.length).toBeCloseTo(585_928, 0);
        expect(bag.radius).toBeCloseTo(292_964, 0);
    });

    it('survives a second trip, so the round is closed rather than merely arrived', () => {
        /*
         * A restore that lands right once and drifts on the next hand-over is the same
         * defect one step later. Serializing what was restored and restoring that again is
         * the cheapest way to ask.
         */
        const first = restoredBag(toSnapshot([
            maplibreBase(TacticalGraphicName.TargetAreaRectangular, {
                length: 585_928, width: 386_712, rotation: -17.7,
            }),
        ]));

        const to = fakeManager();
        restoreTacticalGraphics(to, toSnapshot([
            maplibreBase(TacticalGraphicName.TargetAreaRectangular, {
                length: 585_928, width: 386_712, rotation: -17.7,
            }),
        ]) as never);
        const again = restoredBag(serializeTacticalGraphics(to));

        for (const key of ['length', 'width', 'radius', 'rotation'] as const) {
            expect([key, Math.round(again[key])]).toEqual([key, Math.round(first[key])]);
        }
    });

    it('reads a MapLibre collection that carries no version at all', () => {
        /*
         * Every MapLibre export before 2026-09-04 wrote a bare `FeatureCollection`, because
         * `SNAPSHOT_VERSION` lived in the OpenLayers half and MapLibre cannot import across
         * the renderer boundary. Those files are structurally identical to ours and are read.
         */
        const bare = {
            type: 'FeatureCollection',
            features: [maplibreBase(TacticalGraphicName.TargetAreaRectangular, {length: 585_928, width: 386_712})],
        };
        const to = fakeManager();
        const report = restoreTacticalGraphics(to, bare as never);
        expect(report.failed).toEqual([]);
        expect(report.restored).toBe(1);
        expect(report.version).toBe(SNAPSHOT_VERSION);
    });
});
