/**
 * # APP-06 240804 — rectangular target, single target (AEGIS only)
 *
 * **Not a variant of 240802.** The two share three words of a name and almost nothing
 * else: 240802 takes one anchor point and has its length, width and attitude typed as
 * amplifiers, and draws a plain box with its designation inside. This one takes two
 * anchor points on opposite sides plus a width, reads its length *and* its orientation
 * off them, and carries a mark 240802 has not — the target cross at its centre.
 *
 * Building it by reusing 240802's paint would have produced two graphics with one
 * picture, which is the defect this repository keeps finding (@see the mined anti-tank
 * ditch, and 220103 / 220104). The cross is the whole of the difference on screen.
 *
 * > The target tactical symbol shall be centred upon the centre of the area. The size and
 * > orientation of the target symbol are fixed within the area. … The centre point of the
 * > area shall always have the target symbol with the same upright orientation.
 */
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {BASE_FONT_SIZE_PX} from '../core/config';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {textWidth} from './decorations';
import {labelColorOf, lineColorOf, scaleOf} from './paintFunctions';
import {fitSymbolScale, pointInRing, sampleSegments} from './symbolFit';

type AreaPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * The target cross at scale 1, in projected metres from the centre.
 *
 * Square-armed, because the plate's is: measured off the Example at 900 dpi the two arms
 * are within a pixel of each other. `fitSymbolScale` shrinks the whole thing to sit inside
 * whatever rectangle it was dropped in, the same way the airfield's runways do.
 */
export const ARM = 200_000;

/**
 * **Axis-aligned, and that is the plate's "upright" requirement rather than a shortcut.**
 *
 * These offsets are added to the centre in projected metres, where +y is north — so the
 * cross stands upright no matter which way the rectangle's axis was drawn, without anyone
 * having to un-rotate it. The one thing not to do is build the arms from the base's own
 * bearing, which is what every *other* two-point graphic here does and would turn the
 * cross with the box.
 */
const ARMS: readonly [ProjectedPosition, ProjectedPosition][] = [
    [[-ARM, 0], [ARM, 0]],
    [[0, -ARM], [0, ARM]],
];

/** Points along both arms, tested against the outline. @see sampleSegments */
const SAMPLES: readonly ProjectedPosition[] = sampleSegments(ARMS);

/**
 * The most of the screen the cross's half-arm may take, in pixels.
 *
 * **A ceiling, not a size.** The cross is fitted to the rectangle in metres, so it is a
 * fraction of the *shape* — which means it doubles on screen with every zoom level, and
 * measured in the running app it went 88 px, 177, 354, 707 across four zooms with nothing
 * stopping it. The rule the plate wants is the other way round: "the size and orientation of
 * the target symbol are fixed within the area".
 *
 * So the drawn size is `min(fitted, this)`:
 *
 *   - **zoom in** — the ceiling binds and the cross holds still, which is the fix
 *   - **zoom out** — the fitted metric size falls below the ceiling and takes over, so the
 *     cross shrinks with its rectangle rather than swelling to fill it
 *
 * 35 px is the measured 44 px half-arm less 20%. (User's call, 2026-09-04: "a bit big …
 * make it just 20% smaller … make sure it doesn't get bigger than that on zoom-in. It can
 * get smaller with zoom outs though.")
 */
export const CROSS_MAX_HALF_PX = 35;

/** Clear space between the cross's arms and the designation tucked beside them, in screen pixels. */
export const LABEL_GAP_PX = 8;

/**
 * The largest scale at or below `desired` at which the designation still sits **inside the
 * rectangle**.
 *
 * A corner-anchored twin of {@link fitLabelScale}, which fits a *centred* block and so
 * cannot describe this one: the label hangs off the centre into quadrant 1, growing right
 * and up, and what overruns is its far corner rather than its edges evenly.
 *
 * **Shrinking rather than shoving.** The alternative was to slide the label back toward the
 * centre until it fits, but that walks it out of the quadrant the plate puts it in and over
 * the arms it was just moved clear of. Shrinking keeps the placement and is what every other
 * over-long label in this library does.
 *
 * Returns `desired` untouched when the feature carries no ring — a label that shrank to
 * nothing because the shape was never supplied is worse than one that overruns. Same ruling
 * as `fitLabelScale`.
 */
