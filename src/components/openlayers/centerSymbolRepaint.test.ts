/**
 * # A provider or size change repaints the OpenLayers center symbols
 *
 * A StyleFunction re-runs only when OpenLayers redraws. Registering a provider after the
 * graphics were drawn, or changing a size, therefore changed nothing on screen until
 * something unrelated moved the map. MapLibre's renderer subscribed to the shared registry
 * and repainted; this engine subscribed to nothing, and its own provider setter had no
 * notification to subscribe to.
 *
 * `changed()` is what re-runs a feature's style function, so that is what is counted here.
 */
import {vi} from 'vitest';
import {
    TacticalGraphicName,
    setGraphicSecuritySymbolProvider,
    setSecuritySymbolProvider,
    setSecuritySymbolSize,
} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {applyBaseGeometry} from './sampleGallery';
import {createTacticalGraphics} from './createTacticalGraphics';
import {
    DEFAULT_SYMBOL_SIZE_PX,
    setSecurityOperationSymbolProvider,
    setSecurityOperationSymbolSize,
    subscribeSecurityOperationSymbolChange,
} from './securityOperationSymbol';

/**
 * The live subscriptions, counted. A listener left behind repaints nothing once its
 * graphics are gone, so `changed()` counts cannot see the leak; the registry is
 * module-global, so what they miss is a manager (and its map) kept alive for good.
 */
const live = vi.hoisted(() => new Set<() => void>());
vi.mock('./securityOperationSymbol', async importOriginal => {
    const actual = await importOriginal<typeof import('./securityOperationSymbol')>();
    return {
        ...actual,
        subscribeSecurityOperationSymbolChange: (listener: () => void) => {
            const unsubscribe = actual.subscribeSecurityOperationSymbolChange(listener);
            const tracked = () => {
                live.delete(tracked);
                unsubscribe();
            };
            live.add(tracked);
            return tracked;
        },
    };
});

const RES = 1200;

