/**
 * # The scalloped lines, and the two arrowheaded crossings
 *
 * Forward line of own troops and line of contact wear half-circle scallops; fix,
 * tactical fix and ferry crossing carry a generator-drawn solid arrowhead that is
 * redrawn here at a screen size.
 *
 * Both groups exist because their decoration is *screen*-sized. Baked into the
 * geometry a scallop is fixed in meters, so a FLOT drawn zoomed out comes back as
 * a row of huge bulges; an arrowhead built off the drawn length grows every time
 * the graphic is resized. @see decorationScale
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {paintGeometryMembers} from '../core/paint';
import {BASE_FONT_SIZE_PX, getDefaultLabelSize} from '../core/config';
import {
    HALO_WIDTH,
    LINE_WIDTH,
    RATIO_LOCKED_LABEL_FONT,
    fontStyle,
    getColorByHostility,
    getLabelHaloColor,
    maxGraphicLabelScale,
} from '../core/symbology';
import {TacticalGraphicHostility} from '../core/type';
import {
    DECORATION_MIN_PX,
    LINE_OF_CONTACT_OFFSET_PX,
    WAVE_AMPLITUDE_PX,
    WAVE_WAVELENGTH_PX,
    decorationScale,
    pathLength,
    pathPointAt,
    screenSizedArrowHead,
    upSign,
    uprightRotation,
    wavePath,
} from './decorations';
import {amplifierDash, lineColorOf, scaleOf, labelColorOf} from './paintFunctions';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** A path's vertices, whatever line-ish geometry it arrived as. */
function vertices(feature: PaintFeature): ProjectedPosition[] {
    const geometry = feature.geometry;
    if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') return geometry.coordinates;
    return [];
}

/** The forward line of own troops: one scalloped line in the affiliation's color. */
export function forwardLineOfOwnTroopsPaint(): LinePaint {
    return (feature, context) => {
        const coords = vertices(feature);
        if (coords.length < 2) return [];

        const scale = decorationScale(coords, false, context.resolution, WAVE_AMPLITUDE_PX);
        return [{
            geometry: {
                type: 'LineString',
                coordinates: wavePath(
                    coords,
                    WAVE_WAVELENGTH_PX * scale * context.resolution,
                    WAVE_AMPLITUDE_PX * scale * context.resolution,
                    1,
                ),
            },
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
        }];
    };
}

/** Clearance between the line's end and the nearest edge of its "LC", in pixels. */
const LC_LABEL_PAD_PX = 10;

/**
 * The line of contact: two mirrored scalloped lines — hostile above, friendly
 * below — with "LC" outside each end.
 *
 * **This is the one graphic that draws both identities at once**, so the enemy-side
 * wave goes through the palette rather than a literal red: the pair has to stay
 * balanced when a host recolors the library.
 *
 * Which side is which is a property of the map, not of the drawing gesture. The
 * enemy-side wave takes the upper side of the line however the user drew it.
 *
 * One scale drives the waves *and* their separation, so the symbol keeps its
 * proportions and simply gets smaller. This was exempt from `decorationScale`
 * until 2026-08-04, on the grounds that the separation is what the graphic says.
 * What that produced was a 117 px line still wearing 8 px waves 16 px apart — two
 * separate squiggles rather than one symbol. The separation has its own floor
 * below which the waves are dropped: a shared scale of 0 would put the two lines
 * on top of each other, leaving one red line and no symbol at all.
 */
