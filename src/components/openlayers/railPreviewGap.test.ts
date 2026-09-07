/**
 * # The half-drawn crossing shows a 50-pixel gap, at every zoom and every bar length
 *
 * The two-rail crossings are three clicks: one bar end to end, then a point stating how far
 * across the other sits. Between the first click and the third the operator is dragging a bar
 * with nothing yet said about the gap, so the preview has to invent one — and it invented a
 * *share of the bar*, which meant a long crossing previewed as a wide corridor and a short one
 * as a hairline. The figure changed shape while it was being dragged and told the operator
 * nothing about the symbol.
 *
 * > "while drawing can we lock the parallel line to a distance of 50px between click 1 and 2"
 * > — user, 2026-09-06
 *
 * A screen size, then, which is a renderer's fact: the library states the pixel count and takes
 * the gap in metres, because only a renderer knows what a pixel is worth. This suite pins the
 * conversion — the one place the two halves join, and the only place the number can go wrong
 * without anything else noticing. What the *generator* does with that gap is pinned in the
 * portable half. @see railCrossings.test.ts
 */
import {RAIL_PREVIEW_GAP_PX, TacticalGraphicName, groundLength} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

const FAMILY = [
    TacticalGraphicName.Bridge,
    TacticalGraphicName.Gap,
    TacticalGraphicName.AssaultCrossing,
    TacticalGraphicName.FordEasy,
    TacticalGraphicName.FordDifficult,
];

/**
 * The gap the holder is sized to preview, in ground metres.
 *
 * `offset` is the half-separation — the rails sit either side of the centreline the frame
 * derives — so the gap is twice it. **`getController`'s third argument is a latitude, not a
 * size**: it turns the resolution into `groundLength`, the ground metres one screen pixel
 * covers where the graphic is going, and that is what makes the answer below a pixel count.
 */
const previewGapMetres = (name: TacticalGraphicName, resolution: number, latitude: number) =>
    (getController(name, resolution, latitude) as unknown as {graphic: {offset: number}}).graphic.offset * 2;

/** The pixels that gap covers — the number the operator actually sees. */
const previewGapPixels = (name: TacticalGraphicName, resolution: number, latitude: number) =>
    previewGapMetres(name, resolution, latitude) / groundLength(resolution, latitude);

describe('a crossing previews its gap in screen pixels', () => {
    it.each(FAMILY.map(n => [String(n), n] as const))('%s sizes its preview to the pixel count', (_label, name) => {
        expect(previewGapPixels(name, 100, 0)).toBeCloseTo(RAIL_PREVIEW_GAP_PX, 6);
        expect(previewGapPixels(name, 100, 55)).toBeCloseTo(RAIL_PREVIEW_GAP_PX, 6);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s previews the same pixel gap at any zoom', (_label, name) => {
        // The point of stating it in pixels: eight times the ground metres per pixel is eight
        // times the metres and the same picture. A metre constant baked into the geometry would
        // have failed this, and that is what the share was — a constant of the *bar* instead.
        const near = previewGapMetres(name, 100, 40);
        const far = previewGapMetres(name, 800, 40);
        expect(far / near).toBeCloseTo(8, 6);
        expect(previewGapPixels(name, 800, 40)).toBeCloseTo(RAIL_PREVIEW_GAP_PX, 6);
    });

    it('states the pixel count once', () => {
        // The number the operator asked for. Both halves read it from here.
        expect(RAIL_PREVIEW_GAP_PX).toBe(50);
    });
});
