/**
 * # A curve is committed at the size it was drawn, and nothing rounds it up
 *
 * Turn, its table 5-19 twin and Envelopment used to be held to 50 px on the way in. The
 * floor left the reachable world when those three became click-placed — it sat on the
 * centre-to-edge drag they stopped using — and it was deleted on 2026-09-10 rather than
 * re-armed, because it only ever governed the draw (a resize a moment later could go under
 * it anyway) and because arming it on a click draw pins the preview while the cursor keeps
 * moving. (User's call. @see decorationSizes.ts, "There is no floor".)
 *
 * This suite is what stops it coming back by accident: the sizes below are small enough
 * that any floor at all would show up as a number that is not the one asked for.
 */

import {TacticalGraphicName} from '@zaes/tactical-graphics';
import type {Coordinate} from 'ol/coordinate';
import {getController} from './controllerRegistry';

/** A zoom, in metres per pixel, so a size in pixels is a size in metres times this. */
const RES = 1_000;

/** Five pixels: a tenth of the floor that used to stand here. */
const TINY_PX = 5;

type Holder = {size: number; updateGeom(input: {size?: number; center?: Coordinate}): void};

const holderFor = (name: TacticalGraphicName): Holder => {
    const holder = (getController(name, RES) as unknown as {graphic: Holder}).graphic;
    holder.updateGeom({size: 200 * RES, center: [0, 0] as Coordinate});
    return holder;
};

describe('the three curves that used to carry a floor', () => {
    it.each([TacticalGraphicName.Turn, TacticalGraphicName.TacticalTurn, TacticalGraphicName.Envelopment])(
        '%s keeps a size well under the old 50 px',
        name => {
            const holder = holderFor(name);
            holder.updateGeom({size: TINY_PX * RES});
            expect(Math.round(holder.size / RES)).toBe(TINY_PX);
        },
    );

    /** The graphics that never had one, asserted beside them so the two read the same. */
    it.each([TacticalGraphicName.Secure, TacticalGraphicName.Destroy, TacticalGraphicName.AreaDefense])(
        '%s does too, as it always has',
        name => {
            const holder = holderFor(name);
            holder.updateGeom({size: TINY_PX * RES});
            expect(Math.round(holder.size / RES)).toBe(TINY_PX);
        },
    );
});

/**
 * **No holder carries a switch for a floor that is gone.** `sizingFromDraw` armed it and
 * `suspendMinimumSize` lifted it for a restore; both went with it. A holder that grows one
 * again is a floor coming back in through the door this suite watches.
 */
describe('the gates the floor was reached through', () => {
    it.each([TacticalGraphicName.Turn, TacticalGraphicName.Envelopment])('%s has neither flag', name => {
        const holder = (getController(name, RES) as unknown as {graphic: Record<string, unknown>}).graphic;
        expect('sizingFromDraw' in holder).toBe(false);
        expect('suspendMinimumSize' in holder).toBe(false);
    });
});
