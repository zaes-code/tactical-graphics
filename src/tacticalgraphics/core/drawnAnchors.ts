import {Position} from 'geojson';
import * as turf from './turf';
import {baseGeometryFor} from './render';
import {TacticalGraphicName} from './type';
import {
    anchorsForArcAndArrow,
    anchorsForBow,
    anchorsForHook,
    anchorsForRunAndArc,
    anchorsFromFrame,
    arcAndArrowFromAnchors,
    ARC_ARROW_DEFAULT_REACH,
    bowFromAnchors,
    frameFromAnchors,
    HOOK_DEFAULT_LINE_RATIO,
    hookFromAnchors,
    hookPose,
    runAndArcFromAnchors,
} from './anchors';
import {clampTurnBend, TURN_DEFAULT_BEND} from '../graphics/Turn';
import {clampEnvelopmentBend, ENVELOPMENT_DEFAULT_BEND} from '../graphics/FormsOfManeuver';

/**
 * # Where a drawn-anchor graphic's points go, stated once for both renderers
 *
 * The six graphics in `DRAWN_ANCHOR_GRAPHICS` are described by points rather than by a
 * dropped centre, and no two of them lay those points out the same way: Turn spends three
 * on a bow, Envelop four on a run and a half circle, Pursue three on a hook, Ambush three
 * on an arc and an arrow, Contain two on a semicircle's opening.
 *
 * **That layout lived in the OpenLayers holders**, one `anchorPoints()` override each, in
 * the half of the codebase MapLibre cannot see. So MapLibre could not write one: it stored
 * the raw clicks instead and the generator read them as whatever its own reader expected.
 * For Turn that meant the two clicks became the *ends of the chord* where OpenLayers reads
 * them as **centre and edge** — the same gesture, the same panel hint, half the symbol.
 * Measured, the same two clicks: 240 x 31 px on OpenLayers, 120 x 24 px on MapLibre.
 *
 * A frame in, points out. The inverse — points back to a frame — is each shape's own
 * reader in `core/anchors.ts` (`bowFromAnchors`, `hookFromAnchors`, …), which both engines
 * already share; this is the direction that was missing.
 *
 * @see ai/conventions.md, "A symbology fact never lives in a holder"
 */
export interface DrawnAnchorFrame {
    /** The symbol's centre, in lon/lat. */
    center: Position;
    /** Half-length in metres — the reach from centre to edge, which is what a draw measures. */
    size: number;
    /** Planar degrees, 0 = east. */
    rotation?: number;
    /** Curve depth, for the two that carry one. Signed: the sign is the side. */
    bend?: number;
    /** Which flank an asymmetric symbol hangs on. Pursuit's hook. */
    mirrored?: boolean;
    /** Ambush's arrow reach, as a multiple of the radius. */
    arrowReach?: number;
    /** Pursuit's straight run, as a multiple of the radius. */
    lineRatio?: number;
}

/**
 * Contain's opening faces a quarter turn off its own axis.
 *
 * The same constant the OpenLayers holder kept privately, and the reason it is here is
 * the reason the whole module is: the other renderer could not read it.
 * @see Contain in the graphics half
 */
const CONTAIN_OPENING_QUARTER_TURN = 90;

/**
 * The anchor points this graphic is described by, for a symbol of this size and pose.
 *
 * Returns `undefined` for a name that is not drawn from anchors, so a caller can ask
 * without checking `usesDrawnAnchors` first and get one answer rather than two.
 */
export function drawnAnchors(name: TacticalGraphicName, frame: DrawnAnchorFrame): Position[] | undefined {
    const {center, size} = frame;
    const rotation = frame.rotation ?? 0;
    if (!(size > 0)) return undefined;

    switch (name) {
        case TacticalGraphicName.Turn:
        case TacticalGraphicName.TacticalTurn:
            return anchorsForBow(center, size, rotation, clampTurnBend(frame.bend ?? TURN_DEFAULT_BEND));

        case TacticalGraphicName.Envelopment: {
            // `bend` is a signed multiple of the half-length: its magnitude is the arc's
            // radius and its sign is the flank. @see EnvelopmentGraphicBase
            const bend = clampEnvelopmentBend(frame.bend ?? ENVELOPMENT_DEFAULT_BEND);
            return anchorsForRunAndArc(center, size, Math.abs(bend) * size, rotation, Math.sign(bend) || 1);
        }

        case TacticalGraphicName.Pursuit:
            return anchorsForHook(
                center,
                size,
                rotation,
                frame.mirrored ? -1 : 1,
                frame.lineRatio ?? HOOK_DEFAULT_LINE_RATIO,
            );

        case TacticalGraphicName.Ambush:
            return anchorsForArcAndArrow(center, size, rotation, frame.arrowReach ?? ARC_ARROW_DEFAULT_REACH);

        case TacticalGraphicName.Contain:
            return anchorsFromFrame(center, size, rotation - CONTAIN_OPENING_QUARTER_TURN);

        default:
            return undefined;
    }
}

