/**
 * # Which gestures a symbol accepts exists twice, so it has to be checked
 *
 * `allowedGestures` in the map-agnostic half says whether a graphic may be turned or
 * scaled, and MapLibre reads nothing else — it has no controllers. OpenLayers states the
 * same fact a second way, by *choosing a controller*: `PointDropController` no-ops the
 * rotate and takes a `resizable` flag, `SecurityOperationsController` no-ops the resize.
 * Two statements of one fact, which is the shape of defect this repository keeps finding.
 *
 * It had already happened. `RoadblockCompleteExecuted` is dropped by
 * `PointDropController`, whose `handleRotate` is an empty method — so OpenLayers refused
 * to turn it and MapLibre, reading a table that said `rotate: true`, turned it happily.
 * The airfield joined it on 2026-08-17 when it stopped being a fixed-size badge.
 *
 * Nothing caught either. A refusal is invisible: the user drags, nothing moves, and there
 * is no error to notice — on the engine where the gesture is *wrongly allowed* it even
 * looks like the feature working. This test is the guard that was missing.
 *
 * **It compares behaviour, not class names.** Asking "is this a `PointDropController`"
 * would pass while the flag it is constructed with says the opposite, and that flag is
 * the whole difference between a crossed task and an airfield.
 */

import {allowedGestures, dropSizePx, listTacticalGraphicNames, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {MissionTaskController} from './controllers/MissionTaskController';

const names = listTacticalGraphicNames().filter(
    (n): n is TacticalGraphicName => n in TacticalGraphicName,
) as TacticalGraphicName[];

/**
 * Whether a controller's gesture reaches the implementation, or is swallowed by an
 * override.
 *
 * A no-op override is exactly a method that does not call through, so the base's own
 * method is spied on and the question is simply whether it ran. `getController` builds a
 * fresh holder each call, so nothing leaks between the two probes.
 */
function reaches(name: TacticalGraphicName, gesture: 'handleRotate' | 'handleResize'): boolean {
    const controller = getController(name, 100) as unknown as Record<string, ((v: number) => void) | undefined>;
    if (typeof controller?.[gesture] !== 'function') return false;

    const base = MissionTaskController.prototype as unknown as Record<string, (v: number) => void>;
    const original = base[gesture];
    if (typeof original !== 'function') return true;

    let called = false;
    base[gesture] = function patched(this: unknown, value: number) {
        called = true;
        // Deliberately not calling through: the holders touch OpenLayers geometry, and
        // the only question here is whether the override let the call past.
        void this;
        void value;
    };
    try {
        controller[gesture]!(1);
    } catch {
        // A holder that throws on a synthetic drag still answers the question — the call
        // got past the override, which is what is being measured.
    } finally {
        base[gesture] = original;
    }
    return called;
}

/** Only the controllers that inherit the gestures can be probed this way. */
const inheriting = names.filter(name => getController(name, 100) instanceof MissionTaskController);

describe('the two statements of a graphic\'s gestures agree', () => {
    it('has controllers to check', () => {
        expect(inheriting.length).toBeGreaterThan(20);
    });

    it.each(inheriting)('%s refuses the same gestures in both halves', name => {
        const allowed = allowedGestures(name);
        expect({
            rotate: reaches(name, 'handleRotate'),
            resize: reaches(name, 'handleResize'),
        }).toEqual({rotate: allowed.rotate, resize: allowed.resize});
    });

    /**
     * The other half of the same problem, and the one that actually reached a user.
     *
     * OpenLayers says "one click drops this" by giving the controller `type: 'Point'`;
     * MapLibre has to be told, and the only thing it can read is `dropSizePx`. While
     * MapLibre inferred it from `allowedGestures(name).resize` instead, the two agreed
     * only by coincidence — and stopped agreeing the moment a one-click graphic became
     * resizable, at which point the airfield took two clicks on one engine and one on the
     * other. The completed roadblock had been wrong the whole time.
     */
    it('drops on one click in OpenLayers exactly when the portable table says it should', () => {
        const oneClick = names.filter(name => (getController(name, 100) as {type?: string})?.type === 'Point');
        const table = names.filter(name => dropSizePx(name) !== undefined);

        expect(table.length).toBeGreaterThan(0);
        expect([...oneClick].sort()).toEqual([...table].sort());
    });

    it('really does refuse something, rather than agreeing that everything is allowed', () => {
        // The assertion above passes trivially if no controller refuses anything, which
        // is close to what the table said before the resize-only pair was added.
        const refusing = inheriting.filter(name => {
            const allowed = allowedGestures(name);
            return !allowed.rotate || !allowed.resize;
        });
        expect(refusing.length).toBeGreaterThan(5);

        // The three kinds of refusal, named so a change to any one of them is deliberate.
        // Destroy is the last fixed-size crossed task: the other three became resizable on
        // 2026-08-17 and are pinned here so that is not undone by accident.
        expect(allowedGestures(TacticalGraphicName.Destroy).resize).toBe(false);
        expect(allowedGestures(TacticalGraphicName.Destroy).rotate).toBe(false);
        expect(allowedGestures(TacticalGraphicName.Cover).rotate).toBe(true);
        expect(allowedGestures(TacticalGraphicName.Cover).resize).toBe(false);
        for (const name of [TacticalGraphicName.Airfield, TacticalGraphicName.Suppress]) {
            expect(allowedGestures(name).resize).toBe(true);
            expect(allowedGestures(name).rotate).toBe(false);
        }
    });
});
