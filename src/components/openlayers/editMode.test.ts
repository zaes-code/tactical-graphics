/**
 * # Edit mode: one selection, its own handles, and only the gestures it accepts
 *
 * `edit` replaces four global gesture modes with one selection-scoped one. Three things
 * about it are stated in more than one place and so have to be checked:
 *
 * 1. **Handle visibility now has two rules.** The four legacy modes light up every
 *    graphic; `edit` lights up the selected one alone. Both engines implement this
 *    separately — `TacticalGraphicsManager.toggleHandleFeatures` and
 *    `NativeLayerRenderer.handleBearers` — and the same button drives both.
 * 2. **A gesture an affordance starts must be refused exactly where a mode's drag is.**
 *    `beginGesture` is a second door into the same gestures, and a door that skipped
 *    `allowedGestures` would let a host rotate a symbol the map refuses to rotate. That
 *    is the defect `gestureParity.test.ts` was written for, one level up.
 * 3. **The selection must not outlive what it points at.** Chrome drawn around a graphic
 *    that has been cleared is chrome around empty space.
 *
 * The manager is built against a stub map rather than a real OpenLayers one: everything
 * under test is bookkeeping over `renderingVectorSource`, and the four map methods the
 * constructor and these paths touch are stubbed to match.
 */

import {Feature} from 'ol';
import {Modify} from 'ol/interaction';
import LineString from 'ol/geom/LineString';
import {
    HANDLE_EDIT_MODES,
    TacticalGraphicName,
    allowedGestures,
    listTacticalGraphicNames,
} from '@zaes/tactical-graphics';
import {InteractionType, TacticalGraphicsManager} from './TacticalGraphicsManager';
import {getController} from './controllerRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';

/** The resolution the controllers are built at, in meters per pixel. */
const RES = 100;

/**
 * A manager on a stub map.
 *
 * The constructor adds an interaction, a layer and two listeners; none of those matter
 * here, and a real `ol/Map` in jsdom brings a renderer that never paints. The pixel
 * conversions are the identity divided by `RES`, so a projected extent and a screen box
 * are the same numbers scaled — which is enough to assert the box tracks the graphic.
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

/** Whether OpenLayers' own `Modify` is installed right now. */
function hasModify(manager: TacticalGraphicsManager & {interactions: unknown[]}): boolean {
    return manager.interactions.some(i => i instanceof Modify);
}

/** Builds a graphic, registers it, and puts its features in the source. */
function build(manager: TacticalGraphicsManager, name: TacticalGraphicName, symbolId: string): TacticalGraphicHandler {
    const handler = getController(name, RES);
    handler.setSymbolId(symbolId);
    handler.getFeatures().forEach(feature => {
        feature.set('graphicName', name);
        feature.set('symbolId', symbolId);
    });
    manager.renderingVectorSource.addFeatures(handler.getFeatures());
    manager.graphicControllers.push(handler);
    return handler;
}

/**
 * Gives a line-based holder a real base to work from.
 *
 * `getController` builds the holder but not its geometry, and every resize is a ratio
 * about a centre — with an empty base there is nothing to scale and the assertions below
 * would pass or fail for the wrong reason.
 */
function seedLine(handler: TacticalGraphicHandler): void {
    const base = handler.graphic.base as Feature;
    base.setGeometry(new LineString([[0, 0], [40_000, 0], [70_000, 25_000]]));
    handler.setBaseFeature(base as never);
}

/** Every handle feature the source is currently showing. */
function visibleHandles(manager: TacticalGraphicsManager): Feature[] {
    return manager.renderingVectorSource
        .getFeatures()
        .filter(feature => feature.get('handle') && !feature.get('hidden'));
}

