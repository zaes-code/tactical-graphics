import type {Feature, LineString, Position} from 'geojson';
import * as turf from '../core/turf';

/**
 * # The frame a "front edge and a rear" symbol is built on
 *
 * APP-06 states several mission tasks the same way: **two points give a front edge and a
 * third gives the rear.** Breach 340200 ("points 1 and 2 define the endpoints of the
 * symbol's opening and point 3 defines the rear"), bypass 340300 ("the tips of the
 * arrowheads … the rear"), clear 340500 ("the endpoints of the symbol's vertical line …
 * the rear") and canalize 340400 by inheritance all read that way, and every one of them
 * adds the same Size/Shape sentence:
 *
 * > Points 1 and 2 determine the symbol's **height** and point 3 determines its **length**.
 *
 * Two dimensions, stated independently. Block 270501 and disrupt 270502 phrase their own
 * anchor points identically, so this reader is written for the shape rather than for the
 * four graphics that use it today.
 *
 * ## What point 3 contributes, and what it does not
 *
 * Only its distance **across** the front edge, and which side of it. Breach, bypass and
 * clear all state that the rear line "will be the same height as the opening and parallel
 * to it", so nothing in the drawn symbol can express an along-edge offset — a third click
 * that slid sideways would move a handle without changing the picture. Block 270501 makes
 * the same projection explicit ("plotting point 3 on a plane extending perpendicularly from
 * the midpoint of the vertical line"), which is the reading taken here for the graphics that
 * leave it unsaid. That is an **interpretation** for 340200/340300/340400/340500, recorded
 * here rather than left to be re-derived. @see sideAnchors, which stores the click that way
 *
 * ## Why it returns an axis rather than four corners
 *
 * The existing generators draw these symbols by offsetting a rear-to-front axis by a
 * half-height and marking the far ends — `getBreachArrow`, `getBypassArrow`,
 * `getClearGraphic` all take exactly that pair. Handing them the same pair keeps the drawn
 * picture, the end marks and the label placement untouched, so this change is about where
 * the frame comes from and nothing else.
 */
export interface FrontEdgeFrame {
    /** Rear centre to front centre. The arms are this line offset by ±{@link half}. */
    axis: Position[];
    /** Half the height points 1 and 2 state: how far each arm sits off the axis. */
    half: number;
    /** The front edge's own bearing, points 1 → 2, in degrees. */
    edgeBearing: number;
    /** Which side of the front edge the rear falls on: +1 or -1. */
    side: number;
}

/** Degrees to radians, for the one place this file needs it. */
const RADIANS = Math.PI / 180;

/**
 * Reads the frame out of a three-point base, or `undefined` if it does not describe one.
 *
 * Returns `undefined` rather than guessing for a base of fewer than three points — mid-draw
 * the interaction hands over a one- or two-point sketch on every pointer move, and a legacy
 * two-point save is a different description entirely. Callers fall back to their own
 * pre-2026-09-06 reading in both cases.
 */
export function frontEdgeFromAnchors(coords: Position[] | undefined): FrontEdgeFrame | undefined {
    if (!coords || coords.length < 3) return undefined;
    const [one, two, rear] = coords;

    const height = turf.distance(turf.point(one), turf.point(two), {units: 'meters'});
    if (!Number.isFinite(height) || height <= 0) return undefined;

    const edgeBearing = turf.bearing(turf.point(one), turf.point(two));
    const frontMid = turf.destination(turf.point(one), height / 2, edgeBearing, {units: 'meters'});

    // The rear's component across the edge — its magnitude is the length, its sign the side.
    const reach = turf.distance(frontMid, turf.point(rear), {units: 'meters'});
    const toRear = turf.bearing(frontMid, turf.point(rear));
    const across = reach * Math.sin((toRear - edgeBearing) * RADIANS);
    if (!Number.isFinite(across) || across === 0) return undefined;

    const side = Math.sign(across) || 1;
    const rearMid = turf.destination(frontMid, Math.abs(across), edgeBearing + side * 90, {
        units: 'meters',
    });

    return {
        axis: [rearMid.geometry.coordinates as Position, frontMid.geometry.coordinates as Position],
        half: height / 2,
        edgeBearing,
        side,
    };
}

/**
 * The frame to draw with: the three placed points where there are three, and the old
 * two-points-and-a-size reading where there are not.
 *
 * **The legacy branch is what keeps saved graphics rendering.** Before 2026-09-06 these
 * symbols stored a two-point axis and took their half-height from a `size` the holder
 * derived — a ratio of the base length, which is precisely the aspect lock the plate's two
 * independent dimensions rule out. A file written that way still draws exactly as it did.
 */
export function frontEdgeFrame(base: Feature<LineString>, size: number): FrontEdgeFrame {
    const coords = base.geometry.coordinates;
    const drawn = frontEdgeFromAnchors(coords);
    if (drawn) return drawn;

    const axis = legacyAxis(coords);
    return {
        axis,
        half: size,
        edgeBearing: coords.length >= 2 ? turf.bearing(turf.point(axis[0]), turf.point(axis[1])) + 90 : 0,
        side: 1,
    };
}

/**
 * A legacy two-point base, turned rear-to-front for the drawing helpers.
 *
 * These four were in `TIP_FIRST_GRAPHICS` until 2026-09-06: their rules number the front
 * feature first, the generators build the front at the *last* vertex, and the reversal on the
 * way in reconciled the two. Removing them from that list — which a three-point base requires,
 * or the reader is handed points 3 and 2 as its front edge — takes the flip away from the
 * two-point saves that still need it. It happens here instead, where the base's own vertex
 * count says which shape is in hand. @see drawOrder.ts
 */
export function legacyAxis(coords: Position[]): Position[] {
    return [coords[coords.length - 1], coords[0]];
}