/** A real manager on a stub map, as `settledBase.test.ts` builds one: nothing here renders. */
function stubbedManager(): TacticalGraphicsManager {
    const map = {
        addInteraction: () => {},
        addLayer: () => {},
        removeLayer: () => {},
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

/** A graphic put on the manager the way every door does it: features added, then watched. */
function drawn(name: TacticalGraphicName, manager: TacticalGraphicsManager): TacticalGraphicHandler {
    const handler = getController(name, RES);
    handler.setSymbolId(`id-${name}`);
    handler.getFeatures().forEach(f => {
        f.set('graphicName', name);
        f.set('symbolId', `id-${name}`);
    });
    applyBaseGeometry(handler, name, 500_000, 2_000_000, `id-${name}`);
    manager.renderingVectorSource.addFeatures(handler.getFeatures());
    manager.graphicControllers.push(handler);
    manager.watchResolution(handler);
    return handler;
}

/** Spies on `changed()` for every feature of a handler; returns the total call count. */
function spyChanged(handler: TacticalGraphicHandler): () => number {
    const spies = handler.getFeatures().map(f => vi.spyOn(f, 'changed'));
    return () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
}

afterEach(() => {
    setSecurityOperationSymbolProvider(undefined);
    setSecurityOperationSymbolSize(DEFAULT_SYMBOL_SIZE_PX);
    setSecuritySymbolProvider(undefined);
    setSecuritySymbolSize(DEFAULT_SYMBOL_SIZE_PX);
    setGraphicSecuritySymbolProvider(`id-${TacticalGraphicName.Screen}`, undefined);
    vi.restoreAllMocks();
});

describe('subscribeSecurityOperationSymbolChange', () => {
    it('reports the OpenLayers provider and size, and the shared registry, until unsubscribed', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeSecurityOperationSymbolChange(listener);

        setSecurityOperationSymbolProvider(() => 'x');
        setSecurityOperationSymbolSize(40);
        setSecuritySymbolProvider(() => 'y');
        setSecuritySymbolSize(40);
        setGraphicSecuritySymbolProvider('some-id', () => 'z');
        setGraphicSecuritySymbolProvider('some-id', undefined);
        expect(listener).toHaveBeenCalledTimes(6);

        unsubscribe();
        setSecurityOperationSymbolProvider(undefined);
        setSecuritySymbolProvider(undefined);
        expect(listener).toHaveBeenCalledTimes(6);
    });
});

describe('TacticalGraphicsManager', () => {
    const changes: Array<[string, () => void]> = [
        ['the OpenLayers provider', () => setSecurityOperationSymbolProvider(() => 'ol')],
        ['the OpenLayers size', () => setSecurityOperationSymbolSize(40)],
        ['the shared provider', () => setSecuritySymbolProvider(() => 'shared')],
        ['the shared size', () => setSecuritySymbolSize(40)],
        ['a per-graphic provider', () => setGraphicSecuritySymbolProvider(`id-${TacticalGraphicName.Screen}`, () => 'mine')],
    ];

    it.each(changes)('repaints a center-symbol graphic when %s changes', (_label, change) => {
        const manager = stubbedManager();
        const screen = spyChanged(drawn(TacticalGraphicName.Screen, manager));
        change();
        expect(screen()).toBeGreaterThan(0);
        manager.releaseAllGraphics();
    });

    it('repaints all six center-symbol graphics, and leaves the rest alone', () => {
        const manager = stubbedManager();
        const six = [
            TacticalGraphicName.Cover,
            TacticalGraphicName.Guard,
            TacticalGraphicName.Screen,
            TacticalGraphicName.Escort,
            TacticalGraphicName.FollowAndAssume,
            TacticalGraphicName.FollowAndSupport,
        ].map(name => [name, spyChanged(drawn(name, manager))] as const);
        const phaseLine = spyChanged(drawn(TacticalGraphicName.PhaseLine, manager));

        setSecurityOperationSymbolProvider(() => 'ol');

        for (const [name, count] of six) expect([name, count() > 0]).toEqual([name, true]);
        expect(phaseLine()).toBe(0);
        manager.releaseAllGraphics();
    });

    it('does not subscribe until it holds a graphic', () => {
        const baseline = live.size;
        stubbedManager();
        expect(live.size).toBe(baseline);
    });

    it('stops listening once its graphics are released', () => {
        const baseline = live.size;
        const manager = stubbedManager();
        const screen = spyChanged(drawn(TacticalGraphicName.Screen, manager));
        expect(live.size).toBe(baseline + 1);
        manager.releaseAllGraphics();
        expect(live.size).toBe(baseline);
        setSecurityOperationSymbolProvider(() => 'ol');
        setSecuritySymbolProvider(() => 'shared');
        expect(screen()).toBe(0);
    });

    it('stops listening once the last graphic is unwatched', () => {
        const baseline = live.size;
        const manager = stubbedManager();
        const handler = drawn(TacticalGraphicName.Screen, manager);
        const cover = drawn(TacticalGraphicName.Cover, manager);
        const screen = spyChanged(handler);
        manager.unwatchResolution(handler);
        // Still holding the cover, so still listening.
        expect(live.size).toBe(baseline + 1);
        manager.unwatchResolution(cover);
        expect(live.size).toBe(baseline);
        setSecurityOperationSymbolProvider(() => 'ol');
        expect(screen()).toBe(0);
    });

    it('subscribes once however many graphics it holds', () => {
        const baseline = live.size;
        const manager = stubbedManager();
        const handler = drawn(TacticalGraphicName.Screen, manager);
        drawn(TacticalGraphicName.Cover, manager);
        expect(live.size).toBe(baseline + 1);
        const features = handler.getFeatures().length;
        const screen = spyChanged(handler);
        setSecurityOperationSymbolProvider(() => 'ol');
        // One changed() per feature: a second subscription would double it.
        expect(screen()).toBe(features);
        manager.releaseAllGraphics();
    });
});

describe('createTacticalGraphics', () => {
    it('stops repainting after destroy', () => {
        const baseline = live.size;
        const manager = stubbedManager();
        const engine = createTacticalGraphics(manager.map, {manager});
        const handler = drawn(TacticalGraphicName.Screen, manager);
        const screen = spyChanged(handler);

        setSecurityOperationSymbolProvider(() => 'before');
        const before = screen();
        expect(before).toBeGreaterThan(0);

        engine.destroy();
        expect(live.size).toBe(baseline);
        setSecurityOperationSymbolProvider(() => 'after');
        setSecuritySymbolProvider(() => 'after');
        expect(screen()).toBe(before);
    });
});
