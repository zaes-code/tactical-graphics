/**
 * # The hashed line between a graphic's anchor points, on both engines
 *
 * Reported by the user, 2026-09-06: *"all graphics with parallel lines like gap/bridge/
 * assault crossing, convoy graphics, explosives graphics need a hashed line between
 * vertices like corridors and main axis of advance (family). All those hashed lines
 * including the existing ones need to take the 'inert' color."*
 *
 * Three things are stated in more than one place and so have to be checked:
 *
 * 1. **Which graphics draw the mark** is one Layer-1 set, `drawsAnchorConnector`, and both
 *    engines read it. It had been *implied* rather than stated — OpenLayers un-hid a base
 *    whenever `Modify` was installed over it, so the families whose vertex count is capped
 *    silently lost the mark and MapLibre drew no base at all.
 * 2. **Which run it follows.** The demolition family stores a width point past point 2;
 *    drawing the base whole hashes a spur out to it.
 * 3. **What colour it is.** Editor chrome, so the inert-handle colour on every affiliation
 *    — it used to take the hostility colour at 35% opacity and go pale red on an enemy
 *    symbol, which reads as part of the symbol. @see ai/decisions.md, the hostility rule
 */

import {Feature} from 'ol';
import LineString from 'ol/geom/LineString';
import {
    DEFAULT_PALETTE,
    TacticalGraphicHostility,
    TacticalGraphicName,
    anchorConnectorRun,
    configureTacticalGraphics,
    drawsAnchorConnector,
    listTacticalGraphicNames,
    resetTacticalGraphicsConfig,
} from '@zaes/tactical-graphics';
import {createBaseFeature} from './openlayers/openlayerStyles';
import {InteractionType, TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import {getController} from './openlayers/controllerRegistry';
import {connectorFeatures} from './maplibre/native/NativeLayerRenderer';
import type {TacticalGraphicHandler} from './openlayers/openlayersAdapter';
import type {MapLibreTacticalGraphic} from './maplibre/maplibreAdapter';

/** The resolution the controllers are built at, in meters per pixel. */
const RES = 100;

/** The families the user named, plus the two they named as the reference. */
const CROSSINGS = [
    TacticalGraphicName.Bridge,
    TacticalGraphicName.Gap,
    TacticalGraphicName.AssaultCrossing,
    TacticalGraphicName.FordEasy,
    TacticalGraphicName.FordDifficult,
];
const CONVOYS = [TacticalGraphicName.MovingConvoy, TacticalGraphicName.HaltedConvoy];
const EXPLOSIVES = [
    TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
    TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
    TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
];
/** The two the request named as already having the mark. */
const REFERENCE = [TacticalGraphicName.AirCorridor, TacticalGraphicName.MainAxisOfAdvance];
/** Carries a width point past point 2, so the mark stops at the centreline. @see sideAnchors */
const SIDE_POINT = [TacticalGraphicName.InfiltrationLane, ...EXPLOSIVES];

// ── 1. One statement, read by both engines ───────────────────────────────────

describe('which graphics hash a line between their anchor points', () => {
    it.each([...CROSSINGS, ...CONVOYS, ...EXPLOSIVES, ...REFERENCE, TacticalGraphicName.InfiltrationLane])(
        '%s draws one',
        name => expect(drawsAnchorConnector(name)).toBe(true),
    );

    /**
     * The three that look like they belong and do not, kept as a test because "it has
     * parallel lines" is the wrong question — what matters is whether the run between the
     * anchor points is *already drawn*. Passage lane and safe lane or gap emit
     * `[start, end]` as one of their own sub-lines (`passageLineGraphic`), and ferry
     * crossing is a plain line with an end mark. A second, hashed line on top of a solid
     * one is not an affordance.
     */
    it.each([
        TacticalGraphicName.PassageLane,
        TacticalGraphicName.SafeLaneOrGap,
        TacticalGraphicName.FerryCrossing,
    ])('%s does not, because its run is part of the symbol', name => {
        expect(drawsAnchorConnector(name)).toBe(false);
    });

    /**
     * Every listed name is a registered graphic, so a rename cannot leave a dead entry
     * quietly switching the mark off for a symbol that still needs it. `Record`-typed
     * registries fail to compile on a rename; a `Set` does not.
     */
    it('names only registered graphics', () => {
        const registered: string[] = listTacticalGraphicNames();
        const listed = registered.filter(name => drawsAnchorConnector(name as TacticalGraphicName));
        expect(listed).toHaveLength(27);
    });
});

describe('the run the mark follows', () => {
    const base = [[0, 0], [1, 0], [0.5, 1]];

    it.each(SIDE_POINT)('%s stops at point 2, leaving the width point out', name => {
        expect(anchorConnectorRun(name, base)).toEqual([[0, 0], [1, 0]]);
    });

    it.each([...CROSSINGS, ...CONVOYS, ...REFERENCE])('%s follows the whole base', name => {
        expect(anchorConnectorRun(name, base)).toEqual(base);
    });

    /** A two-point base has no third point to drop, whichever family it belongs to. */
    it.each(SIDE_POINT)('%s leaves a two-point base alone', name => {
        expect(anchorConnectorRun(name, [[0, 0], [1, 0]])).toEqual([[0, 0], [1, 0]]);
    });
});

// ── 2. OpenLayers: the base feature un-hides and draws the trimmed run ────────

/** A manager on a stub map. @see editMode.test.ts, which uses the same one. */
function stubbedManager(): TacticalGraphicsManager {
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
    return new TacticalGraphicsManager(map as never);
}

function build(manager: TacticalGraphicsManager, name: TacticalGraphicName, symbolId: string): TacticalGraphicHandler {
    const handler = getController(name, RES);
    handler.setSymbolId(symbolId);
    handler.getFeatures().forEach(feature => {
        feature.set('graphicName', name);
        feature.set('symbolId', symbolId);
    });
    const base = handler.graphic.base as Feature;
    base.setGeometry(new LineString([[0, 0], [40_000, 0], [20_000, 25_000]]));
    handler.setBaseFeature(base as never);
    manager.renderingVectorSource.addFeatures(handler.getFeatures());
    manager.graphicControllers.push(handler);
    return handler;
}

const baseOf = (handler: TacticalGraphicHandler): Feature => handler.graphic.base as Feature;

describe('OpenLayers un-hides the construction line on the selected graphic', () => {
    /**
     * The defect itself. Every one of these is capped at the number of points its plate
     * gives it, which clears the `base` boolean — and visibility used to be read off that
     * same boolean, so the mark went with the `Modify` interaction it has nothing to do
     * with.
     */
    it.each([...CROSSINGS, ...CONVOYS, ...EXPLOSIVES])('%s shows its base once selected', name => {
        const manager = stubbedManager();
        const handler = build(manager, name, 'a');

        expect(baseOf(handler).get('hidden')).toBe(true);
        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(handler);

        expect(baseOf(handler).get('hidden')).toBe(false);
        // Still out of `Modify`'s reach: how many vertices a graphic has is a different
        // question from whether the operator can see where they went.
        expect(baseOf(handler).get('base')).toBe(false);
    });

    it('leaves an unselected graphic\'s base hidden', () => {
        const manager = stubbedManager();
        const selected = build(manager, TacticalGraphicName.Bridge, 'a');
        const other = build(manager, TacticalGraphicName.Bridge, 'b');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(selected);

        expect(baseOf(selected).get('hidden')).toBe(false);
        expect(baseOf(other).get('hidden')).toBe(true);
    });

    it('hides it again on the way out of edit mode', () => {
        const manager = stubbedManager();
        const handler = build(manager, TacticalGraphicName.MovingConvoy, 'a');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(handler);
        expect(baseOf(handler).get('hidden')).toBe(false);

        manager.setInteractionMode(InteractionType.view);
        expect(baseOf(handler).get('hidden')).toBe(true);
    });

    /** The families that had the mark all along keep it. */
    it.each(REFERENCE)('%s still shows its base', name => {
        const manager = stubbedManager();
        const handler = build(manager, name, 'a');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(handler);

        expect(baseOf(handler).get('hidden')).toBe(false);
    });
});

describe('the OpenLayers style of the construction line', () => {
    // `configureTacticalGraphics` merges, so an override survives an empty call — the
    // reset is the only thing that drops one, and a leaked color reaches the whole file.
    afterEach(() => resetTacticalGraphicsConfig());

    /** Resolves the base feature's style for a graphic with the given stored base. */
    function styleOf(name: TacticalGraphicName, coordinates: number[][], hostility?: TacticalGraphicHostility) {
        const feature = createBaseFeature();
        feature.setGeometry(new LineString(coordinates));
        feature.set('graphicName', name);
        feature.set('hidden', false);
        if (hostility) feature.set('hostility', hostility);
        const style = (feature.getStyle() as (f: Feature, r: number) => never)(feature, RES) as unknown as {
            getStroke: () => {getColor: () => string; getLineDash: () => number[] | null};
            getGeometry: () => LineString | undefined;
        };
        return style;
    }

    it('draws in the inert-handle color, not the affiliation color', () => {
        const style = styleOf(TacticalGraphicName.Bridge, [[0, 0], [1, 0]]);
        expect(style.getStroke().getColor()).toBe(DEFAULT_PALETTE.inertHandleColor);
    });

    /**
     * The trap. A hostile control measure's *line work* is red; this is not line work, and
     * a red construction line laid along a red casing is indistinguishable from it.
     */
    it('stays inert on a hostile graphic', () => {
        const style = styleOf(TacticalGraphicName.Bridge, [[0, 0], [1, 0]], TacticalGraphicHostility.hostileFaker);
        expect(style.getStroke().getColor()).toBe(DEFAULT_PALETTE.inertHandleColor);
    });

    it('follows the host\'s inert color when one is configured', () => {
        configureTacticalGraphics({inertHandleColor: '#404040'});
        expect(styleOf(TacticalGraphicName.Bridge, [[0, 0], [1, 0]]).getStroke().getColor()).toBe('#404040');
    });

    it('is hashed', () => {
        expect(styleOf(TacticalGraphicName.Bridge, [[0, 0], [1, 0]]).getStroke().getLineDash()).toEqual([4, 4]);
    });

    it('stops at point 2 for the demolition family', () => {
        const style = styleOf(TacticalGraphicName.ExplosivesStateOfReadiness1Safe, [[0, 0], [1, 0], [0.5, 1]]);
        expect(style.getGeometry()?.getCoordinates()).toEqual([[0, 0], [1, 0]]);
    });

    /**
     * Everything else draws its own geometry, so no override is set at all — `null` rather
     * than `undefined`, which is what OpenLayers' `Style.getGeometry` returns when none
     * was given.
     */
    it('leaves the geometry alone for a graphic whose whole base is the run', () => {
        expect(styleOf(TacticalGraphicName.Bridge, [[0, 0], [1, 0], [2, 1]]).getGeometry()).toBeNull();
    });
});

// ── 3. MapLibre builds the same mark from the same statement ─────────────────

describe('MapLibre draws the same construction line', () => {
    const graphic = (name: TacticalGraphicName, coordinates: number[][]): MapLibreTacticalGraphic => ({
        id: name,
        name,
        base: {type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates}},
        properties: {name},
        handles: [],
    } as unknown as MapLibreTacticalGraphic);

    it.each([...CROSSINGS, ...CONVOYS, ...EXPLOSIVES, ...REFERENCE])('%s puts a line in the source', name => {
        const [feature] = connectorFeatures([graphic(name, [[0, 0], [1, 0]])]);
        expect(feature.geometry).toEqual({type: 'LineString', coordinates: [[0, 0], [1, 0]]});
        expect(feature.properties?.color).toBe(DEFAULT_PALETTE.inertHandleColor);
    });

    it.each([TacticalGraphicName.PhaseLine, TacticalGraphicName.PassageLane])('%s puts nothing there', name => {
        expect(connectorFeatures([graphic(name, [[0, 0], [1, 0]])])).toEqual([]);
    });

    it('stops at point 2 for the demolition family, exactly as OpenLayers does', () => {
        const [feature] = connectorFeatures([
            graphic(TacticalGraphicName.ExplosivesStateOfReadiness1Safe, [[0, 0], [1, 0], [0.5, 1]]),
        ]);
        expect(feature.geometry).toEqual({type: 'LineString', coordinates: [[0, 0], [1, 0]]});
    });

    it('skips a graphic whose base is a point', () => {
        const point = {
            id: 'x',
            name: TacticalGraphicName.Bridge,
            base: {type: 'Feature', properties: {}, geometry: {type: 'Point', coordinates: [0, 0]}},
        } as unknown as MapLibreTacticalGraphic;
        expect(connectorFeatures([point])).toEqual([]);
    });
});
