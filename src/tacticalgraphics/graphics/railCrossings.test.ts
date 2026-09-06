/**
 * # The two-rail crossings, placed instead of offset
 *
 * Five graphics draw the same figure — two parallel bars with a gap between them — and all
 * five were a *drawn centreline* with the bars offset by a `radius` amplifier. So the one
 * dimension the plates give an anchor point to was a number nobody could see and nowhere the
 * operator could put it.
 *
 * > **271100 bridge / 271300 assault crossing.** This symbol requires four points. Points 1
 * > and 2 define one side of the gap and points 3 and 4 define the opposite side of the gap.
 *
 * 271500 ford easy and 271600 ford difficult carry no Draw Rules text of their own — their
 * rows inherit — but their Templates letter it: `PT 1` and `PT 2` at the ends of one bar and
 * `PT 3` on the other. FM's gap shares the bridge's generator and its picture, so it follows.
 *
 * All five are drawn with **three clicks**: one bar end to end, then a point stating how far
 * across the other sits. Where a plate numbers a fourth, it is derived — the bars are parallel
 * and the same length, so it carries no decision. (User's call, 2026-09-06: "points 1, 2 for
 * length and point 3 to determine the parallel line […] just have the 4th point be
 * auto-calculated".)
 */
import type {Feature, MultiLineString, MultiPoint, Position} from 'geojson';
import * as turf from '../core/turf';
import {renderTacticalGraphic} from '../core/render';
import {normalizeDrawnBase} from '../core/drawnBase';
import {drawClickCount} from '../core/symbology';
import {baseVertexCount, carriesSeparationInBase} from '../core/handles';
import {parallelRailAnchors, parallelRailFrame} from '../core/anchors';
import {TacticalGraphicName} from '../core/type';

const FAMILY = [
    TacticalGraphicName.Bridge,
    TacticalGraphicName.Gap,
    TacticalGraphicName.AssaultCrossing,
    TacticalGraphicName.FordEasy,
    TacticalGraphicName.FordDifficult,
];

/** One bar west to east, then a click across it — the three the operator makes. */
const CLICKS: Position[] = [[-1, 20], [1, 20], [1, 20.6]];

const meters = (a: Position, b: Position) => turf.distance(turf.point(a), turf.point(b), {units: 'meters'});
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const anchors = (name: TacticalGraphicName, clicks: Position[]) => normalizeDrawnBase(name, clicks);