export function lineOfContactPaint(): LinePaint {
    return (feature, context) => {
        const coords = vertices(feature);
        if (coords.length < 2) return [];

        const res = context.resolution;
        const scale = decorationScale(coords, false, res, WAVE_AMPLITUDE_PX);
        const wavelengthMap = WAVE_WAVELENGTH_PX * scale * res;
        const amplitudeMap = WAVE_AMPLITUDE_PX * scale * res;

        const offsetScale = Math.max(scale, DECORATION_MIN_PX / WAVE_AMPLITUDE_PX);
        const offsetMap = LINE_OF_CONTACT_OFFSET_PX * offsetScale * res;

        const {dir} = pathPointAt(coords, pathLength(coords) / 2);
        const enemySign = upSign(dir);

        const start = coords[0];
        const end = coords[coords.length - 1];
        const scale2 = scaleOf(feature, context);
        // `uprightRotation` flips through 180° to keep text upright, so a line drawn
        // right-to-left needs its anchors swapped to keep the labels outside the graphic.
        const reversed = end[0] < start[0];

        const lc = (at: ProjectedPosition, rotation: number, align: 'left' | 'right', sign: number): Paint => ({
            geometry: {type: 'Point', coordinates: at},
            text: {
                text: 'LC',
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                rotation,
                align,
                baseline: 'middle',
                offsetXPx: sign * LC_LABEL_PAD_PX,
                scale: scale2,
            },
        });

        return [
            {
                geometry: {type: 'LineString', coordinates: wavePath(coords, wavelengthMap, amplitudeMap, enemySign, offsetMap)},
                stroke: {color: getColorByHostility(TacticalGraphicHostility.hostileFaker), widthPx: LINE_WIDTH()},
            },
            {
                geometry: {type: 'LineString', coordinates: wavePath(coords, wavelengthMap, amplitudeMap, -enemySign, offsetMap)},
                // **The friendly identity's colour, not the unaffiliated default.** This
                // wave *is* the friendly side of the symbol — the graphic draws both
                // identities at once — so painting it in the fallback line colour said
                // "unaffiliated" beside a wave that said "hostile", and a host that
                // re-coloured its affiliations re-coloured only half the symbol.
                stroke: {color: getColorByHostility(TacticalGraphicHostility.friend), widthPx: LINE_WIDTH()},
            },
            lc(start, uprightRotation(start, end), reversed ? 'left' : 'right', reversed ? 1 : -1),
            lc(end, uprightRotation(end, start), reversed ? 'right' : 'left', reversed ? -1 : 1),
        ];
    };
}

/**
 * Fix, tactical fix and ferry crossing: a zigzag with a solid arrowhead, and
 * optionally a letter beside its first segment.
 *
 * The head arrives from the generator as a polygon inside a collection and is
 * redrawn here at a screen size — @see screenSizedArrowHead. Everything else in
 * the collection is line work.
 *
 * `label` is the doctrinal letter: "F" for the mission task, empty for the table
 * 5-19 obstacle effect, which is the same zigzag with no glyph. **Unlike the block
 * family this cuts no gap for it**, so an empty label simply draws nothing.
 */
export function arrowheadedLinePaint(label = ''): LinePaint {
    return (feature, context) => {
        const color = lineColorOf(feature);
        const dashPx = amplifierDash(feature);
        const members = paintGeometryMembers(feature.geometry);

        // The zigzag itself, which is also what the head is measured against.
        const line = members.find(m => m.type === 'LineString');
        const linePath = line?.type === 'LineString' ? line.coordinates : [];

        const paints: Paint[] = [];
        for (const member of members) {
            if (member.type === 'Polygon') {
                const head = screenSizedArrowHead(member.coordinates[0], linePath, context.resolution);
                if (head) {
                    paints.push({
                        geometry: {type: 'Polygon', coordinates: [head]},
                        fill: {color},
                        stroke: {color, widthPx: LINE_WIDTH()},
                    });
                }
            } else {
                paints.push({geometry: member, stroke: {color, widthPx: LINE_WIDTH(), dashPx}});
            }
        }

        if (!label || linePath.length < 2) return paints;

        // The first segment runs from the line start to the first triangle's first
        // vertex, so its midpoint is a fixed feature of the geometry. Anchoring there
        // keeps the letter glued in place across zooms; the earlier `25 × resolution`
        // offset drifted as the zoom changed.
        const segStart = linePath[0];
        const segEnd = linePath[1];
        const anchor: ProjectedPosition = [(segStart[0] + segEnd[0]) / 2, (segStart[1] + segEnd[1]) / 2];

        // Rotation and scale come from the *full* line, so the letter is upright with
        // the graphic and its size tracks the user-drawn length.
        const start = linePath[0];
        const end = linePath[linePath.length - 1];
        const len = Math.hypot(end[0] - start[0], end[1] - start[1]);
        if (len === 0) return paints;

        // Sized to render ~22.5 px tall at the 145 px minimum line length, matching the
        // block family's label at *its* minimum — and capped at the same ceiling, so a
        // long fix does not grow an outsized letter.
        const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        const K = 0.1;
        const scale = Math.min(maxGraphicLabelScale(), (sizeFactor * K * (len / context.resolution)) / BASE_FONT_SIZE_PX);

        paints.push({
            geometry: {type: 'Point', coordinates: anchor},
            text: {
                text: label,
                font: RATIO_LOCKED_LABEL_FONT,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                rotation: uprightRotation(start, end),
                align: 'center',
                baseline: 'middle',
                scale,
            },
        });
        return paints;
    };
}
