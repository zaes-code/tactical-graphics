/**
 * # Follow and assume, follow and support
 *
 * The paint half of APP-06 341200 and 341300. @see FollowTask.ts.
 *
 * Both are one shape read along the axis from the rear point to the tip: a hollow body
 * carrying field T, a connector, and a head. What separates them is the connector and the
 * head, and that is the whole difference between the two symbols:
 *
 * | | body | connector | head |
 * |---|---|---|---|
 * | follow and **assume** | flat rear edge | **dashed** | open chevron outline |
 * | follow and **support** | notched rear edge | solid | filled triangle |
 *
 * **The dashes are the symbol, not its status.** APP-06 341200 carries the note *"The
 * dashed lines in this symbol shall be displayed in present and anticipated status"*, so
 * the connector's dash is set on its own stroke rather than taken from `amplifierDash` —
 * a planned follow-and-assume dashes because it is planned *and* because it is a follow
 * and assume, and the two must not cancel.
 *
 * **Where the standards disagree, and what is drawn.** FM 1-02.2 draws follow and
 * support with an *open* arrowhead; APP-06 341300's example fills it. Both define the
 * symbol, so `GRAPHIC_SPECIFICATIONS` says `BOTH` and one of the two had to be picked:
 * the fill is drawn, because APP-06 is the newer statement and because the fill is what
 * distinguishes this head from the assume variant's chevron at a glance. The divergence
 * is recorded here rather than resolved silently, which is the rule for every other place
 * the two plates differ.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {endMarkScale, textWidth} from './decorations';
import {amplifierDash, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

type TaskPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Which of the two symbols is being drawn. */
export type FollowVariant = 'assume' | 'support';

/**
 * The body, the head, and the dash, as multiples of the graphic's decoration unit.
 *
 * Written in screen pixels **at the zoom the graphic was drawn at**, because that is
 * what `decorationMeters` converts: `DECORATION_UNIT_PX` worth of ground is stamped into
 * `decorationSize` when the symbol is drawn, and every number here is measured against
 * it. So they are screen sizes at first, as the rule's "varies only in length" asks — and
 * they scale with the symbol afterwards, because a **resize multiplies `decorationSize`**
 * along with the vertices. Deriving them from `context.resolution` instead, which is what
 * the first version did, made a resize stretch the axis and leave the body and head the
 * size they were. @see scaleDrawnSizes, LineGraphicController.handleResize
 *
 * They still pass through `endMarkScale`, so a graphic shorter than its own decorations
 * shrinks them rather than drawing a body longer than the axis it sits on.
 */
/** The unit these are measured in. Matches this graphic's entry in `DECORATION_PX`. */
const DECORATION_UNIT_PX = 20;
const BODY_LENGTH_PX = 46;
const BODY_HALF_HEIGHT_PX = 15;
/** Clear space either side of field T inside the body, in screen pixels. */
const BODY_TEXT_PADDING_PX = 7;
/** How far the body's nose runs past its parallel sides, and how deep the rear notch cuts. */
const BODY_NOSE_PX = 16;
const BODY_NOTCH_PX = 13;
/** The head: how far it reaches back from the tip, and how far it spreads either side. */
const HEAD_LENGTH_PX = 26;
const HEAD_HALF_SPREAD_PX = 17;
/** Thickness of the assume variant's hollow chevron. */
const CHEVRON_THICKNESS_PX = 7;
/** The connector's dash, which belongs to the symbol rather than to its status. */
const CONNECTOR_DASH_PX = [10, 7];

