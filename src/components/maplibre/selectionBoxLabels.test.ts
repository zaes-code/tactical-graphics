/**
 * # The box goes round what the user sees, labels included
 *
 * The edit chrome is placed on the selection box, so the two engines have to measure the
 * same rectangle — and OpenLayers measures every non-handle feature the controller owns,
 * a designation anchored clear of the shape among them. Ambush's sits 9 px past its
 * arrowhead, so MapLibre's box — the line work alone — came out 63 px wide against 72.
 *
 * That is not only a box that looks different. The affordances sit on its corners, so the
 * *same* drag started from a different place and meant a different gesture: on the sweep's
 * own fixture, 16 degrees of rotation and 14% of scale apart, which is what
 * `compare:engines` had been reporting as `Ambush rotate.rotation 269.35 vs -74.93`.
 *
 * **The trap is `labels.bounds`.** That field deliberately carries the *graphic's* extent,
 * because an area label needs the shape's box to fit itself inside — so unioning it is a
 * no-op, and looked like a fix. The label geometry's own extent is the thing.
 */

import {TacticalGraphicName, boundsOf, drawnAnchors, unionBounds} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from './maplibreAdapter';

const RES = 6_000;
const CENTRE: [number, number] = [12, 42];

const ambush = () => buildTacticalGraphic(
    TacticalGraphicName.Ambush,
    {type: 'LineString', coordinates: drawnAnchors(TacticalGraphicName.Ambush, {center: CENTRE, size: 148_989, rotation: 190})!},
    {},
    RES,
)!;

describe('what a selection box has to measure', () => {
    it('is wider than the line work when a label hangs outside it', () => {
        const graphic = ambush();
        const lineWork = graphic.graphic.bounds!;
        const labels = boundsOf(graphic.labels!.geometry);

        expect(labels).toBeDefined();
        const together = unionBounds(lineWork, labels)!;
        expect(together.maxX - together.minX).toBeGreaterThan(lineWork.maxX - lineWork.minX);
    });

    /**
     * The field that looks like the answer and is not: it is the graphic's own extent,
     * put there for the area labels to fit themselves inside.
     */
    it('cannot come from `labels.bounds`, which is the graphic\'s box', () => {
        const graphic = ambush();
        expect(graphic.labels!.bounds).toEqual(graphic.graphic.bounds);
        expect(unionBounds(graphic.graphic.bounds, graphic.labels!.bounds)).toEqual(graphic.graphic.bounds);
    });

    /** A graphic whose designation sits inside it is unaffected either way. */
    it('leaves a graphic with an interior label alone', () => {
        const secure = buildTacticalGraphic(
            TacticalGraphicName.Secure,
            {type: 'Point', coordinates: CENTRE},
            {radius: 90_000, rotation: 0},
            RES,
        )!;
        const lineWork = secure.graphic.bounds!;
        const together = unionBounds(lineWork, boundsOf(secure.labels?.geometry))!;
        expect(together).toEqual(lineWork);
    });
});
