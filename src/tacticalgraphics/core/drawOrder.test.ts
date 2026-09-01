/**
 * # Point 1 is the arrowhead
 *
 * APP-06 numbers an arrow symbol's anchor points from the tip: "Point 1 defines the tip
 * of the arrowhead. Point N-1 defines the rear of the symbol." Thirty-two graphics stored
 * them the other way round, because their generators build the head at the last vertex,
 * so the arrow landed on the user's last click and the saved point list was the reverse
 * of the standard's. Nothing looked wrong -- which is exactly why it needed a test.
 *
 * Two things are pinned here. The **mechanism**: `generate` hands the generator a
 * reversed line, so the shape is bit-for-bit what the old order produced and only the
 * stored base changed. And the **result**, on three graphics where the head can be found
 * by measurement rather than by trusting the plumbing.
 */

import {
    GRAPHIC_ENTITY_CODES,
    TIP_FIRST_GRAPHICS,
    rotationAnchor,
    TacticalGraphicName,
    TacticalGraphicsRegistry,
    drawsTipFirst,
    generatorOrder,
    listTacticalGraphicNames,
    renderTacticalGraphic,
    usesDrawnAnchors,
} from '../index';
import {Feature, LineString, Position} from 'geojson';

/**
 * The three halves of a generator, which `IGraphicGenerator` does not declare -- the
 * public interface promises only `generate`. Reaching past it is the point of this
 * suite: what is under test is the difference between the two.
 */
type Parts = {
    generate(base: Feature, opts?: unknown): {base: Feature; graphic: Feature; handles: Feature; labels: Feature};
    generateGraphics(base: Feature, opts?: unknown): Feature;
    generateHandles(base: Feature, opts?: unknown): Feature;
    generateLabels(base: Feature, opts?: unknown): Feature;
};

const partsOf = (name: string): Parts =>
    TacticalGraphicsRegistry.get(name as TacticalGraphicName) as unknown as Parts;

/** A degree of longitude either side of nothing, so `t` below reads as a fraction. */
const A: Position = [0, 0];
const B: Position = [0.1, 0];
const OPTS = {size: 1500, radius: 1500, decorationSize: 1500, width: 1500};

const baseLine = (coords: Position[] = [A, B]): Feature<LineString> => ({
    type: 'Feature',
    properties: {},
    geometry: {type: 'LineString', coordinates: coords},
});

/** Every coordinate in a rendered geometry, however deeply it is nested. */
const flatten = (node: unknown, out: Position[] = []): Position[] => {
    if (!Array.isArray(node)) return out;
    if (typeof node[0] === 'number') {
        out.push(node as Position);
        return out;
    }
    for (const child of node) flatten(child, out);
    return out;
};

const renderedPoints = (name: string): Position[] => {
    const feature: Feature = {
        type: 'Feature',
        properties: {tacticalGraphic: {name, ...OPTS}},
        geometry: {type: 'LineString', coordinates: [A, B]},
    };
    const {graphic} = renderTacticalGraphic(feature);
    const geometry = graphic.geometry as {type: string; geometries?: {coordinates: unknown}[]; coordinates?: unknown};
    const parts = geometry.type === 'GeometryCollection' ? geometry.geometries! : [geometry as {coordinates: unknown}];
    return parts.flatMap((part) => flatten(part.coordinates));
};

/** Where a point sits along the drawn line: 0 at the first click, 1 at the last. */
const along = (position: Position): number => position[0] / B[0];

describe('TIP_FIRST_GRAPHICS', () => {
    it('names only graphics this build registers', () => {
        const registered = new Set(listTacticalGraphicNames());
        for (const name of TIP_FIRST_GRAPHICS) expect(registered.has(name)).toBe(true);
    });

    it('carries an APP-06 code for every member with an enum name', () => {
        // FM 1-02.2 publishes no anchor-point numbering, so a graphic can only be listed
        // here on APP-06's authority -- and a graphic APP-06 does not code has none.
        for (const name of TIP_FIRST_GRAPHICS) {
            if (!(name in TacticalGraphicName)) continue;
            expect(GRAPHIC_ENTITY_CODES[name as TacticalGraphicName]).toMatch(/^\d{6}$/);
        }
    });

    it('leaves the graphics that already store their points in APP-06 order alone', () => {
        // The drawn-anchor six write the standard's numbering themselves, tip included.
        const anchored = listTacticalGraphicNames()
            .filter((name): name is TacticalGraphicName => name in TacticalGraphicName)
            .filter(usesDrawnAnchors);
        expect(anchored.length).toBeGreaterThan(0);
        for (const name of anchored) expect(drawsTipFirst(name)).toBe(false);

        // And the rules that put the tip *last* -- Exfiltrate and Infiltrate at point 3,
        // the swept-arc tasks at point 4, Demonstration's second arrow, the obstacle
        // bypasses' rear -- were conformant before any of this and stay untouched.
        for (const name of [
            TacticalGraphicName.Exfiltrate,
            TacticalGraphicName.Infiltration,
            TacticalGraphicName.Capture,
            TacticalGraphicName.Evacuate,
            TacticalGraphicName.Recover,
            TacticalGraphicName.Demonstration,
            TacticalGraphicName.ObstacleBypassEasy,
            TacticalGraphicName.DirectionOfMainAttack,
        ]) {
            expect(drawsTipFirst(name)).toBe(false);
        }
    });
});

