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