describe('edit mode scopes handles to the selection', () => {
    it('shows the selected graphic\'s handles and no others', () => {
        const manager = stubbedManager();
        const a = build(manager, TacticalGraphicName.PhaseLine, 'a');
        build(manager, TacticalGraphicName.PhaseLine, 'b');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(a);

        const shown = visibleHandles(manager);
        expect(shown.length).toBeGreaterThan(0);
        expect(shown.every(feature => a.getFeatures().includes(feature))).toBe(true);
        expect(shown.every(feature => feature.get('symbolId') === 'a')).toBe(true);
    });

    it('shows no handles at all while nothing is selected', () => {
        const manager = stubbedManager();
        build(manager, TacticalGraphicName.PhaseLine, 'a');

        manager.setInteractionMode(InteractionType.edit);

        expect(visibleHandles(manager)).toHaveLength(0);
    });

    /**
     * The regression guard for the rule that was already there. Both engines light up
     * every graphic in the four legacy modes, deliberately, and scoping *those* to a
     * selection is what made the two engines answer the same button differently once
     * before. @see NativeLayerRenderer.handleBearers
     */
    it('still shows every graphic\'s handles in the legacy gesture modes', () => {
        const manager = stubbedManager();
        build(manager, TacticalGraphicName.PhaseLine, 'a');
        build(manager, TacticalGraphicName.PhaseLine, 'b');

        for (const mode of [InteractionType.rotate, InteractionType.resize, InteractionType.translate, InteractionType.modify]) {
            manager.setInteractionMode(mode);
            const ids = new Set(visibleHandles(manager).map(feature => feature.get('symbolId')));
            expect(ids).toEqual(new Set(['a', 'b']));
        }
    });

    it('hides every handle in view mode', () => {
        const manager = stubbedManager();
        build(manager, TacticalGraphicName.PhaseLine, 'a');

        manager.setInteractionMode(InteractionType.view);

        expect(visibleHandles(manager)).toHaveLength(0);
    });
});

describe('the selection', () => {
    it('is dropped when the mode leaves edit', () => {
        const manager = stubbedManager();
        const a = build(manager, TacticalGraphicName.PhaseLine, 'a');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(a);
        expect(manager.getSelection()).toBe(a);

        manager.setInteractionMode(InteractionType.view);
        expect(manager.getSelection()).toBeUndefined();
    });

    it('announces a change once, and not on a re-select of the same graphic', () => {
        const manager = stubbedManager();
        const a = build(manager, TacticalGraphicName.PhaseLine, 'a');
        const seen: (string | undefined)[] = [];
        manager.onSelectionChange = controller => seen.push(controller?.getSymbolId());

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(a);
        manager.setSelection(a);
        manager.setSelection(undefined);

        expect(seen).toEqual(['a', undefined]);
    });

    it('has no box when nothing is selected', () => {
        const manager = stubbedManager();
        build(manager, TacticalGraphicName.PhaseLine, 'a');
        manager.setInteractionMode(InteractionType.edit);

        expect(manager.selectionBox()).toBeUndefined();
    });
});

/**
 * # Reshaping is OpenLayers' `Modify`, so edit mode has to install it
 *
 * `handleDownEvent` deliberately declines a reshape drag unless the controller opted into
 * `editStretches` or a mirror handle was grabbed, and leaves everything else to `Modify`.
 * A mode that shows handles without installing one therefore shows handles that do
 * nothing — and loses the blue "a drag here adds a vertex" marker, which is `Modify`'s
 * own default style rather than anything this repo draws.
 *
 * That is exactly what `edit` shipped as, and both symptoms arrived together.
 */