describe('generatorOrder', () => {
    it('reverses a tip-first line and leaves every other one as it is', () => {
        expect(generatorOrder(TacticalGraphicName.AvenueOfApproach, [A, B])).toEqual([B, A]);
        expect(generatorOrder(TacticalGraphicName.PhaseLine, [A, B])).toEqual([A, B]);
    });

    it('has nothing to reverse in a single point', () => {
        expect(generatorOrder(TacticalGraphicName.AvenueOfApproach, [A])).toEqual([A]);
    });
});

describe('generate', () => {
    it('hands every tip-first generator the line the other way round', () => {
        // The shape is the property that must not move: whatever the old order drew for
        // a rear-to-tip line is what the new order draws for its reverse. Compared
        // against the generator's own output rather than a recording, so a change to any
        // of the thirty shapes still passes -- it is the plumbing under test.
        for (const name of TIP_FIRST_GRAPHICS) {
            const generator = partsOf(name);
            const drawn = baseLine([A, B]);
            const reversed = baseLine([B, A]);

            expect(generator.generate(drawn, OPTS).graphic).toEqual(generator.generateGraphics(reversed, OPTS));
            expect(generator.generate(drawn, OPTS).handles).toEqual(generator.generateHandles(reversed, OPTS));
            expect(generator.generate(drawn, OPTS).labels).toEqual(generator.generateLabels(reversed, OPTS));
        }
    });

    it('returns the base the caller drew, not the reversed copy', () => {
        // The caller saves this feature and drags its vertices; handing back the
        // working copy would file the graphic in the order it was just moved out of.
        const generator = partsOf(TacticalGraphicName.AvenueOfApproach);
        const drawn = baseLine([A, B]);
        expect(generator.generate(drawn, OPTS).base).toBe(drawn);
    });

    it('leaves a graphic that is not tip-first exactly as it was', () => {
        const generator = partsOf(TacticalGraphicName.PhaseLine);
        const drawn = baseLine([A, B]);
        expect(generator.generate(drawn, OPTS).graphic).toEqual(generator.generateGraphics(drawn, OPTS));
    });
});

describe('the pivot a tip-first graphic turns about', () => {
    const line = {type: 'LineString', coordinates: [A, B]};

    it('is the rear, which is the last vertex now', () => {
        // Not the tip: a resize measured from the arrowhead grows the symbol backwards
        // out of its own head, and this is the same physical end these pivoted on before
        // the renumbering.
        expect(rotationAnchor(line, TacticalGraphicName.AvenueOfApproach)).toEqual(B);
        expect(rotationAnchor(line, TacticalGraphicName.Delay)).toEqual(B);
        expect(rotationAnchor(line, TacticalGraphicName.Block)).toEqual(B);
    });

    it('is still the first vertex for an ordinary drawn line', () => {
        expect(rotationAnchor(line, TacticalGraphicName.PhaseLine)).toEqual(A);
    });

    it('falls back to the plain rule when no name is passed', () => {
        // Which is exactly why every caller has to pass one: the answer is wrong here,
        // and nothing about the call site would show it. @see rotationAnchor
        expect(rotationAnchor(line)).toEqual(A);
    });
});

describe('where the head lands', () => {
    it('puts the avenue of approach arrowhead on the first click', () => {
        // The barbs are the widest ink in the symbol and they flare behind the tip, so
        // the question is which *end* of the drawn line carries the wide ink: the head's
        // half-width against the shaft's. Drawn rear-first this ratio was inverted.
        const points = renderedPoints(TacticalGraphicName.AvenueOfApproach);
        const widestBetween = (from: number, to: number): number =>
            Math.max(...points.filter((point) => along(point) >= from && along(point) <= to).map((point) => Math.abs(point[1])));

        expect(widestBetween(-0.1, 0.25)).toBeGreaterThan(widestBetween(0.75, 1.1) * 1.5);
    });

    it('puts the delay arc at the rear, which is now the last click', () => {
        // The cane's 180-degree arc is the far end of the symbol from its arrowhead, and
        // it is the only part that reaches *past* a drawn vertex.
        const points = renderedPoints(TacticalGraphicName.Delay);
        const reach = Math.max(...points.map(along));
        expect(reach).toBeGreaterThan(1);
    });

    it('puts the block bar on the first click', () => {
        // The two blocks carry no arrowhead: what 270501 numbers first is the vertical
        // line the enemy runs into. It is the only perpendicular in the symbol, so the
        // ink's widest span sits at one end of the drawn line and the question is which.
        const points = renderedPoints(TacticalGraphicName.Block);
        const widest = points.reduce((best, point) => (Math.abs(point[1]) > Math.abs(best[1]) ? point : best));
        expect(Math.abs(along(widest))).toBeLessThan(0.05);
    });

    it('puts the fields-of-fire vertex on the first click', () => {
        // 140500 is the one APP-06 numbers from the vertex rather than from a tip: both
        // legs meet at point 1, so the drawn line's first coordinate is the corner.
        const points = renderedPoints(TacticalGraphicName.FieldsOfFire);
        const atStart = points.filter((point) => Math.abs(along(point)) < 0.02);
        expect(atStart.length).toBeGreaterThan(1);
    });
});