/** Straight-line interpolation between two projected points. */
const lerp = (a: ProjectedPosition, b: ProjectedPosition, t: number): ProjectedPosition =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function followTaskPaint(variant: FollowVariant): TaskPaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'LineString' || geometry.coordinates.length < 2) return [];

        const path = geometry.coordinates;
        const rear = path[0];
        const tip = path[path.length - 1];
        const dx = tip[0] - rear[0];
        const dy = tip[1] - rear[1];
        const span = Math.hypot(dx, dy);
        if (span === 0) return [];

        // Along the axis, and square to it. Projected metres throughout — no turf here.
        const ux = dx / span;
        const uy = dy / span;
        const nx = -uy;
        const ny = ux;

        const scale = endMarkScale(path, context.resolution, BODY_LENGTH_PX + HEAD_LENGTH_PX);
        if (scale <= 0) return [];
        // One "pixel" of the plate, in metres on the ground: the stamped decoration size
        // divided by the unit it was stamped in. Absent — a base built by a caller that
        // never went through a holder — it falls back to the drawing zoom, which is the
        // same number the holder would have stamped.
        const unit = feature.properties.decorationSize ?? DECORATION_UNIT_PX * context.resolution;
        const metresPerPx = unit / DECORATION_UNIT_PX;
        const px = (n: number) => n * scale * metresPerPx;

        /** A point `along` metres from the rear and `across` metres to its left. */
        const at = (along: number, across: number): ProjectedPosition => [
            rear[0] + ux * along + nx * across,
            rear[1] + uy * along + ny * across,
        ];

        // **The body holds field T, so it is as long as the text needs.** The plates draw
        // a short designation in a small box; a real one is `TF RAIDER`, and a body fixed
        // at its plate proportions had the text hanging out of both ends of the shape it
        // is supposed to sit inside. The minimum keeps an unnamed graphic looking like the
        // plate. @see escortPaint, which sizes its own break the same way.
        const designation = feature.properties.designation?.trim();
        const textScale = scaleOf(feature, context);
        const textPx = designation ? textWidth(context, designation, fontStyle, textScale) : 0;
        const bodyLength = Math.max(px(BODY_LENGTH_PX), (textPx + 2 * BODY_TEXT_PADDING_PX * scale) * context.resolution);
        const half = px(BODY_HALF_HEIGHT_PX);
        const nose = px(BODY_NOSE_PX);
        const headLength = px(HEAD_LENGTH_PX);
        const spread = px(HEAD_HALF_SPREAD_PX);

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)};
        const paints: Paint[] = [];

        // ── The body ────────────────────────────────────────────────────────────
        // Flat rear edge for assume; a notch cut forward into it for support.
        const body: ProjectedPosition[] = [
            at(0, half),
            at(bodyLength, half),
            at(bodyLength + nose, 0),
            at(bodyLength, -half),
            at(0, -half),
        ];
        if (variant === 'support') body.push(at(px(BODY_NOTCH_PX), 0));
        body.push(body[0]);
        paints.push({geometry: {type: 'LineString', coordinates: body}, stroke});

        // ── The connector ───────────────────────────────────────────────────────
        const noseTip = at(bodyLength + nose, 0);
        const headBase: ProjectedPosition = [tip[0] - ux * headLength, tip[1] - uy * headLength];
        // Only when there is a gap to bridge: on a short graphic the body's nose can
        // already reach the head, and a connector drawn backwards reads as a spur.
        if ((headBase[0] - noseTip[0]) * ux + (headBase[1] - noseTip[1]) * uy > 0) {
            paints.push({
                geometry: {type: 'LineString', coordinates: [noseTip, headBase]},
                stroke:
                    variant === 'assume'
                        ? {...stroke, dashPx: CONNECTOR_DASH_PX.map(d => d * scale)} // px: a dash is drawn, not measured
                        : stroke,
            });
        }

        // ── The head ────────────────────────────────────────────────────────────
        const backLeft: ProjectedPosition = [headBase[0] + nx * spread, headBase[1] + ny * spread];
        const backRight: ProjectedPosition = [headBase[0] - nx * spread, headBase[1] - ny * spread];

        if (variant === 'support') {
            // Filled triangle. @see the note above on which standard this follows.
            paints.push({
                geometry: {type: 'Polygon', coordinates: [[tip, backLeft, backRight, tip]]},
                fill: {color: lineColorOf(feature)},
                stroke,
            });
        } else {
            // A hollow chevron: the outer V, and an inner V set back along the axis by
            // the chevron's own thickness, closed into one ring.
            const t = px(CHEVRON_THICKNESS_PX);
            const inner = (p: ProjectedPosition): ProjectedPosition => [p[0] - ux * t, p[1] - uy * t];
            paints.push({
                geometry: {
                    type: 'LineString',
                    coordinates: [backLeft, tip, backRight, inner(backRight), inner(tip), inner(backLeft), backLeft],
                },
                stroke,
            });
        }

        // ── Field T, inside the body ────────────────────────────────────────────
        if (designation) {
            paints.push({
                geometry: {type: 'Point', coordinates: lerp(at(0, 0), at(bodyLength, 0), 0.5)},
                text: {
                    text: designation,
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    align: 'center',
                    baseline: 'middle',
                    scale: textScale,
                },
            });
        }

        return paints;
    };
}
