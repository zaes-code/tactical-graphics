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
import {normalizeDrawnBase, synthesizedBase} from '../core/drawnBase';
import {drawClickCount} from '../core/symbology';
import {baseVertexCount, carriesSeparationInBase} from '../core/handles';
import {RAIL_PREVIEW_GAP_PX, parallelRailAnchors, parallelRailFrame} from '../core/anchors';
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
            // keeps drawing as it did until an edit grows its third point. **`width`, not
            // `radius`** — the public schema's `radius` lands on the generators' `size`, and a
            // holder has always filed a separation as the full width. @see toGeneratorOptions
            const legacy = renderTacticalGraphic({
                type: 'Feature',
                properties: {tacticalGraphic: {name, width: 80_000}},
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
             * Stated with no separation amplifier at all, so this reads the fallback share and
             * measures only which line the bars sit against. What the gap *measures* when a
             * caller does state one is the next test. @see parallelRailAnchors
             */
            const bar: Position[] = [CLICKS[0], CLICKS[1]];
            const drawn = renderTacticalGraphic({
                type: 'Feature',
                properties: {tacticalGraphic: {name}},
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
        '%s previews its gap at the size the caller states, whatever the bar measures',
        (_label, name) => {
            /*
             * **A screen size, not a share of the bar.** The preview gap used to be a third of
             * whatever had been placed, so a long crossing previewed as a wide corridor and a
             * short one as a hairline — the figure changed shape while it was being dragged and
             * said nothing about the symbol. The caller states it in metres because only a
             * renderer knows what a pixel is worth. (User's call, 2026-09-06: "while drawing can
             * we lock the parallel line to a distance of 50px between click 1 and 2".)
             */
            const stated = 30_000;
            const gapOf = (bar: Position[]) =>
                meters(bar[1], parallelRailAnchors(bar, baseVertexCount(name)!, stated)![2]);

            const short: Position[] = [[-0.2, 20], [0.2, 20]];
            const long: Position[] = [[-4, 20], [4, 20]];
            expect(meters(long[0], long[1]) / meters(short[0], short[1])).toBeGreaterThan(15);

            // The same gap for both, and the one that was asked for.
            expect(gapOf(short)).toBeCloseTo(stated, -2);
            expect(gapOf(long)).toBeCloseTo(stated, -2);

            // Silence still falls back to a share of the bar, because a raw-GeoJSON reader has
            // no resolution to offer and a preview still has to be drawn.
            const silent = meters(long[1], parallelRailAnchors(long, baseVertexCount(name)!)![2]);
            expect(silent).toBeGreaterThan(stated * 2);
        },
    );

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s carries the screen-sized gap the holder files through to the preview',
        (_label, name) => {
            // A holder files its screen-sized half-width as the public `width` — twice it — and
            // the generator reads that back as the preview gap. This is the join the 50 px lock
            // runs through; the pixel count itself is asserted on the OpenLayers side.
            const half = 12_500;
            const bar: Position[] = [[-1, 20], [1, 20]];
            const drawn = renderTacticalGraphic({
                type: 'Feature',
                properties: {tacticalGraphic: {name, width: half * 2}},
                geometry: {type: 'LineString', coordinates: bar},
            } as Feature).graphic.geometry as MultiLineString;

            const line = turf.lineString(bar);
            const offsets = drawn.coordinates
                .flat()
                .map(c => turf.pointToLineDistance(turf.point(c as Position), line, {units: 'meters'}));
            // **The rail, not the ink.** A bridge's bars are crowbars whose ticks stand off the
            // rail, so the outermost mark sits past the gap; the rail is the ink that clusters
            // at the stated separation. @see parallelRailFrame
            const rail = offsets.filter(d => Math.abs(d - half * 2) < half / 4);
            expect(rail.length).toBeGreaterThan(0);
        },
    );

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s lays a synthesised base out on the side a drawn one lands',
        (_label, name) => {
            /*
             * **The sweep drew every one of these as the vertical mirror of a hand-drawn one.**
             * A synthesised base — the sample sheets, the thumbnails, a fixture — went through
             * `frontEdgeBase`, whose across-point sits south because that is where a rear or a
             * depth belongs. These five put their far rail *north* of the bar being dragged, so
             * the sheet and the app disagreed about which bar carried points 1 and 2.
             *
             * Invisible on the bridge and the assault crossing, whose two bars are the same
             * crowbar twice; plain on the fords, where the grips are the only thing telling one
             * rail from the other. (User's report, 2026-09-06: "fix the ford graphics on the
             * sweep. The handles seem flipped there".) @see railCrossingBase
             */
            const laidOut = synthesizedBase(name, [0, 20], 1, baseVertexCount(name))!;
            expect(laidOut).toHaveLength(baseVertexCount(name)!);

            // Which side of the bar a point falls on, as a signed area — positive to the left
            // of point 1 → point 2. Degrees are fine for a *sign*.
            const side = (p: Position) => {
                const [a, b] = laidOut;
                return Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
            };
            // Where a two-click drag of that same bar previews its far rail.
            const drawn = parallelRailAnchors([laidOut[0], laidOut[1]], 3)!;

            expect(side(drawn[2])).not.toBe(0);
            laidOut.slice(2).forEach(p => expect(side(p)).toBe(side(drawn[2])));
        },
    );

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s settles a synthesised base without moving it',
        (_label, name) => {
            // The sheet normalises everything it lays out, so a layout the reader disagrees
            // with is a symbol drawn somewhere other than where the cell put it.
            const laidOut = synthesizedBase(name, [0, 20], 1, baseVertexCount(name))!;
            // **Within a few percent of the run**, not to the metre. The layout is planar — a
            // sheet adds its offsets in whatever units its cells are in — and the reader is
            // geodesic, so at a figure this size they part company by about half a percent
            // where the point is squared and about one and a half where it is *derived*: the
            // far rail is made parallel and equal along the ground, and a bar a degree further
            // north does not span the same longitudes. Small enough that the symbol stays in
            // the cell, which is all a layout owes. What must be exact is the *second* pass,
            // and that is the idempotence the reader guarantees.
            const settled = anchors(name, laidOut);
            const run = meters(laidOut[0], laidOut[1]);
            settled.forEach((p, i) => expect(meters(p, laidOut[i])).toBeLessThan(run / 50));
            anchors(name, settled).forEach((p, i) => expect(meters(p, settled[i])).toBeLessThan(1));
        },
    );

    it.each(FAMILY.map(n => [String(n), n] as const))(
        '%s takes the pixel lock from the resolution a reader is given',
        (_label, name) => {
            /*
             * **The engine-agnostic half of the 50 px lock.** OpenLayers' preview gets it
             * through the holder's own offset, which reaches the generator as a `width`; that
             * route does not exist on MapLibre, which normalises its sketch on every preview
             * move and draws whatever comes back. So the reader takes it too, from the
             * resolution `normalizeDrawnBase` is already handed — otherwise the same half-drawn
             * crossing showed a locked gap on one engine and a share of the bar on the other,
             * which is the asymmetry this repository keeps finding. @see RAIL_PREVIEW_GAP_PX
             */
            const resolution = 120;
            const bar: Position[] = [[-1, 20], [1, 20]];
            const previewed = normalizeDrawnBase(name, bar, resolution);
            expect(meters(previewed[1], previewed[2])).toBeCloseTo(RAIL_PREVIEW_GAP_PX * resolution, -1);

            // Eight times the metres per pixel is eight times the gap and the same picture.
            const zoomedOut = normalizeDrawnBase(name, bar, resolution * 8);
            expect(meters(zoomedOut[1], zoomedOut[2]) / meters(previewed[1], previewed[2])).toBeCloseTo(8, 3);

            // And a settled base is untouched by it — the third click states the gap, and a
            // resolution must never move a point the operator placed.
            const settled = anchors(name, CLICKS);
            normalizeDrawnBase(name, settled, resolution).forEach((p, i) =>
                expect(meters(p, settled[i])).toBeLessThan(1),
            );
        },
    );

    it('locks the drawing preview to a screen-pixel gap', () => {
        // Named here because it is the number the operator asked for, and the renderers size
        // their half-width from it. @see RAIL_PREVIEW_GAP_PX
        expect(RAIL_PREVIEW_GAP_PX).toBe(50);
    });

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
