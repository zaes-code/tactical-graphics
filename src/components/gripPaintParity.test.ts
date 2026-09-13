/**
 * # A red grip does something; a gray dot need not
 *
 * The operator's only clue about which dots answer a drag is their colour, so the colour has
 * to be honest and it has to be the same on both engines. Measured with a hit test over every
 * published handle of all 318 graphics, **25 of 679 were drawn differently**, in three groups:
 *
 * - **271204's three anchors.** The library says nothing may drag them, OpenLayers drew them
 *   gray and MapLibre drew them red — then declined the grab, which it had read from the same
 *   table. A dot that promises a drag and refuses it is worse than no dot.
 * - **The five one-anchor mission tasks** — defeat, destroy, interdict, neutralize, suppress.
 *   Their plates give them one point, the centre, which carries neither a scale ratio nor an
 *   angle; they move and scale through the selection box instead. MapLibre drew the dot gray.
 *   OpenLayers promoted it to red, through a branch meant to stop a graphic ending up with
 *   nothing to grab.
 * - **Eighteen two-point lines that only stretch** — the nine bearing lines, the navigational
 *   rhumb line, ferry crossing, mine cluster, trip wire, raft site, fortified position and the
 *   three linear targets. OpenLayers draws no grip on their first anchor, because the far end
 *   carries the gesture and the near end is what it is measured from. That rule lived on an
 *   OpenLayers holder as `hidesStartHandle`, so MapLibre drew a red dot on all eighteen.
 *
 * (User's rule, 2026-09-13: *"All red markers must do something but inert (default gray) ones
 * can exist w/o doing anything."*)
 */
import fs from 'fs';
import path from 'path';
import {
    baseVertexCount,
    handlesAreInert,
    hidesAnchorGrip,
    listTacticalGraphicNames,
    publishesAnchorHandleOnly,
    reshapesByVertex,
    TacticalGraphicName,
} from '@zaes/tactical-graphics';
import {getController} from './openlayers/controllerRegistry';

const RES = 1200;
const NAMES = listTacticalGraphicNames() as TacticalGraphicName[];

type WithHandles = {
    graphic?: {
        handles?: {getGeometry(): {getCoordinates?(): unknown[]} | undefined};
        centerHandle?: {getGeometry(): {getCoordinates?(): unknown[]} | undefined};
    };
};

/** How many points this OpenLayers holder publishes as live and as inert. */
function countsOf(controller: WithHandles): {live: number; gray: number} | undefined {
    const count = (feature?: {getGeometry(): {getCoordinates?(): unknown[]} | undefined}): number => {
        const coordinates = feature?.getGeometry()?.getCoordinates?.();
        return Array.isArray(coordinates) ? coordinates.length : 0;
    };
    if (!controller.graphic?.centerHandle) return undefined;
    return {live: count(controller.graphic.handles), gray: count(controller.graphic.centerHandle)};
}

/** The same, for a graphic this suite has nothing to set up. */
function published(name: TacticalGraphicName): {live: number; gray: number} | undefined {
    try {
        return countsOf(getController(name, RES) as unknown as WithHandles);
    } catch {
        return undefined;
    }
}

describe('the five one-anchor tasks publish a gray dot, not a red one', () => {
    const FIVE = NAMES.filter(publishesAnchorHandleOnly);

    it('is the five the plates name', () => {
        expect(FIVE).toHaveLength(5);
        expect(FIVE).toContain(TacticalGraphicName.Destroy);
        expect(FIVE).toContain(TacticalGraphicName.Defeat);
    });

    it.each(FIVE)('%s draws no live handle', name => {
        const controller = getController(name, RES) as unknown as {
            graphic: {updateGeom(state: {size: number; center: number[]; rotation: number}): void};
        };
        // A dropped symbol, so the holder has something to publish handles for.
        controller.graphic.updateGeom({size: 40_000, center: [0, 0], rotation: 0});
        const counts = countsOf(controller as never)!;
        expect(counts.live).toBe(0);
        expect(counts.gray).toBeGreaterThan(0);
    });
});

describe('a graphic whose handles are all inert draws none of them live', () => {
    it.each(NAMES.filter(handlesAreInert))('%s', name => {
        const counts = published(name);
        if (!counts) return;
        expect(counts.live).toBe(0);
    });

    it('is read by the MapLibre renderer too, not just refused at pointer-down', () => {
        // Source-level, the way `minimumFirstSegmentParity` checks its own rule: the colour
        // is chosen inside a paint pass that needs a live map to exercise.
        const renderer = fs.readFileSync(path.join(__dirname, 'maplibre/native/NativeLayerRenderer.ts'), 'utf8');
        expect(renderer).toContain('handlesAreInert(graphic.name)');
    });
});

describe('the grip on a first anchor is hidden by one rule, read by both engines', () => {
    const HIDDEN = NAMES.filter(hidesAnchorGrip);

    it('names the eighteen two-point lines that only stretch', () => {
        expect(HIDDEN).toHaveLength(18);
        expect(HIDDEN).toContain(TacticalGraphicName.BearingLine);
        expect(HIDDEN).toContain(TacticalGraphicName.FerryCrossing);
        expect(HIDDEN).toContain(TacticalGraphicName.LinearTarget);
        // Two points and a grip that moves one of them keeps both ends.
        expect(HIDDEN).not.toContain(TacticalGraphicName.MovingConvoy);
    });

    it.each(HIDDEN)('%s is two placed points whose grip does not move one', name => {
        expect(baseVertexCount(name)).toBe(2);
        expect(reshapesByVertex(name)).toBe(false);
    });

    it('agrees with what the OpenLayers holder hides', () => {
        for (const name of NAMES) {
            let controller;
            try {
                controller = getController(name, RES) as unknown as {graphic?: {hidesStartHandle?: boolean}};
            } catch {
                continue;
            }
            if (controller.graphic?.hidesStartHandle === undefined) continue;
            expect([name, controller.graphic.hidesStartHandle]).toEqual([name, hidesAnchorGrip(name)]);
        }
    });

    it('is what the MapLibre renderer skips drawing', () => {
        const renderer = fs.readFileSync(path.join(__dirname, 'maplibre/native/NativeLayerRenderer.ts'), 'utf8');
        expect(renderer).toContain('hidesAnchorGrip(graphic.name)');
    });

    it('is skipped by the hit test as well as by the paint', () => {
        /*
         * **Both, or the fix is worse than the defect.** `hitTestHandle` walks the handle
         * array rather than the painted features, so skipping only the paint left an
         * invisible dot still answering the pointer — a grip that does something and shows
         * nothing, which is the inverse of the rule. Driven on the running app before this:
         * a hit test at the hidden grip's pixel returned index 0; after it, -1.
         */
        const renderer = fs.readFileSync(path.join(__dirname, 'maplibre/native/NativeLayerRenderer.ts'), 'utf8');
        const hitTest = renderer.slice(renderer.indexOf('hitTestHandle(point'));
        expect(hitTest.slice(0, hitTest.indexOf('return best;'))).toContain('anchorGripIndex(graphic)');
    });
});
