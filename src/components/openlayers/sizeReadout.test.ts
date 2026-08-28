/**
 * # Every circle graphic reports the size it is being dragged to
 *
 * `RADIUS_GRAPHICS` used to answer two different questions at once: whether the
 * properties dialog offers a radius field, and whether the hashed read-out is drawn
 * while the graphic is sized. Those are not the same question — a read-out is feedback
 * on a gesture, an amplifier is what the symbol carries — and seven circle graphics
 * legitimately have the second without the first. They resized blind.
 *
 * This suite is the guard that keeps the broader list honest: it enumerates the circle
 * family from the controller registry rather than from a hand-written list, so a circle
 * graphic added tomorrow without a read-out fails here instead of shipping silent.
 */

import {
    RADIUS_GRAPHICS,
    TacticalGraphicName,
    dropSizePx,
    hasRadiusReadout,
    listTacticalGraphicNames,
    showsSizeReadout,
} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {MissionTaskController} from './controllers/MissionTaskController';
import {PolygonGraphicController} from './controllers/PolygonGraphicController';

/**
 * The circle family, by behaviour rather than by name: everything the registry routes
 * to a `MissionTaskController` and draws around a centre.
 *
 * `PointDropController` extends `MissionTaskController`, and its members are badges
 * dropped at a fixed pixel size — a crossed task, an airfield, a completed roadblock —
 * so they are excluded the same way the security operations are.
 */
const circleNames = listTacticalGraphicNames()
    .filter((name): name is TacticalGraphicName => name in TacticalGraphicName)
    .filter(name => {
    let controller;
    try {
        controller = getController(name, 100);
    } catch {
        return false;
    }
    if (controller instanceof PolygonGraphicController) return false;
    return controller instanceof MissionTaskController && controller.geomHandleType === 'Circle';
});

/**
 * The graphics inside that family that are deliberately not circles.
 *
 * - **Movement to contact** — doctrine rather than an omission: FM 1-02.2 table 5-10
 *   draws it with no amplifier of any kind. It is a badge, not an area, and a distance
 *   is not one of the things the symbol says.
 * - **The arc tasks** — a turn, a pursuit, an envelopment and an ambush are sized by a
 *   `reach` or `bend` handle that sets a chord and a bearing together, not by a radius
 *   about a centre. There is no circle for a read-out to be reporting the radius of, so
 *   they are out of scope here as they always were.
 *
 * The one-click badges are excluded by `dropSizePx`, which is the portable statement
 * that a graphic is dropped whole at a screen size rather than sized to ground.
 */
const NOT_A_CIRCLE = new Set<TacticalGraphicName>([
    TacticalGraphicName.MovementToContact,
    TacticalGraphicName.Turn,
    TacticalGraphicName.TacticalTurn,
    TacticalGraphicName.Pursuit,
    TacticalGraphicName.Envelopment,
    TacticalGraphicName.Ambush,
]);

/** Circle graphics proper: the family, minus the badges and the arc tasks. */
const sizedCircles = circleNames.filter(
    name => dropSizePx(name) === undefined && !NOT_A_CIRCLE.has(name),
);

describe('the size read-out covers the circle family', () => {
    it('finds a circle family to check', () => {
        expect(sizedCircles.length).toBeGreaterThan(20);
    });

    it.each(sizedCircles)('%s draws a read-out while being sized', name => {
        expect({name, shows: showsSizeReadout(name)}).toEqual({name, shows: true});
    });

    it('still refuses the one graphic doctrine refuses', () => {
        expect(showsSizeReadout(TacticalGraphicName.MovementToContact)).toBe(false);
        expect(hasRadiusReadout(TacticalGraphicName.MovementToContact)).toBe(false);
    });

    /**
     * A one-click badge is dropped whole at a screen size — there is no radius the
     * operator is choosing, so a read-out would be reporting a number nobody set.
     */
    it.each(circleNames.filter(name => dropSizePx(name) !== undefined))(
        '%s is a badge and shows none',
        name => {
            expect({name, shows: showsSizeReadout(name)}).toEqual({name, shows: false});
        },
    );
});

describe('the read-out and the dialog field are separate questions', () => {
    /**
     * The seven that prompted the split. Each is drawn as a circle and sized by
     * dragging, and none carries a radius amplifier — so the read-out is on and the
     * dialog field is off.
     */
    it.each([
        TacticalGraphicName.CordonAndKnock,
        TacticalGraphicName.Deny,
        TacticalGraphicName.Locate,
        TacticalGraphicName.PsyOpsZoneCircular,
        TacticalGraphicName.TargetBuildUpAreaCircular,
        TacticalGraphicName.TargetValueAreaCircular,
        TacticalGraphicName.ZoneOfResponsibilityCircular,
    ])('%s shows a read-out but offers no radius field', name => {
        expect({name, readout: showsSizeReadout(name), field: hasRadiusReadout(name)})
            .toEqual({name, readout: true, field: false});
    });

    /** The dialog's list is unchanged: every member still both reports and offers one. */
    it('leaves the dialog field list alone', () => {
        for (const name of Array.from(RADIUS_GRAPHICS)) {
            expect({name, readout: showsSizeReadout(name)}).toEqual({name, readout: true});
        }
    });
});