function fitLabelInQuadrant(
    feature: PaintFeature,
    context: PaintContext,
    center: ProjectedPosition,
    label: string,
    desired: number,
): number {
    const ring = feature.ring;
    if (!ring || ring.length < 3 || !(desired > 0)) return desired;

    const fits = (scale: number) => {
        const gap = LABEL_GAP_PX * scale * context.resolution;
        const width = textWidth(context, label, fontStyle, scale) * context.resolution;
        // The full em above the baseline, which is taller than the caps actually drawn —
        // deliberately conservative, since the cost of over-measuring is a slightly smaller
        // label and the cost of under-measuring is the overrun this exists to prevent.
        const height = BASE_FONT_SIZE_PX * scale * context.resolution;
        const x = center[0] + gap;
        const y = center[1] + gap;
        return ([[x, y], [x + width, y], [x + width, y + height], [x, y + height]] as ProjectedPosition[]).every(p =>
            pointInRing(ring, p),
        );
    };

    if (fits(desired)) return desired;

    let low = 0;
    let high = desired;
    for (let i = 0; i < 24; i++) {
        const mid = (low + high) / 2;
        if (fits(mid)) low = mid;
        else high = mid;
    }
    return low;
}

/**
 * The centre cross, and the designation beside it.
 *
 * The designation is drawn **bare and to the right**, which is what the Example column
 * shows (`NSFS002`). The Template puts a boxed `T` there instead — that box names the
 * field rather than belonging to the symbol, the same notation the bearing lines use for
 * their `H`. @see ai/app-6.md, "the Template names the fields, the Example draws the
 * symbol".
 */
export function aegisSingleTargetPaint(): AreaPaint {
    return (feature, context) => {
        // The label slot is handed the area's interior point. Anything else means this was
        // called with the outline, and there is no centre to hang the cross on.
        const center = feature.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
        if (!center) return [];

        // Fitted to the rectangle, then held under a screen ceiling. @see CROSS_MAX_HALF_PX
        const fitted = ARM * fitSymbolScale(feature, center, ARM, ARM, SAMPLES);
        const half = Math.min(fitted, CROSS_MAX_HALF_PX * context.resolution);
        const scale = half / ARM;

        const color = lineColorOf(feature);
        const paints: Paint[] = ARMS.map(([from, to]) => ({
            geometry: {
                type: 'LineString',
                coordinates: [
                    [center[0] + from[0] * scale, center[1] + from[1] * scale],
                    [center[0] + to[0] * scale, center[1] + to[1] * scale],
                ] as ProjectedPosition[],
            },
            // The cross is the symbol's own line work, not an amplifier, so it takes the
            // identity colour with the outline. FM 1-02.2 para 5-3.
            stroke: {color, widthPx: LINE_WIDTH()},
        }));

        const designation = (feature.properties.designation ?? '').trim();
        if (designation) {
            const textScale = fitLabelInQuadrant(feature, context, center, designation, scaleOf(feature, context));
            const gap = LABEL_GAP_PX * textScale * context.resolution;
            paints.push({
                geometry: {
                    /*
                     * **Tucked into quadrant 1**, against the vertical arm rather than hung
                     * off the horizontal one's tip. The Template puts `T` here, and it keeps
                     * the designation with the symbol at any cross size — the old placement
                     * measured from the arm's end, so capping that arm would have stranded
                     * the label out where the tip used to be.
                     */
                    type: 'Point',
                    coordinates: [center[0] + gap, center[1] + gap],
                },
                text: {
                    text: designation,
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    /*
                     * **`alphabetic`, not `bottom`, and that is what makes the two gaps
                     * equal.** `bottom` is the foot of the em box, which includes descender
                     * space these all-caps designations never use — so the glyphs floated a
                     * descender's worth higher above the horizontal arm than they sat right
                     * of the vertical one, and the label read as off-centre. `alphabetic`
                     * puts the anchor on the text baseline, which for `NSFS002` or `ALPHA`
                     * *is* the bottom of the ink, so both gaps come out at `gap` exactly.
                     */
                    align: 'left',
                    baseline: 'alphabetic',
                    scale: textScale,
                },
            });
        }

        return paints;
    };
}