describe('edit mode installs the Modify interaction', () => {
    it('installs it once a graphic is selected', () => {
        const manager = stubbedManager();
        const a = build(manager, TacticalGraphicName.PhaseLine, 'a');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(a);

        expect(hasModify(manager)).toBe(true);
    });

    it('leaves it off while nothing is selected', () => {
        const manager = stubbedManager();
        build(manager, TacticalGraphicName.PhaseLine, 'a');

        manager.setInteractionMode(InteractionType.edit);

        expect(hasModify(manager)).toBe(false);
    });

    /**
     * Scoped to the selection, because the handles are. A `Modify` over every base would
     * let the user drag a vertex of a graphic wearing no handles at all.
     */
    it('offers only the selected graphic to it', () => {
        const manager = stubbedManager();
        const a = build(manager, TacticalGraphicName.PhaseLine, 'a');
        const b = build(manager, TacticalGraphicName.PhaseLine, 'b');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(a);

        // `addModifyInteraction` un-hides exactly the bases it hands to `Modify`.
        const unhidden = manager.renderingVectorSource
            .getFeatures()
            .filter(feature => feature.get('base') && !feature.get('hidden'));
        expect(unhidden.length).toBeGreaterThan(0);
        expect(unhidden.every(feature => a.getFeatures().includes(feature))).toBe(true);
        expect(unhidden.some(feature => b.getFeatures().includes(feature))).toBe(false);
    });

    it('rebuilds it when the selection moves to another graphic', () => {
        const manager = stubbedManager();
        const a = build(manager, TacticalGraphicName.PhaseLine, 'a');
        const b = build(manager, TacticalGraphicName.PhaseLine, 'b');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(a);
        manager.setSelection(b);

        expect(hasModify(manager)).toBe(true);
        const unhidden = manager.renderingVectorSource
            .getFeatures()
            .filter(feature => feature.get('base') && !feature.get('hidden'));
        expect(unhidden.every(feature => b.getFeatures().includes(feature))).toBe(true);
    });

    /** Never more than one: two stacked interactions is a documented past defect. */
    it('never stacks two', () => {
        const manager = stubbedManager();
        const a = build(manager, TacticalGraphicName.PhaseLine, 'a');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(a);
        manager.setInteractionMode(InteractionType.modify);
        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(a);

        expect(manager.interactions.filter(i => i instanceof Modify)).toHaveLength(1);
    });

    it('takes it off again on the way back to view', () => {
        const manager = stubbedManager();
        const a = build(manager, TacticalGraphicName.PhaseLine, 'a');

        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(a);
        manager.setInteractionMode(InteractionType.view);

        expect(hasModify(manager)).toBe(false);
    });

    /** The legacy mode is global and stays that way — every base, selection or not. */
    it('still hands modify mode every graphic', () => {
        const manager = stubbedManager();
        const a = build(manager, TacticalGraphicName.PhaseLine, 'a');
        const b = build(manager, TacticalGraphicName.PhaseLine, 'b');

        manager.setInteractionMode(InteractionType.modify);

        const unhidden = manager.renderingVectorSource
            .getFeatures()
            .filter(feature => feature.get('base') && !feature.get('hidden'));
        expect(unhidden.some(feature => a.getFeatures().includes(feature))).toBe(true);
        expect(unhidden.some(feature => b.getFeatures().includes(feature))).toBe(true);
    });
});

describe('beginGesture', () => {
    /** A `pointerdown` as far as the manager reads one. */
    const pointerAt = (clientX: number, clientY: number) => ({clientX, clientY}) as PointerEvent;

    it('refuses when nothing is selected', () => {
        const manager = stubbedManager();
        build(manager, TacticalGraphicName.PhaseLine, 'a');
        manager.setInteractionMode(InteractionType.edit);

        expect(manager.beginGesture('rotate', pointerAt(10, 10))).toBe(false);
    });

    /**
     * The parity assertion, and the reason this file exists.
     *
     * `beginGesture` is a second way into the same gestures, so it has to refuse exactly
     * what a drag refuses. Checked against `allowedGestures` itself rather than a list,
     * because the list is the thing that drifts: a symbol added to `ROTATE_ONLY_SYMBOLS`
     * tomorrow is covered here without anyone remembering to come back.
     */
    it.each([
        // Rotates but does not resize: a screen marks a force, not an extent of ground.
        TacticalGraphicName.Screen,
        // Resizes but does not rotate: one doctrinal orientation.
        TacticalGraphicName.Destroy,
        TacticalGraphicName.Airfield,
        // Accepts everything.
        TacticalGraphicName.PhaseLine,
    ])('offers exactly what allowedGestures says, for %s', name => {
        const manager = stubbedManager();
        const handler = build(manager, name, 'a');
        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(handler);

        const allowed = allowedGestures(name);
        for (const kind of ['translate', 'rotate', 'resize'] as const) {
            const started = manager.beginGesture(kind, pointerAt(10, 10));
            expect(started).toBe(allowed[kind]);
            // Each accepted gesture latches until release; drop it so the next one is
            // measured from the same standing start rather than being refused as a
            // gesture-already-running.
            if (started) window.dispatchEvent(new Event('pointerup'));
        }
    });

    it('refuses a second gesture while one is running', () => {
        const manager = stubbedManager();
        const handler = build(manager, TacticalGraphicName.PhaseLine, 'a');
        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(handler);

        expect(manager.beginGesture('rotate', pointerAt(10, 10))).toBe(true);
        expect(manager.beginGesture('resize', pointerAt(20, 20))).toBe(false);
        window.dispatchEvent(new Event('pointerup'));
        expect(manager.beginGesture('resize', pointerAt(20, 20))).toBe(true);
        window.dispatchEvent(new Event('pointerup'));
    });

    /**
     * The gesture must reach the controller, not merely be accepted.
     *
     * A `beginGesture` that returned true and then dropped every move would look exactly
     * like a working affordance — which is the "a refusal is invisible" failure mode in
     * its other form. So the drag is driven and the graphic is asked whether it turned.
     */
    it('turns the graphic when the pointer moves', () => {
        const manager = stubbedManager();
        const handler = build(manager, TacticalGraphicName.PsyOpsZoneCircular, 'a');
        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(handler);

        const rotationBefore = (handler.graphic as {rotation?: number}).rotation ?? 0;
        expect(manager.beginGesture('rotate', pointerAt(100, 0))).toBe(true);

        const move = new Event('pointermove') as PointerEvent & {clientX: number; clientY: number};
        Object.assign(move, {clientX: 0, clientY: 100});
        window.dispatchEvent(move);
        window.dispatchEvent(new Event('pointerup'));

        expect((handler.graphic as {rotation?: number}).rotation).not.toBe(rotationBefore);
    });
});

