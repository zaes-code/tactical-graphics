/**
 * # A floor that belongs to the draw, and to nothing else
 *
 * Turn, its table 5-19 twin and Envelopment collapse into an unreadable kink when they
 * are barely dragged, so the gesture that creates one holds it to a legible size. That
 * affordance lived inside `MissionTaskGraphicBase.updateGeom` — the door **every** gesture
 * comes through — so it also fired on graphics drawn long ago.
 *
 * The bite is a restore at a different zoom. The holder is rebuilt with the *current*
 * resolution as its drawing zoom, so its floor is worth four times the metres it was drawn
 * with; the first gesture that touched it then inflated the symbol. Measured through the
 * app, zoomed out two levels: a turn restored at 12 px was panned and came back **50**, and
 * one restored at 30 px came back 50 as well. The user moved it and it changed size.
 *
 * `compare:engines` had been reporting this for weeks as `radius 300000 vs 129256` — that
 * 300000 is this floor's 50 px times the harness's 6000 m/px.
 */

import {TacticalGraphicName, minimumDrawnRadiusPx} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

/** A zoom, in metres per pixel, so the floor is a round 50 * this. */
const RES = 1_000;

const holderFor = (name: TacticalGraphicName) => {
    const controller = getController(name, RES) as unknown as {
        graphic: {size: number; sizingFromDraw?: boolean; updateGeom(input: {size?: number; center?: number[]}): void};
    };
    // A centre, because `updateGeom` needs somewhere to put the graphic.
    controller.graphic.updateGeom({size: 200 * RES, center: [0, 0]});
    return controller.graphic;
};

describe('the graphics that carry a legibility floor', () => {
    it('is the three curves, at 50 px', () => {
        expect(minimumDrawnRadiusPx(TacticalGraphicName.Turn)).toBe(50);
        expect(minimumDrawnRadiusPx(TacticalGraphicName.TacticalTurn)).toBe(50);
        expect(minimumDrawnRadiusPx(TacticalGraphicName.Envelopment)).toBe(50);
    });

    /**
     * The circles and the crossed tasks left the list, each because the floor was stopping
     * a resize the user was entitled to make. @see minimumDrawnRadiusPx
     */
    it.each([
        TacticalGraphicName.Destroy,
        TacticalGraphicName.Contain,
        TacticalGraphicName.Secure,
        TacticalGraphicName.AreaDefense,
        TacticalGraphicName.PhaseLine,
    ])('is nothing at all for %s', name => {
        expect(minimumDrawnRadiusPx(name)).toBeUndefined();
    });
});

describe('when the floor applies', () => {
    it('holds a barely-dragged turn legible while it is being drawn', () => {
        const holder = holderFor(TacticalGraphicName.Turn);
        holder.sizingFromDraw = true;
        holder.updateGeom({size: 5 * RES});

        expect(Math.round(holder.size / RES)).toBe(50);
    });

    /**
     * **And leaves an existing graphic alone.** This is the whole defect: a symbol the
     * user already drew must not change size because they moved it.
     */
    it('does not resize a graphic that is merely being edited', () => {
        const holder = holderFor(TacticalGraphicName.Turn);
        holder.sizingFromDraw = false;
        holder.updateGeom({size: 5 * RES});

        expect(Math.round(holder.size / RES)).toBe(5);
    });

    it('never touches a graphic that carries no floor', () => {
        const holder = holderFor(TacticalGraphicName.Secure);
        holder.sizingFromDraw = true;
        holder.updateGeom({size: 5 * RES});

        expect(Math.round(holder.size / RES)).toBe(5);
    });
});

/**
 * # Which gesture the floor is armed for
 *
 * The floor is a *draw* affordance, and the two draws arm it differently because they are
 * shaped differently. A circle draw sizes the symbol once, on release. A click-placed draw
 * rebuilds the symbol on every pointer move — so arming the floor there pins `size` at the
 * floor while the cursor keeps going, and the symbol sits still until the drag outgrows it
 * and then lurches into tracking.
 *
 * Measured through the app on a turn: `size` held at 478 km across the first 120 px of drag
 * while the cursor slid from 0.70 to 1.14 of the symbol's own bounding box, then locked. On
 * MapLibre, which applies no floor on this path, the cursor sat at a constant 1.00 of the
 * box from the first pixel. "The cursor seems to be in the middle of the graphic making it
 * seem jumpy and not smooth." (User's report, 2026-09-05.)
 */
describe('which draw arms the floor', () => {
    /** Enough of a `DrawEvent` for `onDrawStartFunc`, which only reads `feature`. */
    const drawStart = () => ({feature: undefined}) as never;

    it('leaves a click-placed draw unfloored, so the preview follows the cursor', () => {
        const controller = getController(TacticalGraphicName.Turn, RES) as unknown as {
            graphic: {sizingFromDraw?: boolean};
            onDrawStartFunc(e: never): void;
        };
        controller.onDrawStartFunc(drawStart());
        expect(controller.graphic.sizingFromDraw).toBeFalsy();
    });

    /**
     * **The circle draw still arms it**, which is why this is stated as a difference between
     * the two draws rather than as the floor being switched off. A drop-and-drag sizes the
     * symbol once, so flooring it cannot fight a cursor.
     */
    it('still arms it for a centre-to-edge draw, which sizes once', () => {
        const controller = getController(TacticalGraphicName.Secure, RES) as unknown as {
            graphic: {sizingFromDraw?: boolean};
            onDrawStartFunc(e: never): void;
        };
        // A circle draw subscribes to its sketch geometry, so the stub carries `on` too.
        const geometry = {getCenter: () => [0, 0], getRadius: () => 1, on: () => undefined};
        controller.onDrawStartFunc({feature: {getGeometry: () => geometry}} as never);
        expect(controller.graphic.sizingFromDraw).toBe(true);
    });
});
