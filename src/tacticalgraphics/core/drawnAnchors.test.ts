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

import {allowedGestures,TacticalGraphicName, drawnAnchorFrame, drawnAnchors, listTacticalGraphicNames, rotationAnchor,
    rotationPivot, usesDrawnAnchors} from '../index';

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
        /*
         * **A symbol that does not turn reads back at zero, and that is the round trip.**
         * 271204's bars lean at a fixed 45 degrees — an X turned is a different mark — so it
         * refuses the rotation it was written with rather than carrying it. The rule looked
         * universal while every member of this family could turn. @see allowedGestures
         */
        expect(frame!.rotation ?? 0).toBeCloseTo(allowedGestures(name).rotate ? 25 : 0, 0);
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

/**
 * # What a resize measures from
 *
 * `rotationAnchor` pivots a drawn line about its **first vertex**, which is right for a
 * line — that is where the user started it — and wrong for these, whose base is not a
 * drawn line at all: Turn's first anchor is the tip of its arrow. A resize measured from
 * there starts with almost no distance and multiplies what little it has, so the same
 * 1.5x drag took the symbol from 240 px to 567 where OpenLayers took it to 357.
 *
 * OpenLayers has always pivoted them about the centre — `MissionTaskController.getCenter`
 * says so — so this is the rule moving to where both engines can read it.
 */
describe('the point these turn about', () => {
    const family = listTacticalGraphicNames()
        .filter((name): name is TacticalGraphicName => name in TacticalGraphicName)
        .filter(usesDrawnAnchors);

    /*
     * **Two doctrinal exceptions, not one.** 141700 turns about point 2 and 271204 about
     * point 3; each is documented beside its own assertion below. Everything else in the
     * family turns about the centre its anchors describe.
     */
    const PIVOTS_ELSEWHERE = [TacticalGraphicName.Ambush, TacticalGraphicName.RoadblockCompleteExecuted];

    it.each(family.filter(n => !PIVOTS_ELSEWHERE.includes(n)))(
        'is the centre of %s, not its first anchor',
        name => {
            const centre: [number, number] = [7, 45];
            const anchors = drawnAnchors(name, {center: centre, size: 60_000, rotation: 15})!;
            const geometry = {type: 'LineString', coordinates: anchors};

            const pivot = rotationAnchor(geometry, name);
            expect(pivot[0]).toBeCloseTo(centre[0], 2);
            expect(pivot[1]).toBeCloseTo(centre[1], 2);

            // And without the name it is the old rule, which is what every ordinary drawn
            // line still gets.
            expect(rotationAnchor(geometry)).toEqual(anchors[0]);
        },
    );

    /**
     * **271204 turns and scales about point 3 — the crossing.**
     *
     * Its points 1 and 2 are the two extremes of the symbol's own 45-degree axis, so their
     * midpoint *is* the figure's centre — which makes the centre rule look right and be
     * wrong. The crossing is the thing on the ground the symbol marks and the one anchor an
     * operator places against a road; scaling about the centre would slide it off.
     * (User's call, 2026-09-07: "resize and rotate icons can use point 3 as pivot".)
     */
    it('is point 3 for RoadblockCompleteExecuted, the crossing it marks', () => {
        const anchors = drawnAnchors(TacticalGraphicName.RoadblockCompleteExecuted, {center: [7, 45], size: 60_000})!;
        const geometry = {type: 'LineString', coordinates: anchors};
        expect(rotationAnchor(geometry, TacticalGraphicName.RoadblockCompleteExecuted)).toEqual(anchors[2]);
        expect(rotationPivot(geometry, TacticalGraphicName.RoadblockCompleteExecuted)).toEqual(anchors[2]);
        // Not the centre, which is where points 1 and 2 put their midpoint — the distinction
        // this exception exists for.
        expect(rotationAnchor(geometry, TacticalGraphicName.RoadblockCompleteExecuted)[0]).not.toBeCloseTo(7, 2);
    });

    /**
     * **Ambush is the exception, and it is a doctrinal one.**
     *
     * 141700's back "encompasses the ambush position" while "the arrowhead typically points
     * at the target", so the thing an operator turns is the aim and the thing that must stay
     * on the ground is the position. Point 2 is an end of that back. Turning about the
     * frame's centre swung the ambush itself off the place it was put. (User's call,
     * 2026-09-05.)
     */
    it('is point 2 for Ambush, which is where the position sits', () => {
        const centre: [number, number] = [7, 45];
        const anchors = drawnAnchors(TacticalGraphicName.Ambush, {center: centre, size: 60_000, rotation: 15})!;
        const geometry = {type: 'LineString', coordinates: anchors};

        expect(rotationAnchor(geometry, TacticalGraphicName.Ambush)).toEqual(anchors[1]);
        // Not the centre, which is what the rest of the family uses.
        expect(rotationAnchor(geometry, TacticalGraphicName.Ambush)[0]).not.toBeCloseTo(centre[0], 2);
    });

    it('leaves an ordinary drawn line on its first vertex', () => {
        const line = {type: 'LineString', coordinates: [[0, 0], [4, 0]]};
        expect(rotationAnchor(line, TacticalGraphicName.PhaseLine)).toEqual([0, 0]);
    });
});
