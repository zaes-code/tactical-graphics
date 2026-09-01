/**
 * Export/import fidelity for **every** registered graphic.
 *
 * `persistence.test.ts` covers one name per holder family and `resolutionSweep.test.ts`
 * sweeps 32 names. Both have missed real failures this week because the axis was wrong.
 * This one takes the whole registry: draw it, serialize it, restore it onto a fresh
 * manager, and compare what came back against what went in.
 */
import VectorSource from 'ol/source/Vector';
import {listTacticalGraphicNames, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {applyBaseGeometry} from './sampleGallery';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './persistence';
import {readGraphicGeometryState, readGraphicLabels} from './graphicProperties';

const RES = 1200;
const VIEW_RES = RES * 4;   // restoring at a different zoom is the normal case
const CX = 500_000;
const CY = 2_000_000;

function fakeManager() {
    const watched: TacticalGraphicHandler[] = [];
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: () => undefined, getResolution: () => VIEW_RES})},
        watchResolution: (h: TacticalGraphicHandler) => {
            if (!watched.includes(h)) watched.push(h);
        },
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

function build(manager: TacticalGraphicsManager, name: TacticalGraphicName) {
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

/** Everything worth comparing across a round trip. */
function snapshotOf(handler: TacticalGraphicHandler) {
    const feats = handler.getFeatures();
    const graphic = feats.find(f => f.get('role') === 'graphic')?.getGeometry();
    const base = handler.graphic.base.getGeometry();
    const round = (n: number) => Math.round(n * 1000) / 1000;
    return {
        featureCount: feats.length,
        symbolId: handler.getSymbolId(),
        baseType: base?.getType() ?? null,
        baseExtent: base?.getExtent().map(round) ?? null,
        graphicType: graphic?.getType() ?? null,
        graphicExtent: graphic?.getExtent().map(round) ?? null,
        geometryState: readGraphicGeometryState(handler.graphic.base),
        labels: readGraphicLabels(handler.graphic.base),
    };
}

/**
 * Every registered graphic, with nothing filtered out.
 *
 * There used to be one exception — `AxisOfAttack`, a generator registered without a
 * `TacticalGraphicName` member, so the enum-keyed `CONTROLLER_REGISTRY` had no entry for it
 * and `getController` threw. It was removed in 4.0.0: it appeared in neither publication and
 * had no UI path, so the registry and the enum now hold the same 291 names.
 */
const NAMES = listTacticalGraphicNames() as TacticalGraphicName[];

describe(`every registered graphic round-trips (${NAMES.length} names)`, () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        const from = fakeManager();
        const original = build(from, name);
        const before = snapshotOf(original);

        const report = restoreTacticalGraphics(fromSnapshot(from), serializeTacticalGraphics(from));
        expect(report.failed).toEqual([]);
        expect(report.restored).toBe(1);

        const after = snapshotOf(lastManager!.graphicControllers[0]);
        expect(after.baseType).toBe(before.baseType);
        expect(after.graphicType).toBe(before.graphicType);
        expect(after.featureCount).toBe(before.featureCount);
        expect(after.symbolId).toBe(before.symbolId);
        expect(after.baseExtent).toEqual(before.baseExtent);
        // Numbers compared to 9 significant figures, not exactly. A graphic converted to
        // APP-06's drawn anchor points **derives** its frame from geometry on every
        // rebuild rather than carrying a stored scalar, so a save and a restore agree to
        // floating-point precision and no further: an envelopment came back with a
        // rotation of 3.3e-13 instead of 0 and a bend differing in the 14th decimal.
        // Insisting on exact equality there asserts the arithmetic, not the round trip.
        expectStateClose(after.geometryState, before.geometryState, name);
        // The amplifier bag carries the geometry inputs too, so it drifts the same way.
        expectStateClose(after.labels as unknown as Record<string, unknown>, before.labels as unknown as Record<string, unknown>, name);
    });
});

/**
 * Keys that a restore is **entitled** to answer differently, per graphic.
 *
 * The security operations' `radius` is `SECURITY_OPERATION_HALF_EXTENT_PX` times the live
 * resolution: the symbol is pinned to 410 x 29 px, so its size in metres is a statement
 * about the zoom it was last realised at, and a snapshot deliberately carries no zoom.
 * This test restores at four times the drawing resolution — "the normal case" — so the
 * figure comes back four times larger for the very same picture. Asserting it would be
 * asserting that the pinning does not work.
 * @see SECURITY_OPERATION_HALF_EXTENT_PX
 */
const REDERIVED_PER_ZOOM: Partial<Record<string, readonly string[]>> = {
    Cover: ['radius'],
    Guard: ['radius'],
    Screen: ['radius'],
};

/** Compares two geometry-state bags, allowing floating-point drift on the numbers. */
function expectStateClose(after: Record<string, unknown>, before: Record<string, unknown>, name?: TacticalGraphicName): void {
    const exempt = REDERIVED_PER_ZOOM[String(name)] ?? [];
    // The union, and an absent key treated as undefined: the amplifier bag carries
    // optional fields, and one side writing `undefined` where the other omits the key
    // entirely is not a round-trip failure.
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    for (const key of keys) {
        if (exempt.includes(key)) continue;
        const a = after[key];
        const b = before[key];
        if (typeof a === 'number' && typeof b === 'number') {
            const scale = Math.max(1, Math.abs(b));
            expect(Math.abs(a - b) / scale).toBeLessThan(1e-9);
        } else {
            expect(a).toEqual(b);
        }
    }
}

/** Holds the destination manager so the assertions can reach it. */
let lastManager: TacticalGraphicsManager | undefined;
function fromSnapshot(_from: TacticalGraphicsManager): TacticalGraphicsManager {
    lastManager = fakeManager();
    return lastManager;
}
