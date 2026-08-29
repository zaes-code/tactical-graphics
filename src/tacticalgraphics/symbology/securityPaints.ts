import {labelColorOf, lineColorOf} from './paintFunctions';
/**
 * # The security operations
 *
 * Cover, guard and screen: a pair of arrows either side of a center symbol, with
 * the operation's letter at the outer end of each arm.
 *
 * **Only the line work and the letters are here.** The center symbol is injected
 * by the host — nothing in this package names milsymbol — so a renderer draws it
 * through the registered provider or draws nothing. @see conventions.md
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {BASE_FONT_SIZE_PX, getDefaultLabelSize} from '../core/config';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, getLabelHaloColor} from '../core/symbology';
import {capLabelToGraphic} from './labelFit';
import {MAX_SYMBOL_SIZE_PX, resolveSecuritySymbol, securitySymbolSidc} from '../core/securitySymbol';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import type {GraphicLabels} from '../core/render';

type SecurityPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * The letter at the end of one arm — C, G or S.
 *
 * ## The size is constant, deliberately not `labelScale`
 *
 * That helper returns `sizeFactor × (drawingResolution / resolution)`, which
 * holds a label at a constant size in *map* units — so it doubles on screen every
 * time you zoom in a level. Right for a label belonging to geometry drawn in
 * meters; wrong here, because every size in a security operation is a pixel
 * constant × the resolution and the whole graphic holds its on-screen size across
 * a zoom. A label that grew while its arrows stayed put was the odd one out.
 *
 * This is exactly what the zoom-anchored scale yields at the moment of drawing,
 * so the letter keeps the size it always had — it just stops growing from there.
 *
 * ## The glyph does not rotate with the graphic
 *
 * Rotating it turned the letter upside down as soon as the user swung the graphic
 * past the horizontal, which is what an amplifier must never do: a label is read
 * by the operator, not by the symbol. The letter still travels with its own arm,
 * because the label *anchor* is rotated about the center by the holder. Position
 * follows the graphic; orientation follows the screen.
 *
 * `rotation` is therefore spent only on the sub-pixel nudge that keeps the two
 * letters symmetric about the center.
 */
export function securityOperationLabelPaint(
    label: string,
    rotation = 0,
    position: 'left' | 'right' = 'left',
): SecurityPaint {
    return feature => {
        const orientation = position === 'left' ? 1 : -1;
        const scale = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        const distance = 0.5 * orientation;

        /*
         * **One letter per anchor.** The generator publishes both inner ends as a
         * `MultiPoint` now that the symbol is drawn rather than placed, so one call paints
         * the pair — where the badge had a feature per side and the holder called this
         * twice. A single `Point` still draws one letter, which is what the old holder
         * hands it and what an empty geometry collection falls back to.
         */
        const anchors: ProjectedPosition[] =
            feature.geometry.type === 'MultiPoint'
                ? (feature.geometry.coordinates as ProjectedPosition[])
                : feature.geometry.type === 'Point'
                    ? [feature.geometry.coordinates as ProjectedPosition]
                    : [[0, 0]];

        return anchors.map(at => ({
            geometry: {type: 'Point' as const, coordinates: at},
            text: {
                text: label,
                font: fontStyle,
                fill: labelColorOf(feature),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                baseline: 'middle' as const,
                offsetXPx: Math.cos(rotation) * distance,
                offsetYPx: Math.sin(rotation) * distance,
                scale,
            },
        }));
    };
}

/**
 * Share of the gap between the two arms that the host's unit symbol fills.
 *
 * **Measured off the plate.** APP-06 342201's Template sets the unit box across a little
 * under half the gap between the two letters, with each letter against its own arm. The
 * badge's own proportion — 25 px in a 76 px gap — was a third, but that gap was twice as
 * wide as the plate's; keeping the share the same while the gap came in would have shrunk
 * the symbol rather than bringing the lines closer to it.
 */
const SYMBOL_GAP_SHARE = 0.46;

/**
 * The host-supplied unit symbol at the centre, placed and sized — or nothing.
 *
 * The same seam as the escort and the follow tasks: nothing here imports milsymbol, a host
 * registers a provider, and registering nothing draws an empty centre.
 *
 * **Sized from the graphic, capped like the others.** These are drawn in metres now, so the
 * gap grows as the map is zoomed into and a symbol that kept pace with it would be a badge
 * the size of a hand. `MAX_SYMBOL_SIZE_PX` is the ceiling the escort and the follow tasks
 * already stop at. There is no floor: this symbol sits *in* the graphic, so one too small to
 * read means a graphic too small to see. @see capSymbolPx in followTaskPaints
 */
