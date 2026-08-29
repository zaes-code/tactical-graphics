/**
 * # The air-coordinating corridors
 *
 * Air corridor, low-level transit route, minimum-risk route, safe lane, special
 * corridor, standard-use Army aircraft flight route, transit corridor and
 * unmanned-aircraft corridor. Eight names, one shape: a pair of rails with a
 * circle at each turning point, an "ACP n" in every circle, the designation along
 * each leg, and a block of properties hanging off the top-left.
 *
 * **Every piece of text here stays in the label color, including on a hostile
 * corridor.** FM 1-02.2 colors the *lines* of a control measure by standard
 * identity — the rails and the circle strokes — while text amplifiers stay black.
 * Table 5-3's enemy boundary is the reference: red line, black labels.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {paintGeometryMembers} from '../core/paint';
import {
    HALO_WIDTH,
    LINE_WIDTH,
    formatAltitude,
    formatDistance,
    fontStyle,
    getLabelHaloColor,
    graphicLabelScale,
} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {pathLength, textWidth} from './decorations';
import {getFullLabel, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';
import {capLabelToSpan} from './labelFit';

/** Assumed circle radius when the real one is unknown, in screen pixels. */
const ACP_FALLBACK_RADIUS_PX = 12 * 0.95;
/** Share of the circle's diameter the "ACP n" label may span. */
const ACP_TEXT_FRACTION = 0.8;
const ACP_PADDING_PX = 4;
/** How far above the corridor's bounding box the properties block sits. */
/**
 * Clear space between the corridor's westmost rail and its amplifier block, in screen
 * pixels at the label's own scale — so the gap looks the same however large the text is.
 *
 * Replaces the old vertical `INFO_BLOCK_OFFSET_PX`, which lifted the block above the
 * turning points and could not survive a corridor that bent north past it.
 */
const INFO_BLOCK_GAP_PX = 14;

/**
 * Share of the corridor's *width* its designation may span.
 *
 * Wider than the general share because this label is measured across the rails rather than
 * along the leg: the text is drawn rotated along the corridor, so what has to fit between
 * the rails is its height, and capping its width at 1.4 of the width leaves the height
 * comfortably inside. Anything larger and the designation prints over its own rails.
 */
const LEG_LABEL_WIDTH_SHARE = 1.4;

/**
 * Scale for an "ACP n" label — two competing sizes, and the larger wins.
 *
 * - The **floor** is fitted to a fixed assumed circle and capped at the
 *   zoom-anchored scale. It is what keeps a narrow corridor labeled at all;
 *   fitting to the real circle alone collapses the text to nothing when the
 *   circle is only a few pixels across.
 * - The **grown** size is fitted to the circle's real rendered radius and capped at
 *   the size-proportional scale, so a wide corridor gets a big label.
 *
 * Pass `circleRadiusPx` / `proportionalScale` only when the graphic stamps a size;
 * without them the floor applies alone.
 */
export function acpLabelScale(
    context: PaintContext,
    text: string,
    font: string,
    zoomScale: number,
    circleRadiusPx?: number,
    proportionalScale?: number,
): number {
    const textWidthAt1 = textWidth(context, text, font, 1);
    const floor = Math.min(zoomScale, (ACP_FALLBACK_RADIUS_PX * zoomScale * 2.5 - ACP_PADDING_PX) / textWidthAt1);

    if (circleRadiusPx === undefined || proportionalScale === undefined) return floor;

    const circleMaxWidth = Math.max(0, circleRadiusPx * 2 * ACP_TEXT_FRACTION - ACP_PADDING_PX);
    return Math.max(floor, Math.min(proportionalScale, circleMaxWidth / textWidthAt1));
}

/**
 * Renders the AM (width) amplifier.
 *
 * Stored as bare meters because the properties dialog's Width input accepts digits
 * only, so the unit is presentation and is added here. Anything non-numeric — feet,
 * free text, an imported value — is shown verbatim rather than mangled.
 *
 * **The same words as every other distance in this library**, which is a deliberate
 * departure from doctrine rather than an oversight. It used to print raw meters with
 * thousands separators, so a corridor read `391,357.585 M` — three decimal places of a
 * meter, in a number nobody measures a corridor in. It now goes through
 * `formatDistance`: meters below a kilometer, kilometers above.
 *
 * FM 1-02.2 defines field AM as "a numeric amplifier that displays a minimum, maximum,
 * or specific distance (range, radius, width, or length) **in meters or feet**", capped
 * at 7 characters, and table 5-23's plates render it `1200FT` / `300FT`. Kilometers are
 * not one of the two units it admits — the manual reaches for "km" once in the whole
 * document, in the *speed* amplifier's "kph". Readability won that trade on the user's
 * call: a 391 km corridor written as `391358M` is a number nobody can take in at a
 * glance, and the quantity is unambiguous either way.
 */
