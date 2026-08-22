/**
 * # One statement of where a symbol's anchor points go
 *
 * `DRAWN_ANCHOR_GRAPHICS` are described by points rather than by a dropped centre, and no
 * two lay their points out the same way. That layout lived in the OpenLayers holders —
 * one `anchorPoints()` override each — so MapLibre could not write one: it stored the raw
 * clicks, and each generator's reader made of them what it would. For Turn that meant the
 * two clicks became the ends of the chord where OpenLayers reads them as centre and edge,
 * so the same gesture drew 240 x 31 px on one engine and 120 x 24 on the other.
 *
 * What is pinned here is the **round trip**, because that is the property both engines
 * rely on: points written from a frame have to read back as the same frame, or an edit
 * would drift the symbol every time it was touched.
 */

import {TacticalGraphicName, drawnAnchorFrame, drawnAnchors, listTacticalGraphicNames, usesDrawnAnchors} from '../index';

const CENTER: [number, number] = [12, 34];
const SIZE = 40_000;

/** Every name the family covers, so a new member cannot be added without a layout. */
const family = listTacticalGraphicNames()
    .filter((name): name is TacticalGraphicName => name in TacticalGraphicName)
    .filter(usesDrawnAnchors);

describe('drawnAnchors', () => {
    it('covers every graphic that says it is drawn from anchors', () => {
        expect(family.length).toBeGreaterThan(0);
        for (const name of family) {
            const anchors = drawnAnchors(name, {center: CENTER, size: SIZE, rotation: 20});
            expect(anchors).toBeDefined();
            expect(anchors!.length).toBeGreaterThanOrEqual(2);
            for (const [lon, lat] of anchors!) {
                expect(Number.isFinite(lon)).toBe(true);
                expect(Number.isFinite(lat)).toBe(true);
            }
        }
    });

    it('answers nothing for a graphic that is not one of them', () => {
        expect(drawnAnchors(TacticalGraphicName.PhaseLine, {center: CENTER, size: SIZE})).toBeUndefined();
        expect(drawnAnchorFrame(TacticalGraphicName.PhaseLine, [CENTER, [13, 34]])).toBeUndefined();
    });

    /** A click, not a drag: better to leave the symbol alone than snap it to nothing. */
    it('answers nothing for a size of zero', () => {
        expect(drawnAnchors(TacticalGraphicName.Turn, {center: CENTER, size: 0})).toBeUndefined();
    });
});

describe('the round trip', () => {
    it.each(family)('reads %s back as the frame it was written from', name => {
        const anchors = drawnAnchors(name, {center: CENTER, size: SIZE, rotation: 25});
        const frame = drawnAnchorFrame(name, anchors);

        expect(frame).toBeDefined();
        expect(frame!.center[0]).toBeCloseTo(CENTER[0], 3);
        expect(frame!.center[1]).toBeCloseTo(CENTER[1], 3);
        // Within a percent: every walk out and back is geodesic, and the readers recover
        // the centre from a chord rather than from the point it was spoked out of.
        expect(frame!.size / SIZE).toBeCloseTo(1, 1);
        expect(frame!.rotation ?? 0).toBeCloseTo(25, 0);
    });

    /**
     * The two that carry a curve have to carry it back, or a bend drag would be undone by
     * the very next edit — which is exactly what happened on MapLibre before the pair
     * existed: the number moved and the picture did not.
     */
    it.each([
        [TacticalGraphicName.Turn, 0.75],
        [TacticalGraphicName.Envelopment, 0.3],
    ])('carries %s\'s bend through the round trip', (name, bend) => {
        const anchors = drawnAnchors(name, {center: CENTER, size: SIZE, rotation: 0, bend});
        const frame = drawnAnchorFrame(name, anchors);
        expect(frame!.bend).toBeCloseTo(bend, 1);
    });

    /** Pursuit's hook hangs on the side it is told, and says so when read back. */
    it.each([true, false])('carries Pursuit\'s mirrored=%s', mirrored => {
        const anchors = drawnAnchors(TacticalGraphicName.Pursuit, {center: CENTER, size: SIZE, rotation: 0, mirrored});
        expect(drawnAnchorFrame(TacticalGraphicName.Pursuit, anchors)!.mirrored).toBe(mirrored);
    });
});