describe('the two-rail crossings place their separation', () => {
    it.each(FAMILY.map(n => [String(n), n] as const))('%s is drawn in three clicks', (_label, name) => {
        // `DRAW_CLICKS` only names a graphic whose click count *differs* from what it stores,
        // so the fords are absent from it by being three and three. @see drawClickCount
        expect(drawClickCount(name) ?? baseVertexCount(name)).toBe(3);
        // …and stores what its own plate numbers: four for the two that name four, three for
        // the fords, whose Template letters three.
        expect(anchors(name, CLICKS)).toHaveLength(baseVertexCount(name)!);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s keeps the bar it was given, and squares the click across it',
        (_label, name) => {
            const [one, two, three] = anchors(name, CLICKS);
            // Points 1 and 2 are the bar, end to end, exactly as placed.
            expect(meters(one, CLICKS[0])).toBeLessThan(1);
            expect(meters(two, CLICKS[1])).toBeLessThan(1);
            // Point 3 sits square across from point 2 — the plate's own PT 3 leader lands on
            // the far bar, and an along-bar offset is a thing two parallel bars cannot draw.
            const along = turf.bearing(turf.point(one), turf.point(two));
            const across = turf.bearing(turf.point(two), turf.point(three));
            expect(Math.abs(gap(along, across) - 90)).toBeLessThan(0.5);
        },
    );

    it.each(FAMILY.filter(n => baseVertexCount(n) === 4).map(n => [String(n), n] as const))(
        '%s derives its fourth point so the bars are parallel and equal',
        (_label, name) => {
            const [one, two, three, four] = anchors(name, CLICKS);
            expect(meters(three, four)).toBeCloseTo(meters(one, two), -1);
            // Same direction, not opposed — this is the hairpin's mirror image, whose legs
            // run the other way. @see hairpinFourthPoint
            const first = turf.bearing(turf.point(one), turf.point(two));
            const second = turf.bearing(turf.point(four), turf.point(three));
            expect(gap(first, second)).toBeLessThan(1);
        },
    );

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s files no width, because its separation is a point now',
        (_label, name) => {
            // A `width` beside the anchor points would be the same fact twice, which is what
            // this predicate is for. @see carriesSeparationInBase
            expect(carriesSeparationInBase(name)).toBe(true);
        },
    );

    it.each(FAMILY.map(n => [String(n), n] as const))('%s grips every point it stores', (_label, name) => {
        const settled = anchors(name, CLICKS);
        const grips = (renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name}},
            geometry: {type: 'LineString', coordinates: settled},
        } as Feature).handles.geometry as MultiPoint).coordinates;
        expect(grips).toHaveLength(settled.length);
        grips.forEach((g, i) => expect(meters(g, settled[i])).toBeLessThan(1));
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s draws its bars off the points', (_label, name) => {
        const settled = anchors(name, CLICKS);
        const frame = parallelRailFrame(settled)!;
        // The half-separation the generator draws with is half the gap the operator stated.
        expect(frame.half * 2).toBeCloseTo(meters(settled[1], settled[2]), -1);

        const drawn = renderTacticalGraphic({
            type: 'Feature',
            properties: {tacticalGraphic: {name}},
            geometry: {type: 'LineString', coordinates: settled},
        } as Feature).graphic.geometry as MultiLineString;
        expect(drawn.coordinates.length).toBeGreaterThan(0);
    });

    it.each(FAMILY.map(n => [String(n), n] as const))('%s is idempotent', (_label, name) => {
        // It runs on every render, so a base it has already settled must come back unchanged
        // or an edit walks the symbol.
        const settled = anchors(name, CLICKS);
        anchors(name, settled).forEach((p, i) => expect(meters(p, settled[i])).toBeLessThan(1));
    });

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s still draws a centreline saved with a radius',
        (_label, name) => {
            // Every one of these saved before 2026-09-06 is two points and an amplifier, and
            // keeps drawing as it did until an edit grows its third point.
            const legacy = renderTacticalGraphic({
                type: 'Feature',
                properties: {tacticalGraphic: {name, radius: 40_000}},
                geometry: {type: 'LineString', coordinates: [CLICKS[0], CLICKS[1]]},
            } as Feature).graphic.geometry as MultiLineString;
            expect(legacy.coordinates.length).toBeGreaterThan(0);
        },
    );

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s previews with a bar on the line being dragged, not straddling it',
        (_label, name) => {
            /*
             * **Two clicks are one bar.** Read as a centreline, the two bars straddled the
             * cursor and the operator was dragging along a line the symbol does not contain.
             * (User's report, 2026-09-06: "when drawing it, it seems we're actually drawing
             * via the invisible middle line. The drawing cursor should be along points 1,2".)
             *
             * A supplied `radius` is ignored here on purpose: mid-draw it is the holder's own
             * screen default, not a saved separation, and honouring it would put the preview
             * at a width the operator never asked for. @see parallelRailAnchors
             */
            const bar: Position[] = [CLICKS[0], CLICKS[1]];
            const drawn = renderTacticalGraphic({
                type: 'Feature',
                properties: {tacticalGraphic: {name, radius: 40_000}},
                geometry: {type: 'LineString', coordinates: bar},
            } as Feature).graphic.geometry as MultiLineString;

            const line = turf.lineString(bar);
            const offsets = drawn.coordinates
                .flat()
                .map(c => turf.pointToLineDistance(turf.point(c as Position), line, {units: 'meters'}));
            // One bar lies on the line the operator is dragging…
            expect(Math.min(...offsets)).toBeLessThan(meters(bar[0], bar[1]) / 100);
            // …and the other previews clear of it.
            expect(Math.max(...offsets)).toBeGreaterThan(meters(bar[0], bar[1]) / 10);
        },
    );

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s previews its second bar above the one being drawn, left to right',
        (_label, name) => {
            /*
             * The Templates letter `PT 1` and `PT 2` on the **bottom** bar and `PT 3` on the
             * top, so a west-to-east drag should leave the bar under the cursor and preview
             * the other above it. The default sat the other way round. (User's report,
             * 2026-09-06.) The third click still chooses the side; this is only the start.
             */
            const westToEast: Position[] = [[-2, 20], [2, 20]];
            const drawn = renderTacticalGraphic({
                type: 'Feature',
                properties: {tacticalGraphic: {name}},
                geometry: {type: 'LineString', coordinates: westToEast},
            } as Feature).graphic.geometry as MultiLineString;

            // **Measured on the centreline, not on the ink.** A bridge's bars are crowbars,
            // whose ticks stand off the rail — so its lowest ink sits below the bar it belongs
            // to and says nothing about which side the *other* bar went. The frame's centre
            // lies between the two, so it is above the drawn bar exactly when the second one
            // is. @see parallelRailFrame
            const frame = parallelRailFrame(parallelRailAnchors(westToEast, 3)!)!;
            expect(frame.centre[0][1]).toBeGreaterThan(20);
            expect(frame.centre[1][1]).toBeGreaterThan(20);
            void drawn;
        },
    );
});
