/**
 * # APP-06 Tables 8-24 and 8-25 — the sector modifiers
 *
 * Fourteen mobility glyphs, six terrain words, and the three areas that carry them.
 *
 * What is pinned here is what a reading of the two tables *decided*, not what the code
 * happens to do: that the two categories of Table 8-24 never meet on one symbol, that
 * every glyph is drawn inside the frame the fit measures it by, that the Sector 2
 * modifier repaints the hatch and not the outline, and that the stack comes out in the
 * plate's order — literal, icon, word, field H.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {resetTacticalGraphicsConfig} from '../core/config';
import {supportsHostility} from '../core/symbology';
import {TacticalGraphicMobility, TacticalGraphicName, TacticalGraphicTerrain} from '../core/type';
import {getPaintFunction} from './registry';
import {
    GLYPH_HALF_WIDTH,
    MOBILITY_GLYPHS,
    TERRAIN_HATCH_COLORS,
    mobilityMarks,
    terrainWord,
} from './sectorModifierPaints';

const context: PaintContext = {
    resolution: 40,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** A square ring 400 km across, centered on the origin. */
const HALF = 200_000;
const RING: ProjectedPosition[] = [
    [-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF], [-HALF, -HALF],
];

function labelFeature(name: TacticalGraphicName, properties: Record<string, unknown>): PaintFeature {
    return {
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name, ...properties},
        ring: RING,
        bounds: {minX: -HALF, minY: -HALF, maxX: HALF, maxY: HALF},
    } as unknown as PaintFeature;
}

function areaFeature(name: TacticalGraphicName, properties: Record<string, unknown>): PaintFeature {
    return {
        geometry: {type: 'Polygon', coordinates: [RING]},
        properties: {name, ...properties},
        ring: RING,
        bounds: {minX: -HALF, minY: -HALF, maxX: HALF, maxY: HALF},
    } as unknown as PaintFeature;
}

const labelPaints = (name: TacticalGraphicName, properties: Record<string, unknown>): Paint[] =>
    getPaintFunction(name)?.label?.(labelFeature(name, properties), context) ?? [];

const graphicPaints = (name: TacticalGraphicName, properties: Record<string, unknown>): Paint[] =>
    getPaintFunction(name)?.graphic?.(areaFeature(name, properties), context) ?? [];

/** Every coordinate a paint list touches, geometry and text anchors alike. */
function points(paints: Paint[]): ProjectedPosition[] {
    const out: ProjectedPosition[] = [];
    const walk = (value: unknown): void => {
        if (!Array.isArray(value)) return;
        if (typeof value[0] === 'number' && typeof value[1] === 'number' && value.length === 2) {
            out.push(value as ProjectedPosition);
            return;
        }
        for (const item of value) walk(item);
    };
    for (const paint of paints) walk((paint.geometry as {coordinates?: unknown}).coordinates);
    return out;
}

const texts = (paints: Paint[]) => paints.filter(p => p.text?.text).map(p => p.text!.text as string);

/** The y of the mark whose text contains `match`. */
function textY(paints: Paint[], match: string): number | undefined {
    const hit = paints.find(p => (p.text?.text ?? '').includes(match));
    return hit && hit.geometry.type === 'Point' ? (hit.geometry.coordinates as ProjectedPosition)[1] : undefined;
}

beforeEach(() => resetTacticalGraphicsConfig());

describe('Table 8-24 — the mobility glyphs', () => {
    const DRAWN = (Object.values(TacticalGraphicMobility) as TacticalGraphicMobility[])
        .filter(m => m !== TacticalGraphicMobility.unspecified);

    it('carries all fourteen rows of the MOBILITY category', () => {
        // 00-12 and 51. The gap is the mine block, which is a different enum entirely.
        expect(Object.keys(MOBILITY_GLYPHS)).toHaveLength(14);
    });

    it('draws nothing for the unspecified modifier', () => {
        expect(mobilityMarks([0, 0], 1, TacticalGraphicMobility.unspecified, '#000', 40)).toEqual([]);
    });

    it.each(DRAWN.map(m => [String(m), m] as const))('%s draws something', (_label, mobility) => {
        expect(mobilityMarks([0, 0], 1, mobility, '#000', 40).length).toBeGreaterThan(0);
    });

    it.each(DRAWN.map(m => [String(m), m] as const))(
        '%s stays inside the frame the fit measures it by',
        (_label, mobility) => {
            // Everything is described in half-widths, so a glyph that ran past +-1 in x or
            // past its own `halfHeight` in y would be fitted against the wrong box and
            // could cross the outline it was fitted to clear.
            const glyph = MOBILITY_GLYPHS[mobility];
            const marks = mobilityMarks([0, 0], 1, mobility, '#000', 40);
            const inside = points(marks);
            // The text modifier has one anchor and no line work to measure.
            if (!inside.length) {
                expect(glyph.text).toBeTruthy();
                return;
            }
            const maxX = Math.max(...inside.map(([x]) => Math.abs(x)));
            const maxY = Math.max(...inside.map(([, y]) => Math.abs(y)));
            expect(maxX).toBeLessThanOrEqual(GLYPH_HALF_WIDTH * 1.001);
            expect(maxY).toBeLessThanOrEqual(GLYPH_HALF_WIDTH * glyph.halfHeight * 1.001);
        },
    );

    it('sets code 12 in type — the only modifier that is not line work', () => {
        const marks = mobilityMarks([0, 0], 1, TacticalGraphicMobility.noVehicles, '#000', 40);
        expect(texts(marks)).toEqual(['ALL']);
    });

    it('draws code 51 as a hexagon with a vertex at the top', () => {
        const [ring] = MOBILITY_GLYPHS[TacticalGraphicMobility.dismounted].rings!;
        expect(ring).toHaveLength(7); // six corners, closed
        // A pointy-top hexagon is taller than it is wide, by exactly 2 / sqrt(3).
        const width = Math.max(...ring.map(([x]) => x)) - Math.min(...ring.map(([x]) => x));
        const height = Math.max(...ring.map(([, y]) => y)) - Math.min(...ring.map(([, y]) => y));
        expect(height / width).toBeCloseTo(2 / Math.sqrt(3), 3);
    });

    it('tells the two road-mobility glyphs apart by wheel count', () => {
        expect(MOBILITY_GLYPHS[TacticalGraphicMobility.standardMobility].rings).toHaveLength(2);
        expect(MOBILITY_GLYPHS[TacticalGraphicMobility.highMobility].rings).toHaveLength(3);
        // And the railway by its two bogies of two.
        expect(MOBILITY_GLYPHS[TacticalGraphicMobility.railway].rings).toHaveLength(4);
    });
});