/**
 * # The gestures an affordance drives, and the handles it must not disturb
 *
 * Each of these pins a defect that shipped in the first cut of edit mode. They are all
 * the same shape: a rule written for a *handle* drag, applied to a gesture that grabbed
 * no handle — or a rule written for one mode, not extended to the new one.
 */
describe('an affordance gesture means the whole graphic', () => {
    const pointerAt = (clientX: number, clientY: number) => ({clientX, clientY}) as PointerEvent;

    const dragBy = (dx: number, dy: number) => {
        const move = new Event('pointermove') as PointerEvent & {clientX: number; clientY: number};
        Object.assign(move, {clientX: 200 + dx, clientY: 200 + dy});
        window.dispatchEvent(move);
        window.dispatchEvent(new Event('pointerup'));
    };

    /**
     * **The one that killed icon-resize on every LineString graphic.** The resize branch
     * of `handleLineStringDrag` opened `if (!this.activeFeature) return;` — a guard for
     * "which handle was grabbed?" — and an affordance grabs none, so fields of fire, the
     * retrogrades, the bridges, disrupt and block all had a dead resize button.
     */
    it.each([
        TacticalGraphicName.FieldsOfFire,
        TacticalGraphicName.Withdraw,
        TacticalGraphicName.Retirement,
        TacticalGraphicName.MobileDefense,
        TacticalGraphicName.ReliefInPlace,
        TacticalGraphicName.Disrupt,
        TacticalGraphicName.Block,
        TacticalGraphicName.Bridge,
        TacticalGraphicName.AirCorridor,
    ])('resizes %s from an affordance', name => {
        const manager = stubbedManager();
        const handler = build(manager, name, 'a');
        seedLine(handler);
        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(handler);

        const before = JSON.stringify(handler.getBaseGeometry());
        expect(manager.beginGesture('resize', pointerAt(200, 200))).toBe(true);
        dragBy(120, 90);

        expect(JSON.stringify(handler.getBaseGeometry())).not.toBe(before);
    });
});

/**
 * A width handle sets a width whatever the mode — the rule already stated for the mirror
 * handle. Without it a corridor's width was unreachable in `edit`, because its controller
 * never opts into `editStretches` and the grab was simply not claimed.
 */
describe('the width handle is claimed in edit mode', () => {
    it.each([TacticalGraphicName.AirCorridor, TacticalGraphicName.Bridge])(
        "claims %s's offset handle",
        name => {
            const manager = stubbedManager();
            const handler = build(manager, name, 'a');
            seedLine(handler);
            manager.setInteractionMode(InteractionType.edit);
            manager.setSelection(handler);

            const offset = handler.getFeatures().find(feature => feature.get('offsetHandler'));
            expect(offset).toBeDefined();
            expect(offset!.get('hidden')).toBe(false);
            expect(handler.setOffset).toBeDefined();
        },
    );
});

