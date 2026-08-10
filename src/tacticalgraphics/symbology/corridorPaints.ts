/**
 * # The air-coordinating corridors
 *
 * Air corridor, low-level transit route, minimum-risk route, safe lane, special
 * corridor, standard-use Army aircraft flight route, transit corridor and
 * unmanned-aircraft corridor. Eight names, one shape: a pair of rails with a
 * circle at each turning point, an "ACP n" in every circle, the designation along
 * each leg, and a block of properties hanging off the top-left.
 *
 * **Every piece of text here stays in the label colour, including on a hostile
 * corridor.** FM 1-02.2 colours the *lines* of a control measure by standard
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
    getLabelFillColor,
    getLabelHaloColor,
    graphicLabelScale,
} from '../core/symbology';
import {TacticalGraphicName} from '../core/type';
import {textWidth} from './decorations';
import {getFullLabel, lineColorOf, scaleOf} from './paintFunctions';

/** Assumed circle radius when the real one is unknown, in screen pixels. */
const ACP_FALLBACK_RADIUS_PX = 12 * 0.95;
/** Share of the circle's diameter the "ACP n" label may span. */
const ACP_TEXT_FRACTION = 0.8;
const ACP_PADDING_PX = 4;
/** How far above the corridor's bounding box the properties block sits. */
const INFO_BLOCK_OFFSET_PX = -60;

/**
 * Scale for an "ACP n" label — two competing sizes, and the larger wins.
 *
 * - The **floor** is fitted to a fixed assumed circle and capped at the
 *   zoom-anchored scale. It is what keeps a narrow corridor labelled at all;
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
 * Stored as bare metres because the properties dialog's Width input accepts digits
 * only, so the unit is presentation and is added here. Anything non-numeric — feet,
 * free text, an imported value — is shown verbatim rather than mangled.
 *
 * **The same words as every other distance in this library**, which is a deliberate
 * departure from doctrine rather than an oversight. It used to print raw metres with
 * thousands separators, so a corridor read `391,357.585 M` — three decimal places of a
 * metre, in a number nobody measures a corridor in. It now goes through
 * `formatDistance`: metres below a kilometre, kilometres above.
 *
 * FM 1-02.2 defines field AM as "a numeric amplifier that displays a minimum, maximum,
 * or specific distance (range, radius, width, or length) **in meters or feet**", capped
 * at 7 characters, and table 5-23's plates render it `1200FT` / `300FT`. Kilometres are
 * not one of the two units it admits — the manual reaches for "km" once in the whole
 * document, in the *speed* amplifier's "kph". Readability won that trade on the user's
 * call: a 391 km corridor written as `391358M` is a number nobody can take in at a
 * glance, and the quantity is unambiguous either way.
 */
export function formatWidthAmplifier(value: string): string {
    const metres = Number(value);
    return value.trim() !== '' && Number.isFinite(metres) ? formatDistance(metres) : value;
}

/** A text amplifier with the usual halo. */
function amplifier(
    at: ProjectedPosition,
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
            fill: getLabelFillColor(),
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
 * turning points — so `coords[i]` is a circle centre and the midpoint of each
 * consecutive pair is a leg.
 */
export function airCorridorLabelPaint(name: TacticalGraphicName): (f: PaintFeature, c: PaintContext) => Paint[] {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiPoint') return [];
        const coords = geometry.coordinates;
        if (!coords.length) return [];

        const props = feature.properties;
        const text = getFullLabel(name, props.label ?? '');
        const baseScale = scaleOf(feature, context);

        // The ACP labels track the circle rather than the zoom: `graphicSize` is the
        // corridor radius in map units, so dividing by the resolution gives the
        // circle's rendered pixel radius, and the size-proportional scale grows the
        // text from that same number.
        const circleRadiusPx =
            feature.graphicSize && feature.graphicSize > 0 ? feature.graphicSize / context.resolution : undefined;
        const acpScale = graphicLabelScale(feature.graphicSize, feature.drawingResolution, context.resolution);

        const paints: Paint[] = [];

        const infoLines: string[] = [];
        const corridorName = props.label?.trim();
        if (corridorName) infoLines.push(`NAME:       ${corridorName}`);
        if (props.width) infoLines.push(`WIDTH:      ${formatWidthAmplifier(String(props.width))}`);
        if (props.minAltitude) infoLines.push(`MIN ALT:    ${formatAltitude(props.minAltitude)}`);
        if (props.maxAltitude) infoLines.push(`MAX ALT:    ${formatAltitude(props.maxAltitude)}`);
        if (props.startDate) infoLines.push(`DTG START:  ${props.startDate}`);
        if (props.endDate) infoLines.push(`DTG END:    ${props.endDate}`);

        if (infoLines.length) {
            // Anchored at the NW corner of the turning points' bounding box. The pixel
            // gap scales with the label so the clearance stays proportional to both the
            // text and the circles at every zoom.
            let minX = Infinity;
            let maxY = -Infinity;
            for (const [x, y] of coords) {
                if (x < minX) minX = x;
                if (y > maxY) maxY = y;
            }
            paints.push(amplifier([minX, maxY], infoLines.join('\n'), baseScale, {
                align: 'left',
                baseline: 'bottom',
                offsetYPx: INFO_BLOCK_OFFSET_PX * baseScale,
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
                    fill: getLabelFillColor(),
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

            paints.push(amplifier([(x0 + x1) / 2, (y0 + y1) / 2], text, baseScale, {rotation}));
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
 * affiliation colour with no fill — a filled circle would hide whatever the
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