export function securityOperationSymbol(
    feature: PaintFeature,
    context: PaintContext,
): {at: ProjectedPosition; sizePx: number; src: string} | undefined {
    const centre = securityOperationCentre(feature);
    if (!centre) return undefined;

    const hostility = (feature.properties.hostility as TacticalGraphicHostility) ?? TacticalGraphicHostility.pending;
    const wantedPx = Math.min((centre.gapMetres * SYMBOL_GAP_SHARE) / context.resolution, MAX_SYMBOL_SIZE_PX);
    if (!(wantedPx > 0)) return undefined;

    const image = resolveSecuritySymbol({
        name: feature.properties.name as TacticalGraphicName,
        graphicId: ((feature.properties as unknown as Record<string, unknown>).symbolId as string | undefined) || undefined,
        hostility,
        sidc: securitySymbolSidc(hostility),
        sizePx: wantedPx,
        labels: feature.properties as unknown as GraphicLabels,
    });
    if (!image) return undefined;
    return {at: centre.at, sizePx: image.sizePx ?? wantedPx, src: image.src};
}

/**
 * The middle of a security operation, and how much room there is there.
 *
 * Read from the **letters**, which the generator sets at the inner end of each arm: their
 * midpoint is the centre and the run between them is the gap. Deriving it from the drawn
 * base instead would mean repeating the generator's symmetry in a second place, which is
 * how a symbol ends up not sitting in its own hole.
 */
export function securityOperationCentre(
    feature: PaintFeature,
): {at: ProjectedPosition; gapMetres: number; inner: [ProjectedPosition, ProjectedPosition]} | undefined {
    const points = innerEnds(feature);
    if (!points) return undefined;

    const [a, b] = points;
    return {
        at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        gapMetres: Math.hypot(b[0] - a[0], b[1] - a[1]),
        inner: points,
    };
}

/**
 * The two arms' inner ends, which is where the letters go and what the gap is measured
 * between.
 *
 * **Taken from the drawn line work.** The generator emits `[left arm, left head, right arm,
 * right head]` and each arm starts at its inner end, so the pair is there in the geometry
 * every renderer already has. `LineGraphicBase` keeps the graphic and the handles and
 * discards the generator's label points, so reading them from the labels would have worked
 * on one engine and not the other — and the two ends of the gap are exactly the sort of
 * fact that must not be worked out twice.
 *
 * A bare `MultiPoint` is still accepted: that is what the label feature carries, and what a
 * consumer calling the generator directly gets back.
 */
function innerEnds(feature: PaintFeature): [ProjectedPosition, ProjectedPosition] | undefined {
    const geometry = feature.geometry;
    if (geometry.type === 'MultiPoint') {
        const points = geometry.coordinates as ProjectedPosition[];
        return points.length >= 2 ? [points[0], points[points.length - 1]] : undefined;
    }
    if (geometry.type === 'MultiLineString') {
        const lines = geometry.coordinates as ProjectedPosition[][];
        // Members 0 and 2 are the arms; 1 and 3 are their arrowheads.
        if (lines.length >= 3 && lines[0]?.length && lines[2]?.length) return [lines[0][0], lines[2][0]];
    }
    return undefined;
}

/**
 * A security operation's line work and its two letters.
 *
 * One paint, because the letters are placed from the line work: they belong to the arms'
 * inner ends and there is no separate anchor to hang them on once the graphic is drawn
 * rather than placed.
 */
export function securityOperationPaint(label: string): SecurityPaint {
    return (feature, context) => {
        const paints: Paint[] = [{
            geometry: feature.geometry as Paint['geometry'],
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        }];

        const centre = securityOperationCentre(feature);
        if (!centre) return paints;

        const scale = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        for (const at of centre.inner) {
            paints.push({
                geometry: {type: 'Point', coordinates: at},
                text: {
                    text: label,
                    font: fontStyle,
                    fill: labelColorOf(feature),
                    halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                    align: 'center',
                    baseline: 'middle',
                    scale: capLabelToGraphic(scale, feature, context),
                },
            });
        }
        return paints;
    };
}