describe('Table 8-25 — the terrain modifiers', () => {
    it('prints the modifier as a word, upper case', () => {
        expect(terrainWord(TacticalGraphicTerrain.vegetation)).toBe('VEGETATION');
        expect(terrainWord(TacticalGraphicTerrain.ground)).toBe('GROUND');
    });

    it('prints nothing for the unspecified modifier', () => {
        expect(terrainWord(TacticalGraphicTerrain.unspecified)).toBe('');
        expect(terrainWord(undefined)).toBe('');
    });

    it('names a hatch color for each terrain, and none for unspecified', () => {
        expect(TERRAIN_HATCH_COLORS[TacticalGraphicTerrain.unspecified]).toBeUndefined();
        expect(TERRAIN_HATCH_COLORS[TacticalGraphicTerrain.urban]).toBe('#000000');
        // Vegetation and obstacles are both remarked GREEN — the same value, deliberately.
        expect(TERRAIN_HATCH_COLORS[TacticalGraphicTerrain.obstacles])
            .toBe(TERRAIN_HATCH_COLORS[TacticalGraphicTerrain.vegetation]);
    });

    it('repaints the hatch and leaves the outline alone', () => {
        const plain = graphicPaints(TacticalGraphicName.RestrictedTerrain, {})[0];
        const brown = graphicPaints(TacticalGraphicName.RestrictedTerrain, {
            terrain: TacticalGraphicTerrain.ground,
        })[0];
        expect(brown.fill!.pattern!.color).not.toBe(plain.fill!.pattern!.color);
        expect(brown.fill!.pattern!.color).toContain('139'); // #8B5A2B, thinned to rgba
        expect(brown.stroke!.color).toBe(plain.stroke!.color);
    });

    it('keeps the texture that tells the pair apart', () => {
        const restricted = graphicPaints(TacticalGraphicName.RestrictedTerrain, {
            terrain: TacticalGraphicTerrain.vegetation,
        })[0];
        const severely = graphicPaints(TacticalGraphicName.SeverelyRestrictedTerrain, {
            terrain: TacticalGraphicTerrain.vegetation,
        })[0];
        expect(restricted.fill!.pattern!.kind).toBe('diagonal');
        expect(severely.fill!.pattern!.kind).toBe('cross');
    });
});

