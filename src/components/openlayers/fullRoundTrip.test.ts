/**
 * Export/import fidelity for **every** registered graphic.
 *
 * `persistence.test.ts` covers one name per holder family and `resolutionSweep.test.ts`
 * sweeps 32 names. Both have missed real failures this week because the axis was wrong.
 * This one takes the whole registry: draw it, serialise it, restore it onto a fresh
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
 * `AxisOfAttack` is registered in the core registry without a `TacticalGraphicName`
 * member, so `CONTROLLER_REGISTRY` — keyed by the enum — has no entry and `getController`
 * throws. It is reachable through `renderTacticalGraphic` but not drawable in this
 * renderer. See ai/context.md, "Counts".
 */
const NO_CONTROLLER = ['AxisOfAttack'];

const NAMES = (listTacticalGraphicNames() as TacticalGraphicName[])
    .filter(n => !NO_CONTROLLER.includes(String(n)));

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
        expect(after.geometryState).toEqual(before.geometryState);
        expect(after.labels).toEqual(before.labels);
    });
});

/** Holds the destination manager so the assertions can reach it. */
let lastManager: TacticalGraphicsManager | undefined;
function fromSnapshot(_from: TacticalGraphicsManager): TacticalGraphicsManager {
    lastManager = fakeManager();
    return lastManager;
}
