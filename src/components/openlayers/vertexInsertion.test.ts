/**
 * # OpenLayers asks the library before `Modify` inserts a vertex
 *
 * Reported as "abatis should not accept vertices within the triangle opening" (user,
 * 2026-09-06): an edit-mode drag on the head of the route put a base vertex inside the
 * chevron, which is the one place on an abatis's line that is not road. Measured in the
 * running app, both engines did it.
 *
 * `acceptsInsertedVertex` is the rule and lives in the map-agnostic half; what this suite
 * pins is that OpenLayers actually **gates on it** — the `insertVertexCondition` handed to
 * `Modify`. Reverting that one option leaves every assertion in
 * `tacticalgraphics/vertexInsertion.test.ts` green, because nothing there goes near a
 * renderer.
 *
 * The condition is reached through `Modify`'s own private field on purpose. It is the only
 * way in: OpenLayers gives the option no accessor, and asserting anything less than "the
 * interaction we installed refuses this pointer position" would be asserting that a line of
 * code exists rather than that it works.
 */

import {Feature} from 'ol';
import {Modify} from 'ol/interaction';
import LineString from 'ol/geom/LineString';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {InteractionType, TacticalGraphicsManager} from './TacticalGraphicsManager';
import {getController} from './controllerRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';

/** Meters per pixel. One projected unit per hundredth of a pixel keeps the sums readable. */
const RES = 100;

/** The chevron's width in screen pixels, and the same distance in projected units. */
const LEAD_PX = 26;
const LEAD = LEAD_PX * RES;

/**
 * A manager on a stub map — the same one `editMode.test.ts` builds, for the same reason: a
 * real `ol/Map` in jsdom brings a renderer that never paints, and everything under test
 * here is bookkeeping plus two pixel conversions.
 *
 * `getPixelFromCoordinate` is the identity over `RES` with y flipped, so a projected
 * distance and a screen distance are the same number scaled — which is what lets the
 * assertions below be written in pixels.
 */
function stubbedManager(): TacticalGraphicsManager & {interactions: unknown[]} {
    const interactions: unknown[] = [];
    const map = {
        addInteraction: (i: unknown) => interactions.push(i),
        addLayer: () => {},
        removeInteraction: (i: unknown) => {
            const at = interactions.indexOf(i);
            if (at >= 0) interactions.splice(at, 1);
        },
        on: () => {},
        un: () => {},
        getView: () => ({getResolution: () => RES, on: () => ({}), un: () => {}}),
        getTargetElement: () => ({style: {}, getBoundingClientRect: () => ({left: 0, top: 0})}),
        getPixelFromCoordinate: (c: number[]) => [c[0] / RES, -c[1] / RES],
        getCoordinateFromPixel: (p: number[]) => [p[0] * RES, -p[1] * RES],
        forEachFeatureAtPixel: () => undefined,
        getInteractions: () => ({getArray: () => []}),
    };
    const manager = new TacticalGraphicsManager(map as never) as TacticalGraphicsManager & {interactions: unknown[]};
    manager.interactions = interactions;
    return manager;
}

/** Builds a graphic on a west-to-east run, registers it, and puts its features in the source. */
function build(manager: TacticalGraphicsManager, name: TacticalGraphicName, symbolId: string): TacticalGraphicHandler {
    const handler = getController(name, RES);
    handler.setSymbolId(symbolId);
    handler.getFeatures().forEach(feature => {
        feature.set('graphicName', name);
        feature.set('symbolId', symbolId);
    });
    const base = handler.graphic.base as Feature;
    base.setGeometry(new LineString([[0, 0], [400 * RES, 0]]));
    handler.setBaseFeature(base as never);
    manager.renderingVectorSource.addFeatures(handler.getFeatures());
    manager.graphicControllers.push(handler);
    return handler;
}

/** The installed `Modify`'s insertion gate, as a predicate over a projected coordinate. */
function insertionGate(manager: TacticalGraphicsManager & {interactions: unknown[]}): (x: number, y: number) => boolean {
    const modify = manager.interactions.find(i => i instanceof Modify) as Modify | undefined;
    expect(modify).toBeDefined();
    const condition = (modify as unknown as {insertVertexCondition_: (e: unknown) => boolean}).insertVertexCondition_;
    return (x, y) => condition.call(modify, {
        coordinate: [x, y],
        pixel: [x / RES, -y / RES],
    });
}

/** Selects `handler` in edit mode, which is what installs `Modify` over its base. */
function edit(manager: TacticalGraphicsManager, handler: TacticalGraphicHandler): void {
    manager.setInteractionMode(InteractionType.edit);
    manager.setSelection(handler);
}

describe('the Modify interaction is gated', () => {
    it('installs a condition at all', () => {
        const manager = stubbedManager();
        edit(manager, build(manager, TacticalGraphicName.Abatis, 'a'));
        expect(typeof insertionGate(manager)).toBe('function');
    });

    it('refuses a vertex inside the abatis chevron', () => {
        const manager = stubbedManager();
        edit(manager, build(manager, TacticalGraphicName.Abatis, 'a'));
        const allows = insertionGate(manager);

        // Under the apex, and just short of the far foot — the whole opening.
        expect(allows(LEAD / 2, 0)).toBe(false);
        expect(allows(LEAD - RES, 0)).toBe(false);
    });

    it('accepts a vertex on the run past the chevron', () => {
        const manager = stubbedManager();
        edit(manager, build(manager, TacticalGraphicName.Abatis, 'a'));
        const allows = insertionGate(manager);

        expect(allows(LEAD + 2 * RES, 0)).toBe(true);
        expect(allows(200 * RES, 0)).toBe(true);
    });

    it('leaves a free-form line taking vertices everywhere', () => {
        const manager = stubbedManager();
        edit(manager, build(manager, TacticalGraphicName.PhaseLine, 'a'));
        const allows = insertionGate(manager);

        expect(allows(LEAD / 2, 0)).toBe(true);
        expect(allows(200 * RES, 0)).toBe(true);
    });

    it('lets a far-away abatis answer for nobody', () => {
        /*
         * `Modify` gives the condition a pointer event and no feature, so the base under
         * the cursor has to be recovered from the geometry. A graphic the user is nowhere
         * near must not veto an insertion on the one they are editing — in `modify` mode
         * every base is in the collection at once.
         */
        const manager = stubbedManager();
        const phaseLine = build(manager, TacticalGraphicName.PhaseLine, 'a');
        const abatis = build(manager, TacticalGraphicName.Abatis, 'b');
        (abatis.graphic.base as Feature).setGeometry(new LineString([[0, 900 * RES], [400 * RES, 900 * RES]]));

        edit(manager, phaseLine);
        // Dead inside the abatis's chevron, measured along its x — but 900 px away from it.
        expect(insertionGate(manager)(LEAD / 2, 0)).toBe(true);
    });

    it('answers true for the pointer event Modify has not had yet', () => {
        // `insertVertexCondition_` is also called with `lastPointerEvent_`, which is null
        // until the interaction has seen one.
        const manager = stubbedManager();
        edit(manager, build(manager, TacticalGraphicName.Abatis, 'a'));
        const modify = manager.interactions.find(i => i instanceof Modify) as Modify;
        const condition = (modify as unknown as {insertVertexCondition_: (e: unknown) => boolean}).insertVertexCondition_;
        expect(condition.call(modify, null)).toBe(true);
    });
});