/** Planar radians to the schema's degrees. */
const degrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * The inverse: the frame a set of drawn anchor points describes.
 *
 * The readers themselves have always been shared — `bowFromAnchors`, `hookFromAnchors`
 * and the rest live beside their writers — but *which* reader belongs to which graphic
 * was stated only in the OpenLayers holders' `adoptAnchors` overrides. So MapLibre could
 * move an anchor and had no way to say what the symbol had become: its stored `radius`
 * and `rotation` went on describing the graphic as drawn while the picture said otherwise.
 *
 * Undefined when the points do not describe a usable symbol — a click rather than a drag —
 * so a caller can leave the description alone instead of snapping it to a degenerate one.
 */
export function drawnAnchorFrame(name: TacticalGraphicName, coords: Position[] | undefined): DrawnAnchorFrame | undefined {
    if (!coords || coords.length < 2) return undefined;

    switch (name) {
        case TacticalGraphicName.Turn:
        case TacticalGraphicName.TacticalTurn: {
            const frame = bowFromAnchors(coords);
            return frame && {
                center: frame.center,
                size: frame.size,
                rotation: degrees(frame.angle),
                ...(frame.bend === undefined ? {} : {bend: clampTurnBend(frame.bend)}),
            };
        }

        case TacticalGraphicName.Envelopment: {
            const frame = runAndArcFromAnchors(coords);
            if (!frame) return undefined;
            // `bend` is the arc's radius over the run's half-length, signed by the flank.
            const bend = frame.radius !== undefined && frame.size > 0
                ? clampEnvelopmentBend((frame.radius / frame.size) * frame.side)
                : undefined;
            return {center: frame.center, size: frame.size, rotation: degrees(frame.angle), ...(bend === undefined ? {} : {bend})};
        }

        case TacticalGraphicName.Pursuit: {
            const frame = hookFromAnchors(coords);
            if (!frame) return undefined;
            // Which point carries the aim, and which way round "mirrored" runs, is the
            // library's answer rather than a caller's. @see hookPose
            const pose = hookPose(frame);
            return {
                center: pose.center,
                size: pose.radius,
                rotation: pose.rotationDegrees,
                mirrored: pose.side < 0,
                lineRatio: pose.lineRatio,
            };
        }

        case TacticalGraphicName.Ambush: {
            const frame = arcAndArrowFromAnchors(coords);
            return frame && {
                center: frame.center,
                size: frame.radius,
                rotation: degrees(frame.angle),
                arrowReach: frame.arrowReach,
            };
        }

        case TacticalGraphicName.Contain: {
            const frame = frameFromAnchors(coords);
            return frame && {
                center: frame.center,
                size: frame.size,
                rotation: degrees(frame.angle) + CONTAIN_OPENING_QUARTER_TURN,
            };
        }

        default:
            return undefined;
    }
}

/**
 * What a **dropped** graphic's frame is, read out of the line it used to be drawn as.
 *
 * The mirror of {@link drawnAnchorFrame}, for the conversions that went the other way: a
 * graphic whose points turned out to be one fixed shape at one set of proportions, and
 * which is placed on a single click now. The demonstration went that way on 2026-08-27.
 *
 * Point 1 is the anchor and points 1 → 2 give the size and the aim, because that is what a
 * fresh drop derives everything else from — so a file written before the conversion comes
 * back as the graphic it was rather than being refused.
 *
 * **Here rather than in each renderer's restore.** Both have one, both have to load the
 * same files, and the rule is a fact about the symbol.
 * @see ai/conventions.md, "A symbology fact never lives in a holder"
 */
export function droppedFrameFromDrawnBase(
    name: TacticalGraphicName,
    coords: Position[] | undefined,
): {center: Position; size: number; rotation: number} | undefined {
    if (baseGeometryFor(name) !== 'Point') return undefined;
    if (!coords || coords.length < 2) return undefined;

    const [anchor, next] = coords;
    const size = turf.distance(turf.point(anchor), turf.point(next), {units: 'meters'});
    if (!(size > 0)) return undefined;

    // Geodesic bearing → the planar rotation the generators take: 0 is due east and the
    // angle grows counter-clockwise. @see GeometryService.translateCoordinates
    const bearing = turf.bearing(turf.point(anchor), turf.point(next));
    return {center: anchor, size, rotation: ((90 - bearing) % 360 + 360) % 360};
}