export function formatWidthAmplifier(value: string): string {
    const meters = Number(value);
    return value.trim() !== '' && Number.isFinite(meters) ? formatDistance(meters) : value;
}

/** A text amplifier with the usual halo. */
function amplifier(
    feature: PaintFeature, at: ProjectedPosition,
    text: string,
    scale: number,
    extra: {
        rotation?: number;
        align?: 'left' | 'center' | 'right';
        baseline?: 'top' | 'middle' | 'bottom';
        offsetYPx?: number;
    } = {},
): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: fontStyle,
            fill: labelColorOf(feature),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            align: extra.align ?? 'center',
            baseline: extra.baseline ?? 'middle',
            rotation: extra.rotation,
            offsetYPx: extra.offsetYPx,
            scale,
        },
    };
}

/**
 * The corridor's labels: the properties block, the designation on each leg, and
 * "ACP n" in every circle.
 *
 * Painted from the **labels** feature, whose geometry is the MultiPoint of
 * turning points — so `coords[i]` is a circle center and the midpoint of each
 * consecutive pair is a leg.
 */
export function airCorridorLabelPaint(name: TacticalGraphicName): (f: PaintFeature, c: PaintContext) => Paint[] {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiPoint') return [];
        const coords = geometry.coordinates;
        if (!coords.length) return [];

        const props = feature.properties;
        const text = getFullLabel(name, props.designation ?? '');
        const baseScale = scaleOf(feature, context);

        // The ACP labels track the circle rather than the zoom: `graphicSize` is the
        // corridor radius in map units, so dividing by the resolution gives the
        // circle's rendered pixel radius, and the size-proportional scale grows the
        // text from that same number.
        const circleRadiusPx =
            feature.graphicSize && feature.graphicSize > 0 ? feature.graphicSize / context.resolution : undefined;
        const acpScale = graphicLabelScale(feature.graphicSize, feature.drawingResolution, context.resolution);

        const paints: Paint[] = [];

        /*
         * **The designation as it is drawn along the corridor, per leg.**
         *
         * Worked out here rather than in the drawing loop below, because the amplifier
         * block is held to it and the block is drawn first. The block sits *outside* the
         * graphic and the designation sits *on* it, so the designation is the one a reader
         * measures everything else against — an amplifier larger than the symbol's own
         * name reads as the more important of the two, which it is not. (User's call,
         * 2026-08-29.)
         *
         * Each leg gets its own answer because legs differ in length; the block is capped
         * at the largest of them, which is the designation at its most prominent. Capping
         * at the smallest would let one short leg shrink the block to nothing.
         */
        const legWidthPx = (circleRadiusPx ?? ACP_FALLBACK_RADIUS_PX) * 2;
        const legScales: number[] = [];
        for (let i = 0; i < coords.length - 1; i++) {
            const legPx = Math.hypot(coords[i + 1][0] - coords[i][0], coords[i + 1][1] - coords[i][1]) / context.resolution;
            legScales.push(Math.min(
                capLabelToSpan(context, text, fontStyle, baseScale, legPx),
                capLabelToSpan(context, text, fontStyle, baseScale, legWidthPx, LEG_LABEL_WIDTH_SHARE),
            ));
        }
        const designationScale = legScales.length ? Math.max(...legScales) : baseScale;

        const infoLines: string[] = [];
        const corridorName = props.designation?.trim();
        if (corridorName) infoLines.push(`NAME:       ${corridorName}`);
        if (props.width) infoLines.push(`WIDTH:      ${formatWidthAmplifier(String(props.width))}`);
        if (props.minAltitude) infoLines.push(`MIN ALT:    ${formatAltitude(props.minAltitude, props.altitudeDatum)}`);
        if (props.maxAltitude) infoLines.push(`MAX ALT:    ${formatAltitude(props.maxAltitude, props.altitudeDatum)}`);
        if (props.startDate) infoLines.push(`DTG START:  ${props.startDate}`);
        if (props.endDate) infoLines.push(`DTG END:    ${props.endDate}`);

        if (infoLines.length) {
            /*
             * **Beside the north-west-most turning point, and west of the whole corridor.**
             *
             * Two failed placements are worth recording, because each looked right until
             * the shape moved. It first anchored on the bounding box of the *turning
             * points* with a fixed pixel gap — but the points are the centre line and the
             * rails run half a width either side of them, so zooming in grew that half
             * width until it swallowed the block. Lifting it by the corridor's own radius
             * fixed a *straight* corridor and not a bent one: a corridor that turns north
             * climbs past whatever a local lift can clear. Measured at six zoom levels in,
             * the graphic reached fifteen thousand pixels above the vertex the block hangs
             * from.
             *
             * There is no local answer, so the block goes **west of every rail** —
             * `minX - radius`, which is the westmost the corridor can reach — and stays
             * level with the north-west-most turning point. Outside for any shape at any
             * zoom, and still beside the vertex it belongs to, which is what was asked for.
             * `align: 'right'` because the text then has to grow away from the corridor
             * rather than back into it. (User's call, 2026-08-29.)
             */
            let minX = Infinity;
            let maxY = -Infinity;
            for (const [x, y] of coords) {
                if (x < minX) minX = x;
                if (y > maxY) maxY = y;
            }
            const anchorY = coords.reduce((best, point) =>
                Math.hypot(point[0] - minX, point[1] - maxY) < Math.hypot(best[0] - minX, best[1] - maxY) ? point : best,
            )[1];
            const infoText = infoLines.join('\n');
            /*
             * Measured from the graphic's own extent when the holder publishes one, which
             * both engines now do — the turning points are the centre line, and deriving
             * the rails' reach from them means guessing. Falls back to the vertices minus
             * the radius, which is where the rails are, for anything that stamps no extent.
             */
            const radiusPx = circleRadiusPx ?? ACP_FALLBACK_RADIUS_PX;
            const westEdge = feature.bounds ? feature.bounds.minX : minX - radiusPx * context.resolution;
            const anchorX = westEdge - INFO_BLOCK_GAP_PX * baseScale * context.resolution;
            const blockScale = Math.min(
                designationScale,
                capLabelToSpan(context, infoText, fontStyle, baseScale, pathLength(coords) / context.resolution),
            );
            paints.push(amplifier(feature, [anchorX, anchorY], infoText, blockScale, {
                align: 'right',
                baseline: 'middle',
            }));
        }

        const acpAt = (index: number): Paint => {
            const labelText = `ACP ${index + 1}`;
            return {
                geometry: {type: 'Point', coordinates: coords[index]},
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
                text: {
                    text: labelText,
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    align: 'center',
                    baseline: 'middle',
                    scale: acpLabelScale(context, labelText, fontStyle, baseScale, circleRadiusPx, acpScale),
                },
            };
        };

        for (let i = 0; i < coords.length - 1; i++) {
            const [x0, y0] = coords[i];
            const [x1, y1] = coords[i + 1];
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;

            // Capped by the leg's length, which it must not overrun, and by the corridor's
            // width, which it must not spill out of sideways. @see legScales
            paints.push(amplifier(feature, [(x0 + x1) / 2, (y0 + y1) / 2], text, legScales[i], {rotation}));
            paints.push(acpAt(i));
        }

        // The last turning point has no leg after it, so it is added on its own.
        paints.push(acpAt(coords.length - 1));
        return paints;
    };
}

/**
 * The corridor's line work: the rails and the circle at each turning point.
 *
 * The generator emits a collection, and every member of it is stroked in the
 * affiliation color with no fill — a filled circle would hide whatever the
 * corridor passes over, and the ACP label inside it.
 */
export function airCorridorPaint(): (f: PaintFeature, c: PaintContext) => Paint[] {
    return feature => {
        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH()};
        return paintGeometryMembers(feature.geometry)
            .filter(member => member.type !== 'Point' && member.type !== 'MultiPoint')
            .map(member => ({geometry: member, stroke}));
    };
}