describe('a rectangular zone wears no dead handle in edit mode', () => {
    it.each([TacticalGraphicName.PsyOpsZoneRectangular, TacticalGraphicName.NoFireAreaRectangular])(
        "hides %s's shape handle",
        name => {
            const manager = stubbedManager();
            const handler = build(manager, name, 'a');
            manager.setInteractionMode(InteractionType.edit);
            manager.setSelection(handler);

            const shown = handler
                .getFeatures()
                .filter(feature => feature.get('handle') && !feature.get('hidden') && !feature.get('measure'));
            expect(shown).toHaveLength(0);
        },
    );

    /** The legacy mode still claims that handle, and that behaviour is published. */
    it('still shows it in the legacy resize mode', () => {
        const manager = stubbedManager();
        const handler = build(manager, TacticalGraphicName.PsyOpsZoneRectangular, 'a');
        manager.setInteractionMode(InteractionType.resize);

        const shown = handler
            .getFeatures()
            .filter(feature => feature.get('handle') && !feature.get('hidden') && !feature.get('measure'));
        expect(shown.length).toBeGreaterThan(0);
    });
});

/**
 * # A width drag is a delta, and a handle index is a contract index
 *
 * Two defects that shipped with the first cut of edit mode, both of the same shape: a
 * number read as absolute when it was only ever meaningful relative to something else.
 */
describe('the width handle', () => {
    it.each([TacticalGraphicName.AirCorridor, TacticalGraphicName.Bridge, TacticalGraphicName.Retirement])(
        'reports its current width, so a drag can apply a change (%s)',
        name => {
            const manager = stubbedManager();
            const handler = build(manager, name, 'a');
            seedLine(handler);
            // Without this the manager has to infer a starting width from wherever the
            // cursor happens to be, which is the absolute reading that made the width
            // snap the instant a handle was grabbed.
            expect(typeof handler.currentOffset?.()).toBe('number');
            expect(handler.currentOffset!()).toBeGreaterThan(0);
        },
    );
});

/**
 * The retrograde family publishes `handleCoords[0]` — the contract's `mirror` handle —
 * as its own offset feature and `slice(1)` as `handles`. Without the declared shift the
 * arrow tip arrives at `handleRole` as index 0 and is answered "mirror", so the manager
 * claims its drag as a flip and the handle does nothing at all.
 */
describe('a handle index is a contract index', () => {
    it.each([
        TacticalGraphicName.Retirement,
        TacticalGraphicName.Withdraw,
        TacticalGraphicName.WithdrawUnderPressure,
        TacticalGraphicName.ForwardPassageOfLines,
        TacticalGraphicName.RearwardPassageOfLines,
        TacticalGraphicName.ReliefInPlace,
    ])('%s declares the shift its holder applied', name => {
        const manager = stubbedManager();
        const handler = build(manager, name, 'a');
        expect(handler.handleIndexOffset).toBe(1);
    });

    /** A holder that renders the contract list unchanged must not claim a shift. */
    it.each([TacticalGraphicName.AirCorridor, TacticalGraphicName.Bridge, TacticalGraphicName.PhaseLine])(
        '%s declares none',
        name => {
            const manager = stubbedManager();
            expect(build(manager, name, 'a').handleIndexOffset ?? 0).toBe(0);
        },
    );

    /**
     * `ReliefInPlace` came out of `NO_EDIT_STRETCH` when `edit` became the only mode the
     * panel offers: membership meant "an edit drag does nothing", which was reasonable
     * beside a separate resize mode and is not beside no mode at all.
     */
    it('lets relief in place stretch on an edit drag', () => {
        const manager = stubbedManager();
        expect(build(manager, TacticalGraphicName.ReliefInPlace, 'a').editStretches).toBe(true);
    });
});

