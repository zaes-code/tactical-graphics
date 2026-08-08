/**
 * # The security operations
 *
 * Cover, guard and screen: a pair of arrows either side of a centre symbol, with
 * the operation's letter at the outer end of each arm.
 *
 * **Only the line work and the letters are here.** The centre symbol is injected
 * by the host — nothing in this package names milsymbol — so a renderer draws it
 * through the registered provider or draws nothing. @see conventions.md
 */

import type {Paint, PaintContext, PaintFeature} from '../core/paint';
import {BASE_FONT_SIZE_PX, getDefaultLabelSize} from '../core/config';
import {HALO_WIDTH, fontStyle, getLabelFillColor, getLabelHaloColor} from '../core/symbology';

type SecurityPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * The letter at the end of one arm — C, G or S.
 *
 * ## The size is constant, deliberately not `labelScale`
 *
 * That helper returns `sizeFactor × (drawingResolution / resolution)`, which
 * holds a label at a constant size in *map* units — so it doubles on screen every
 * time you zoom in a level. Right for a label belonging to geometry drawn in
 * metres; wrong here, because every size in a security operation is a pixel
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
 * because the label *anchor* is rotated about the centre by the holder. Position
 * follows the graphic; orientation follows the screen.
 *
 * `rotation` is therefore spent only on the sub-pixel nudge that keeps the two
 * letters symmetric about the centre.
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

        return [{
            geometry: feature.geometry.type === 'GeometryCollection'
                ? {type: 'Point', coordinates: [0, 0]}
                : feature.geometry,
            text: {
                text: label,
                font: fontStyle,
                fill: getLabelFillColor(),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                baseline: 'middle',
                offsetXPx: Math.cos(rotation) * distance,
                offsetYPx: Math.sin(rotation) * distance,
                scale,
            },
        }];
    };
}