describe('the three areas that carry a sector modifier', () => {
    it('stacks the icon over the Sector 2 word over field H', () => {
        const paints = labelPaints(TacticalGraphicName.RestrictedTerrain, {
            mobility: TacticalGraphicMobility.highMobility,
            terrain: TacticalGraphicTerrain.ground,
            additionalInfo: 'GRADIENT 35% SOFT',
        });
        const block = texts(paints).find(t => t.includes('GROUND'))!;
        expect(block.split('\n')).toEqual(['GROUND', 'GRADIENT 35% SOFT']);

        // And the icon sits above that block, not through it.
        const wheels = paints.filter(p => p.geometry.type === 'LineString');
        expect(wheels.length).toBeGreaterThan(0);
        const lowestGlyphY = Math.min(...points(wheels).map(([, y]) => y));
        expect(lowestGlyphY).toBeGreaterThan(textY(paints, 'GROUND')!);
    });

    it('puts the limited access area literal above its icon', () => {
        const paints = labelPaints(TacticalGraphicName.LimitedAccessArea, {
            mobility: TacticalGraphicMobility.tracked,
            additionalInfo: 'BOGGY GROUND',
        });
        expect(texts(paints)).toEqual(['LAA', 'BOGGY GROUND']);
        expect(textY(paints, 'LAA')!).toBeGreaterThan(textY(paints, 'BOGGY')!);

        const glyph = paints.filter(p => p.geometry.type === 'LineString');
        const ys = points(glyph).map(([, y]) => y);
        expect(Math.max(...ys)).toBeLessThan(textY(paints, 'LAA')!);
        expect(Math.min(...ys)).toBeGreaterThan(textY(paints, 'BOGGY')!);
    });

    it('draws no date-time group on any of the three', () => {
        // None of them offers the pair, so a `startDate` can only arrive on an imported
        // bag — and painting a field nobody offered is how one ends up on the map. FM
        // 1-02.2 does set W - W1 under the limited access area's Sector 1 box; the
        // graphic follows APP-06, which sets field H in the same box.
        for (const name of [
            TacticalGraphicName.LimitedAccessArea,
            TacticalGraphicName.RestrictedTerrain,
            TacticalGraphicName.SeverelyRestrictedTerrain,
        ]) {
            const paints = labelPaints(name, {startDate: '021200ZJUN26', endDate: '021800ZJUN26'});
            expect(texts(paints).join(' ')).not.toContain('021200ZJUN26');
        }
    });

    it('offers the Sector 2 word only to the restricted-terrain pair', () => {
        const laa = labelPaints(TacticalGraphicName.LimitedAccessArea, {
            terrain: TacticalGraphicTerrain.urban,
        });
        expect(texts(laa).join(' ')).not.toContain('URBAN');
    });

    it('draws nothing at all when no modifier and no text is set', () => {
        expect(labelPaints(TacticalGraphicName.RestrictedTerrain, {})).toEqual([]);
        // The limited access area always has its literal.
        expect(texts(labelPaints(TacticalGraphicName.LimitedAccessArea, {}))).toEqual(['LAA']);
    });

    it('draws the icon at one size, whatever is written beside it', () => {
        // It used to be a share of the block's widest line, so `DENSE WOODLAND` drew a
        // visibly larger icon than `SOFT` and the limited access area a different size
        // again. How large a Sector 1 modifier is drawn is not a fact about the words
        // next to it.
        const iconWidth = (name: TacticalGraphicName, properties: Record<string, unknown>): number => {
            const paints = labelPaints(name, {mobility: TacticalGraphicMobility.tracked, ...properties});
            const xs = points(paints.filter(p => p.geometry.type === 'LineString')).map(([x]) => x);
            return Math.max(...xs) - Math.min(...xs);
        };

        const short = iconWidth(TacticalGraphicName.RestrictedTerrain, {additionalInfo: 'SOFT'});
        const long = iconWidth(TacticalGraphicName.RestrictedTerrain, {
            terrain: TacticalGraphicTerrain.vegetation, additionalInfo: 'DENSE WOODLAND EVERYWHERE',
        });
        const other = iconWidth(TacticalGraphicName.LimitedAccessArea, {additionalInfo: 'BOGGY GROUND'});
        const bare = iconWidth(TacticalGraphicName.SeverelyRestrictedTerrain, {});

        expect(long).toBeCloseTo(short, 0);
        expect(other).toBeCloseTo(short, 0);
        // Even with no amplifiers at all: the icon is not optional, so it cannot depend on
        // there being text to measure against.
        expect(bare).toBeCloseTo(short, 0);
    });

    it('stops the icon growing once the text stops', () => {
        // `fitSymbolScale` alone keeps opening the glyph up on a large area while the
        // amplifiers beside it hit the label scale's clamp. @see the PsyOps loudspeaker.
        const widthAt = (half: number): number => {
            const ring: ProjectedPosition[] = [
                [-half, -half], [half, -half], [half, half], [-half, half], [-half, -half],
            ];
            const feature = {
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {
                    name: TacticalGraphicName.RestrictedTerrain,
                    mobility: TacticalGraphicMobility.tracked,
                    terrain: TacticalGraphicTerrain.ground,
                },
                ring,
                bounds: {minX: -half, minY: -half, maxX: half, maxY: half},
            } as unknown as PaintFeature;
            const paints = getPaintFunction(TacticalGraphicName.RestrictedTerrain)!.label!(feature, context);
            const xs = points(paints.filter(p => p.geometry.type === 'LineString')).map(([x]) => x);
            return Math.max(...xs) - Math.min(...xs);
        };
        expect(widthAt(4_000_000)).toBeCloseTo(widthAt(800_000), 0);
    });
});

describe('the Remarks column, as a constraint', () => {
    it('describes ground, so the terrain pair carry no identity', () => {
        expect(supportsHostility(TacticalGraphicName.RestrictedTerrain)).toBe(false);
        expect(supportsHostility(TacticalGraphicName.SeverelyRestrictedTerrain)).toBe(false);
        // The limited access area is a restriction someone imposes, and keeps its own.
        expect(supportsHostility(TacticalGraphicName.LimitedAccessArea)).toBe(true);
    });
});
