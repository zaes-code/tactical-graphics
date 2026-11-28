/**
 * # A floor stated in pixels is spent at the resolution the screen is at now
 *
 * `minimumFirstSegmentPx` names three graphics — 271400's aviation direction of attack and
 * the two Fix tasks — that bake a mark near the start of their line and need room for it.
 * Both engines read the number. They disagreed about what it was worth, in two ways, and the
 * handle sweep measured both:
 *
 * - **A stale resolution.** The holder keeps the resolution it was *drawn* at, which is
 *   deliberate for a decoration's size and wrong for a screen rule the user may have zoomed
 *   away from. MapLibre reads the live figure on every drag. Dragging a Fix at 1,200 m per
 *   pixel, the 145 px floor did not bite here and did there: 21.8 km between the two far ends.
 * - **A holder with no floor at all.** `MovementGraphicBase` implements the same interface as
 *   `LineGraphicBase` rather than extending it, so 271400 — the only one of the three whose
 *   grip is not a vertex drag on this engine — was floored on MapLibre and on nothing here.
 *
 * The floor still applies only while a gesture is authoring the shape. A restore replays a
 * stored base and must not have it stretched, which is the rule `shapingFromGesture` carries.
 */
import Feature from 'ol/Feature';
import {LineString} from 'ol/geom';
import {TacticalGraphicName, minimumFirstSegmentPx} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';

/** What the graphic was drawn at, and what the screen is at now. Deliberately different. */
const DRAWN_AT = 300;
const LIVE = 1200;

const firstSegmentOf = (c: LineGraphicController): number => {
    const [p0, p1] = (c.graphic.base.getGeometry() as LineString).getCoordinates();
    return Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
};

describe('the first-segment floor uses the live resolution', () => {
    it.each([TacticalGraphicName.Fix, TacticalGraphicName.TacticalFix])('%s', name => {
        const c = getController(name, DRAWN_AT) as LineGraphicController;
        c.setBaseFeature(new Feature(new LineString([[0, 0], [200_000, 0]])) as never);

        c.setGestureResolution(LIVE);
        c.handleVertexDrag!(0, [190_000, 0]);
        c.endGesture();

        // The drag left ten kilometres of segment; the floor is 145 px at 1,200 m each.
        expect(firstSegmentOf(c)).toBeCloseTo(minimumFirstSegmentPx(name)! * LIVE, -2);
    });

    it('leaves the drawn-at resolution in charge outside a gesture', () => {
        const c = getController(TacticalGraphicName.Fix, DRAWN_AT) as LineGraphicController;
        c.setBaseFeature(new Feature(new LineString([[0, 0], [200_000, 0]])) as never);
        c.handleVertexDrag!(0, [190_000, 0]);
        c.endGesture();
        // 145 px at the drawn 300 m each, not at 1,200.
        expect(firstSegmentOf(c)).toBeCloseTo(minimumFirstSegmentPx(TacticalGraphicName.Fix)! * DRAWN_AT, -2);
    });
});

describe('271400 has a floor at all', () => {
    const NAME = TacticalGraphicName.AviationDirectionOfAttack;

    it('floors a short first segment while the shape is being authored', () => {
        const c = getController(NAME, DRAWN_AT) as LineGraphicController;
        const holder = c.graphic as unknown as {shapingFromGesture?: boolean};
        c.setBaseFeature(new Feature(new LineString([[0, 0], [40_000, 0], [200_000, 0]])) as never);

        c.setGestureResolution(LIVE);
        holder.shapingFromGesture = true;
        c.setBaseFeature(new Feature(new LineString([[0, 0], [10_000, 0], [200_000, 0]])) as never);
        holder.shapingFromGesture = false;
        c.setGestureResolution(undefined);

        const coords = (c.graphic.base.getGeometry() as LineString).getCoordinates();
        expect(firstSegmentOf(c)).toBeCloseTo(minimumFirstSegmentPx(NAME)! * LIVE, -2);
        // The run past the first segment shifted with it rather than being stretched.
        expect(coords[2][0] - coords[1][0]).toBeCloseTo(190_000, -2);
    });

    it('leaves a restored base exactly as it was filed', () => {
        const c = getController(NAME, DRAWN_AT) as LineGraphicController;
        c.setGestureResolution(LIVE);
        c.setBaseFeature(new Feature(new LineString([[0, 0], [10_000, 0], [200_000, 0]])) as never);
        expect(firstSegmentOf(c)).toBeCloseTo(10_000, -2);
    });
});
