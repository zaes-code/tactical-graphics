import type {Position} from 'geojson';
import {TacticalGraphicName} from './type';
import {baseVertexCount} from './handles';
import {drawClickCount} from './symbology';
import {normalizeDrawnBase} from './drawnBase';

/**
 * Whether a draw holding these placed points may finish.
 *
 * **One rule, read by both engines.** It lived privately in MapLibre's interactions as
 * `sketchIsComplete`, and OpenLayers had none: its `Draw` interaction ends a line on a
 * double-click once it has two points, whatever the symbol needs. So a demolition obstacle
 * or roadblock drawn with two clicks and a double-click stored two points on OpenLayers,
 * and its third grip, the side, had no vertex behind it and did nothing when dragged.
 * MapLibre waited for the third click. (User's report, 2026-09-21.)
 *
 * - Where the library states a click count, that many clicks. `DRAW_CLICKS` exists to say
 *   exactly this, and it differs from the stored count for envelopment and the two hairpins,
 *   each drawn with three clicks and stored as four points.
 * - Otherwise, once the points normalize to the stored vertex count. That is what lets a
 *   fields of fire end at two: its second leg follows from them.
 * - A graphic with no fixed count needs two.
 *
 * `sketch` is lon/lat, the placed points only, never the floating one under the cursor.
 */
export function drawIsComplete(name: TacticalGraphicName, sketch: Position[]): boolean {
    const clicks = drawClickCount(name);
    if (clicks !== undefined) return sketch.length >= clicks;
    const wanted = baseVertexCount(name);
    return wanted === undefined ? sketch.length >= 2 : normalizeDrawnBase(name, sketch).length === wanted;
}
