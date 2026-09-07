/**
 * # Where a new base vertex may not go
 *
 * Reported as "abatis should not accept vertices within the triangle opening" (user,
 * 2026-09-06). 280100 draws the route *through* the chevron — `Abatis.path` returns the
 * two legs and then the rest of the line — so the first `size` metres of the base are the
 * inside of the tooth, and a point dropped there bends the line the mark is measured along.
 * Both engines inserted one happily.
 *
 * The rule is one function in the map-agnostic half, and the two renderers each gate their
 * own insertion on it: `Modify`'s `insertVertexCondition` in OpenLayers,
 * `MapLibreInteractions.grabSegment` in MapLibre. Those wirings are pinned in
 * `openlayers/vertexInsertion.test.ts` and `maplibre/interaction/vertexInsertion.test.ts`;
 * what is pinned here is the rule itself.
 */

import {TacticalGraphicName, acceptsInsertedVertex, listTacticalGraphicNames, reservedLeadPx} from './index';

/** A 400 px horizontal run, in screen pixels — which is the unit the rule speaks. */
const RUN: [number, number][] = [[100, 200], [500, 200]];

/** The chevron's own width, so the test says the same number the symbol is drawn at. */
const LEAD = 26;

describe('the reserved lead', () => {
    it('is the chevron abatis is actually drawn with', () => {
        // Read off `DECORATION_PX`, not restated, so the refusal and the drawing cannot
        // disagree about how wide the tooth is.
        expect(reservedLeadPx(TacticalGraphicName.Abatis)).toBe(LEAD);
    });

    it('is claimed by abatis alone', () => {
        const reserving = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(
            name => reservedLeadPx(name) !== undefined,
        );
        expect(reserving).toEqual([TacticalGraphicName.Abatis]);
    });
});

describe('abatis refuses a vertex inside its chevron', () => {
    it('refuses the point under the apex', () => {
        // Half a tooth in: dead centre of the opening, and where the reported drag landed.
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, RUN, [100 + LEAD / 2, 200])).toBe(false);
    });

    it('refuses both feet of the chevron', () => {
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, RUN, [100, 200])).toBe(false);
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, RUN, [100 + LEAD - 1, 200])).toBe(false);
    });

    it('accepts a vertex on the run past the tooth', () => {
        // 280100: "additional points can be defined to extend the line" — the road past the
        // obstacle still bends wherever the operator says it does.
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, RUN, [100 + LEAD + 1, 200])).toBe(true);
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, RUN, [300, 200])).toBe(true);
    });

    it('measures along the route, not straight from the first point', () => {
        // A road that curls back past the obstacle. The far end sits 22 px from the start
        // as the crow flies — inside the tooth by any straight-line reading — and 410 px
        // along the line the chevron is measured on, so it takes a vertex.
        const curled: [number, number][] = [[100, 200], [300, 200], [300, 220], [110, 220]];
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, curled, [110, 220])).toBe(true);
    });

    it('shrinks the refusal with the tooth on a route barely longer than it', () => {
        // `Abatis.path` caps the chevron at half the obstacle, so a 20 px route carries a
        // 10 px tooth — and refusing the whole first 26 px would refuse the entire line.
        const stub: [number, number][] = [[100, 200], [120, 200]];
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, stub, [105, 200])).toBe(false);
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, stub, [115, 200])).toBe(true);
    });
});

describe('every other graphic is untouched', () => {
    it('accepts a vertex anywhere on a phase line', () => {
        for (const at of [[100, 200], [103, 200], [300, 200]] as [number, number][]) {
            expect(acceptsInsertedVertex(TacticalGraphicName.PhaseLine, RUN, at)).toBe(true);
        }
    });

    it('accepts a vertex at the head of the obstacles whose marks hang off the line', () => {
        // A bridge's ticks and a wire's crosses sit *beside* the route and leave it whole
        // underneath, so a vertex there is a bend in a road and nothing more.
        for (const name of [TacticalGraphicName.WireSingleFence, TacticalGraphicName.ObstacleLine]) {
            expect(acceptsInsertedVertex(name, RUN, [100 + LEAD / 2, 200])).toBe(true);
        }
    });

    it('answers true for a base too short to have a segment', () => {
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, [[100, 200]], [100, 200])).toBe(true);
        expect(acceptsInsertedVertex(TacticalGraphicName.Abatis, [], [100, 200])).toBe(true);
    });
});