/**
 * # A draw-time floor must not decide how small a finished graphic may be
 *
 * `Block.MIN_BASE_PX` exists, by its own comment, to keep a *barely-dragged* graphic
 * legible "from the moment the user starts drawing". Left in place during a resize it
 * stops the ratio-locked block family shrinking past 100 px at the zoom they were drawn
 * at — measured, asking for 0.10x got exactly 0.32x on all seven and nothing below.
 *
 * Which seven is not a coincidence: the floor is inside `Block.setBaseFeature`'s
 * `ratioLock !== undefined` branch, so it bites the ratio-locked members and leaves
 * Penetration, Exploitation and Block itself alone. That is precisely the split the user
 * reported.
 */
describe('a deliberate resize lifts the draw-time floor', () => {
    const floored = [
        TacticalGraphicName.Disrupt,
        TacticalGraphicName.Breach,
        TacticalGraphicName.Bypass,
        TacticalGraphicName.AttackByFire,
        TacticalGraphicName.Clear,
        TacticalGraphicName.Canalize,
        TacticalGraphicName.SupportByFire,
        // Not reported, but floored the same way by `LineGraphicBase`'s minimum first
        // segment — 145 px for the fixes.
        TacticalGraphicName.Fix,
    ];

    it.each(floored)('%s can lift and restore its floor', name => {
        const manager = stubbedManager();
        const handler = build(manager, name, 'a');
        expect(typeof handler.suspendSizeFloor).toBe('function');

        const holder = handler.graphic as unknown as {suspendMinimumLength?: boolean};
        expect(holder.suspendMinimumLength).toBe(false);
        handler.suspendSizeFloor!(true);
        expect(holder.suspendMinimumLength).toBe(true);
        handler.suspendSizeFloor!(false);
        expect(holder.suspendMinimumLength).toBe(false);
    });

    /**
     * **The floor goes back on when the gesture ends**, or the next draw loses the
     * protection this whole mechanism is careful to keep.
     */
    it('puts the floor back after an affordance resize', () => {
        const manager = stubbedManager();
        const handler = build(manager, TacticalGraphicName.Breach, 'a');
        seedLine(handler);
        manager.setInteractionMode(InteractionType.edit);
        manager.setSelection(handler);

        const holder = handler.graphic as unknown as {suspendMinimumLength?: boolean};
        expect(manager.beginGesture('resize', {clientX: 200, clientY: 200} as PointerEvent)).toBe(true);
        const move = new Event('pointermove') as PointerEvent & {clientX: number; clientY: number};
        Object.assign(move, {clientX: 260, clientY: 250});
        window.dispatchEvent(move);
        expect(holder.suspendMinimumLength).toBe(true);

        window.dispatchEvent(new Event('pointerup'));
        expect(holder.suspendMinimumLength).toBe(false);
    });

    /**
     * The curves keep theirs. `suspendMinimumSize` is a *readability* floor — a turn
     * collapses into an unreadable kink without it — not a draw-time convenience, so it
     * is deliberately not what `suspendSizeFloor` touches.
     */
    it.each([TacticalGraphicName.Turn, TacticalGraphicName.Envelopment])(
        "leaves %s's readability floor alone",
        name => {
            const manager = stubbedManager();
            const handler = build(manager, name, 'a');
            handler.suspendSizeFloor?.(true);
            const holder = handler.graphic as unknown as {suspendMinimumSize?: boolean};
            expect(holder.suspendMinimumSize).toBe(false);
        },
    );
});

describe('the portable mode list', () => {
    it('counts edit among the modes that wear handles', () => {
        expect(HANDLE_EDIT_MODES).toContain('edit');
    });

    /**
     * `allowedGestures` answers for every registered name, which is what lets the
     * affordances be built from it without a fallback. A name it threw on would put an
     * unhandled error between the user and their selection.
     */
    it('answers for every registered graphic', () => {
        const names = listTacticalGraphicNames().filter(
            (name): name is TacticalGraphicName => name in TacticalGraphicName,
        );
        expect(names.length).toBeGreaterThan(200);
        for (const name of names) {
            const gestures = allowedGestures(name);
            expect(typeof gestures.translate).toBe('boolean');
            expect(typeof gestures.rotate).toBe('boolean');
            expect(typeof gestures.resize).toBe('boolean');
        }
    });
});
