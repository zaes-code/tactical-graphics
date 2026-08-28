/**
 * # The air-coordinating zones' block stays inside the zone
 *
 * These eleven carry the longest label in the library: a doctrinal prefix over the
 * user's designation, a blank line, then up to four `MIN ALT: / MAX ALT: / TIME FROM: /
 * TIME TO:` columns. They are drawn as circles, rectangles and irregular areas like any
 * other zone.
 *
 * They were the one area family that opted *out* of the fit — `labelBlock` took a
 * `fitToPolygon` flag and this paint passed `false` — so the block ran 4.6x the width of
 * the shape at gallery scale: 57 px of text across a 12 px zone, measured on both
 * engines. The three airspace coordination areas beside them, built from the same
 * `labelBlock`, passed `true` and were fine, which is what made it look deliberate.
 */

import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {AltitudeDatum, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {airCoordinatingAreaLabelPaint} from './airPaints';

const FONT_PX = 16;

const context = (resolution: number): PaintContext => ({
    resolution,
    // Deliberately crude and deliberately *stated*: the assertion is about the fit, and a
    // real font metric would make the numbers unreproducible across machines.
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? String(FONT_PX));
        return text.length * px * 0.6;
    },
});

/** A square zone `half` metres about the origin, with the amplifiers filled in. */
const zone = (half: number): PaintFeature => ({
    geometry: {type: 'Point', coordinates: [0, 0]},
    properties: {
        name: TacticalGraphicName.RestrictedOperationsZone,
        designation: 'LONGNAME ALPHA',
        minAltitude: 500,
        maxAltitude: 20000,
        altitudeDatum: AltitudeDatum.aboveGroundLevel,
        startDate: '011200ZJAN25',
        endDate: '012359ZJAN25',
    },
    ring: [
        [-half, -half], [half, -half], [half, half], [-half, half], [-half, -half],
    ] as ProjectedPosition[],
});

/** The widest rendered line of the block, in screen pixels. */
function widestLinePx(feature: PaintFeature, ctx: PaintContext): number {
    const paints = airCoordinatingAreaLabelPaint(TacticalGraphicName.RestrictedOperationsZone)(feature, ctx);
    const text = paints.find(p => p.text)?.text;
    if (!text) return 0;
    const scale = text.scale ?? 1;
    return Math.max(...String(text.text).split('\n')
        .map(line => (line ? ctx.measureText(line, text.font) * scale : 0)));
}

/** The zone's own width, in screen pixels. */
const zoneWidthPx = (half: number, ctx: PaintContext) => (half * 2) / ctx.resolution;

beforeEach(() => resetTacticalGraphicsConfig());

describe('the altitude block is capped to the zone', () => {
    /**
     * Walks the zoom out. The block is zoom-anchored and the ground under it is not, so
     * every step makes the shape smaller against a label that wants to stay the same
     * size — which is exactly the condition the cap exists for.
     */
    it.each([1, 10, 100, 400, 1000, 4000])('fits at resolution %s m/px', resolution => {
        const ctx = context(resolution);
        const half = 60_000;
        const shape = zoneWidthPx(half, ctx);
        // Below a pixel there is nothing left to fit inside and nothing to look at.
        if (shape < 2) return;
        expect(widestLinePx(zone(half), ctx)).toBeLessThanOrEqual(shape);
    });

    it('shrinks the block rather than letting it overrun a small zone', () => {
        const ctx = context(400);
        const small = zone(20_000);
        const paints = airCoordinatingAreaLabelPaint(TacticalGraphicName.RestrictedOperationsZone)(small, ctx);
        const scale = paints.find(p => p.text)?.text?.scale ?? 1;
        expect(scale).toBeLessThan(1);
        expect(scale).toBeGreaterThan(0);
    });

    /**
     * **A ceiling, not a resize.** A zone with room to spare keeps whatever scale the
     * label system asked for — which is not 1, because these labels are zoom-scaled — so
     * the assertion is that the roomy zone is left larger than the cramped one rather
     * than that it lands on any particular number.
     */
    it('leaves a large zone alone while capping a small one', () => {
        const ctx = context(1);
        const scaleAt = (half: number) =>
            airCoordinatingAreaLabelPaint(TacticalGraphicName.RestrictedOperationsZone)(zone(half), ctx)
                .find(p => p.text)?.text?.scale ?? 0;

        const roomy = scaleAt(400_000);
        // 40 px across at this resolution, against a block that wants ~180 — cramped
        // enough that the cap has to bite.
        const cramped = scaleAt(20);
        expect(roomy).toBeGreaterThan(cramped);
        expect(cramped).toBeGreaterThan(0);
    });

    /**
     * No ring means no measurement, and a label that shrank to nothing because the shape
     * was never supplied would be worse than one that overran. @see fitLabelScale
     */
    it('does nothing when the renderer has stamped no ring', () => {
        const ctx = context(400);
        const {ring, ...noRing} = zone(20_000);
        void ring;
        const paints = airCoordinatingAreaLabelPaint(TacticalGraphicName.RestrictedOperationsZone)(noRing, ctx);
        expect(paints.find(p => p.text)?.text?.scale).toBeGreaterThan(0);
    });
});
