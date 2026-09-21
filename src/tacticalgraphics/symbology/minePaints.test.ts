/**
 * # The mine-type icons
 *
 * Seven glyphs that differ from one another by one stroke each, which is exactly the kind
 * of family where a wrong table entry renders plausibly and means something else. Each
 * assertion below is about what tells one type from another.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicHostility, TacticalGraphicMineType, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {
    MINE_GLYPH_GAP_PX,
    mineFillPaint,
    minedAreaPaint,
    minedAreaFencedPaint,
    minefieldAreaPaint,
    mineGlyph,
    mineGlyphExtent,
    mineRowMarks,
} from './minePaints';

const context = (resolution = 400): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

const ORIGIN: ProjectedPosition = [0, 0];
const RING: ProjectedPosition[] = [
    [-400_000, -300_000], [400_000, -300_000], [400_000, 300_000], [-400_000, 300_000], [-400_000, -300_000],
];

const ALL = Object.values(TacticalGraphicMineType);

/** How far a point lies off a ring, in metres. Zero means it is on the boundary. */
function onRing(ring: ProjectedPosition[], [px, py]: ProjectedPosition): number {
    let best = Infinity;
    for (let i = 0; i + 1 < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[i + 1];
        const ex = bx - ax;
        const ey = by - ay;
        const len2 = ex * ex + ey * ey;
        const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0;
        best = Math.min(best, Math.hypot(px - (ax + ex * t), py - (ay + ey * t)));
    }
    return best;
}

const strokeCount = (paints: Paint[]) =>
    paints.filter(p => p.stroke).reduce((total, p) => {
        if (p.geometry.type === 'MultiLineString') return total + p.geometry.coordinates.length;
        return total + 1;
    }, 0);

beforeEach(() => resetTacticalGraphicsConfig());

describe('APP-06 Table 8-24 — the mine-type icons', () => {
    it('draws three of them in a row, whatever the type', () => {
        for (const type of ALL) {
            const marks = mineRowMarks(ORIGIN, 1, type, '#000');
            const xs = marks.map(p => {
                const g = p.geometry as {type: string; coordinates: unknown};
                if (g.type === 'Point') return (g.coordinates as ProjectedPosition)[0];
                const flat = JSON.stringify(g.coordinates);
                return JSON.parse(flat).flat(3).filter((_v: number, i: number) => i % 2 === 0)[0] as number;
            });
            // Three slots means marks on both sides of the middle one.
            expect(Math.max(...xs)).toBeGreaterThan(0);
            expect(Math.min(...xs)).toBeLessThan(0);
        }
    });

    it('fills every disc except the unspecified one, which is hollow', () => {
        for (const type of ALL) {
            const marks = mineRowMarks(ORIGIN, 1, type, '#000');
            const filled = marks.some(p => p.fill && p.geometry.type === 'Polygon');
            // The mine cluster has no disc at all — it is a dome — so it is neither.
            if (type === TacticalGraphicMineType.mineCluster) expect(filled).toBe(false);
            else if (type === TacticalGraphicMineType.unspecified) expect(filled).toBe(false);
            else expect(filled).toBe(true);
        }
    });

    it('gives exactly the antipersonnel pair their antennae', () => {
        // Two strokes above the disc are what says "antipersonnel", and getting the set
        // wrong renders a plausible mine of the wrong kind.
        const withAntennae = ALL.filter(type =>
            strokeCount(mineRowMarks(ORIGIN, 1, type, '#000')) >= 6);
        expect(withAntennae).toEqual(expect.arrayContaining([
            TacticalGraphicMineType.antipersonnel,
            TacticalGraphicMineType.antipersonnelDirectional,
        ]));
        expect(withAntennae).not.toContain(TacticalGraphicMineType.antitank);
    });

    it('draws the plain antitank mine as a bare disc and nothing else', () => {
        const marks = mineRowMarks(ORIGIN, 1, TacticalGraphicMineType.antitank, '#000');
        expect(marks).toHaveLength(3);
        expect(marks.every(p => p.fill)).toBe(true);
    });

    it('breaks the mine cluster dome, as its own symbol is broken', () => {
        const marks = mineRowMarks(ORIGIN, 1, TacticalGraphicMineType.mineCluster, '#000');
        expect(marks.every(p => (p.stroke?.dashPx?.length ?? 0) > 0)).toBe(true);
    });

    it('tells all seven apart', () => {
        // The real guard: no two types may render identically. A copy-paste slip in the
        // table is otherwise invisible — both entries draw a disc and look fine.
        const shapes = ALL.map(type => JSON.stringify(mineRowMarks(ORIGIN, 1, type, '#000')));
        expect(new Set(shapes).size).toBe(ALL.length);
    });
});

/**
 * # No two Sector 1 glyphs may touch, in any of the seven
 *
 * The seven differ in width by more than half: a plain antitank mine is a bare disc, an
 * antipersonnel one carries antennae 1.5 radii out and 2.2 up, and the directional variant
 * adds an arrow reaching 2.2 to the right and nothing to the left. A single pitch fits the
 * disc and overlaps everything else — and the row was only ever looked at with the hollow
 * default, so nothing said so. @see MINE_GLYPH_EXTENT
 */
describe('APP-06 Table 8-24 — a row of any type clears itself', () => {
    /**
     * The horizontal extent of each glyph in a row of three.
     *
     * Grouped by position in the list, not by touching: every glyph in a row emits the same
     * marks, and the directional mine's arrow is **broken** before its head, as APP-06 draws
     * it, so its head does not touch its own disc and merging touching spans counted it as a
     * fourth glyph. @see DIRECTIONAL_ARROW
     */
    const glyphSpans = (marks: Paint[]): [number, number][] => {
        const per = marks.length / 3;
        expect(Number.isInteger(per)).toBe(true);
        return [0, 1, 2].map(g => {
            const xs: number[] = [];
            const walk = (value: unknown): void => {
                if (!Array.isArray(value)) return;
                if (typeof value[0] === 'number') return void xs.push(value[0] as number);
                value.forEach(walk);
            };
            marks.slice(g * per, (g + 1) * per).forEach(mark => walk((mark.geometry as {coordinates: unknown}).coordinates));
            return [Math.min(...xs), Math.max(...xs)] as [number, number];
        }).sort((a, b) => a[0] - b[0]);
    };

    it.each(ALL.map(t => [String(t), t] as const))('%s', (_label, type) => {
        // 26 km radius at scale 1, and a 10 px gap at this resolution.
        const gap = MINE_GLYPH_GAP_PX * 400;
        const glyphs = glyphSpans(mineRowMarks(ORIGIN, 1, type, '#000', gap));
        expect(glyphs).toHaveLength(3);
        for (let i = 1; i < glyphs.length; i++) {
            expect(glyphs[i][0]).toBeGreaterThan(glyphs[i - 1][1]);
            // …and the clear space is the one that was asked for, not whatever the disc
            // happened to leave over.
            expect((glyphs[i][0] - glyphs[i - 1][1]) / 400).toBeCloseTo(MINE_GLYPH_GAP_PX, 3);
        }
    });

    it('fits the widest of them inside the area it labels', () => {
        // The fit was measured against the disc's figures, so a row of directional
        // antipersonnel mines put its antennae through the boundary.
        const HALF = 400_000;
        for (const type of ALL) {
            const feature: PaintFeature = {
                geometry: {type: 'Point', coordinates: ORIGIN},
                properties: {name: TacticalGraphicName.MinefieldDynamicDepiction, mineType: type},
                ring: RING,
                bounds: {minX: -HALF, minY: -300_000, maxX: HALF, maxY: 300_000},
            } as unknown as PaintFeature;
            for (const mark of mineFillPaint()(feature, context()).filter(p => !p.text)) {
                const walk = (value: unknown): void => {
                    if (!Array.isArray(value)) return;
                    if (typeof value[0] === 'number') {
                        const [x, y] = value as [number, number];
                        expect(Math.abs(x)).toBeLessThanOrEqual(HALF);
                        expect(Math.abs(y)).toBeLessThanOrEqual(300_000);
                        return;
                    }
                    value.forEach(walk);
                };
                walk((mark.geometry as {coordinates: unknown}).coordinates);
            }
        }
    });
});

describe('APP-06 270707 / 270800 / 270801 — the three mine areas', () => {
    const areaFeature = (): PaintFeature => ({
        geometry: {type: 'Polygon', coordinates: [RING]},
        properties: {name: TacticalGraphicName.MinedAreaFenced},
    });

    const labelFeature = (mineType?: TacticalGraphicMineType): PaintFeature => ({
        geometry: {type: 'Point', coordinates: ORIGIN},
        properties: {name: TacticalGraphicName.MinefieldDynamicDepiction, designation: 'SECTOR 1', mineType},
        ring: RING,
        bounds: {minX: -400_000, minY: -300_000, maxX: 400_000, maxY: 300_000},
    });

    it('defaults to the unspecified mine rather than drawing nothing', () => {
        const unset = mineFillPaint()(labelFeature(), context());
        const explicit = mineFillPaint()(labelFeature(TacticalGraphicMineType.unspecified), context());
        expect(unset.length).toBeGreaterThan(1);
        expect(JSON.stringify(unset)).toEqual(JSON.stringify(explicit));
    });

    it('fences the mined area and leaves the minefield plain', () => {
        const fenced = minedAreaFencedPaint()(areaFeature(), context());
        const plain = minefieldAreaPaint()(areaFeature(), context());

        expect(plain).toHaveLength(1);
        // Outline, the M markers, and the run of crosses between them.
        expect(fenced.filter(p => p.text).map(p => p.text!.text)).toEqual(['M', 'M', 'M', 'M']);
        expect(fenced.some(p => p.geometry.type === 'MultiLineString')).toBe(true);
    });

    /*
     * **The three must not be the same picture.** APP-06 270800 is 270801's parent and
     * differs from it in the wire alone, which is exactly the shape of defect that let the
     * mined anti-tank ditch render identically to the unmined one and ship that way for
     * months. Asserting "each draws something" would have passed then too, so this asserts
     * what separates them. @see AntiTankDitchReinforcedWithMines
     */
    it('marks the mined area like the fenced one but draws no wire on it', () => {
        const marked = minedAreaPaint()(areaFeature(), context());
        const fenced = minedAreaFencedPaint()(areaFeature(), context());
        const plain = minefieldAreaPaint()(areaFeature(), context());

        // The letters are the fenced area's, exactly: same rule, same four bearings.
        const lettersOf = (paints: Paint[]) => paints.filter(p => p.text).map(p => p.text!.text);
        expect(lettersOf(marked)).toEqual(['M', 'M', 'M', 'M']);
        expect(lettersOf(marked)).toEqual(lettersOf(fenced));

        // One MultiLineString on the fenced area — the crosses. None on this one.
        const wire = (paints: Paint[]) => paints.filter(p => p.geometry.type === 'MultiLineString').length;
        expect(wire(fenced)).toBe(1);
        expect(wire(marked)).toBe(0);

        // And it is not the dynamic depiction either, which carries no letters at all.
        expect(lettersOf(plain)).toEqual([]);
    });

    it.each([
        ['mined area', minedAreaPaint],
        ['mined area, fenced', minedAreaFencedPaint],
    ])('sets the four M markers of %s due north, east, south and west of the middle', (_name, paint) => {
        // Spacing them along the perimeter put them wherever the drawing happened to
        // start, so the same area redrawn wore its letters somewhere else and none of them
        // landed anywhere a reader could name. (User's call, 2026-08-27.)
        const paints = paint()(areaFeature(), context());
        const at = paints.filter(p => p.text?.text === 'M')
            .map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
        expect(at).toHaveLength(4);

        // The fixture is a rectangle about the origin: north and south on the x axis,
        // east and west on the y axis, all four on the boundary.
        // `+ 0` so a rounded negative zero compares equal to zero.
        const rounded = at.map(([x, y]) => [Math.round(x) + 0, Math.round(y) + 0]).sort();
        expect(rounded).toEqual([[-400_000, 0], [0, -300_000], [0, 300_000], [400_000, 0]].sort());
    });

    it('does not draw a cross under a letter', () => {
        const paints = minedAreaFencedPaint()(areaFeature(), context());
        const letters = paints.filter(p => p.text)
            .map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
        const crosses = (paints.find(p => p.geometry.type === 'MultiLineString')!
            .geometry as {coordinates: ProjectedPosition[][]}).coordinates;
        const pitch = 26 * 400;
        for (const [a, b] of crosses) {
            const mid: ProjectedPosition = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            for (const l of letters) {
                expect(Math.hypot(l[0] - mid[0], l[1] - mid[1])).toBeGreaterThan(pitch * 0.5);
            }
        }
    });

    // "The area boundary will be filled with the type of mine(s) contained in the
    //  minefield [...] the H field will be filled with an 'S' or a '+S' as appropriate,
    //  and a self-destruct DTG will be posted in the W field."
    it('sets field H above the boundary and the DTG below it, and no designation', () => {
        const feature = labelFeature();
        feature.properties.additionalInfo = '+S';
        feature.properties.startDate = '240700ZMAY2026';
        feature.properties.designation = 'IGNORED';

        const texts = mineFillPaint()(feature, context()).filter(p => p.text);
        expect(texts.map(p => p.text!.text)).toEqual(['+S', '240700ZMAY2026']);

        const at = (i: number) => (texts[i].geometry as {coordinates: ProjectedPosition}).coordinates;
        // Off the outline, not off the mine row: above `maxY` and below `minY`.
        expect(at(0)[1]).toBeGreaterThan(300_000);
        expect(at(1)[1]).toBeLessThan(-300_000);
        expect(at(0)[0]).toBeCloseTo(0, 6);
    });

    it('keeps the gap in the amplifier own units, so H cannot collide as you zoom in', () => {
        // These labels use the zoom-anchored scale, so they *grow* as the operator zooms
        // in. A fixed 30 px gap cleared the fenced area's top `M` at one zoom and not at
        // the next, and OpenLayers' declutter then dropped field H outright — the label
        // disappeared rather than overlapped. (User's report, 2026-08-27.)
        const clearance = (resolution: number) => {
            const feature = labelFeature();
            feature.properties.additionalInfo = '+S';
            const mark = mineFillPaint()(feature, context(resolution)).find(p => p.text)!;
            const y = (mark.geometry as {coordinates: ProjectedPosition}).coordinates[1];
            return (y - 300_000) / (resolution * mark.text!.scale!);
        };
        expect(clearance(400)).toBeCloseTo(clearance(100), 6);
        expect(clearance(400)).toBeCloseTo(20, 6);
    });

    it('turns each fence cross with the wire it sits on', () => {
        // Built on the screen axes, every cross was an upright `x` wherever it sat, so a
        // sloping side wore marks that did not belong to it. Each arm is 45 degrees off
        // the segment now. (User's call, 2026-08-27.)
        const paints = minedAreaFencedPaint()({
            geometry: {type: 'Polygon', coordinates: [[
                [-400_000, 0], [0, -400_000], [400_000, 0], [0, 400_000], [-400_000, 0],
            ]]},
            properties: {name: TacticalGraphicName.MinedAreaFenced},
        }, context());
        const arms = (paints.find(p => p.geometry.type === 'MultiLineString')!
            .geometry as {coordinates: ProjectedPosition[][]}).coordinates;
        // The ring's sides run at 45 degrees, so every arm lies on an axis.
        for (const [a, b] of arms) {
            const angle = Math.abs((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 180;
            expect(Math.min(Math.abs(angle - 0), Math.abs(angle - 90), Math.abs(angle - 180))).toBeLessThan(1);
        }
    });

    describe('the hostile forms', () => {
        const hostile = (name: TacticalGraphicName): PaintFeature => ({
            geometry: {type: 'Polygon', coordinates: [RING]},
            properties: {name, hostility: TacticalGraphicHostility.hostileFaker},
        });

        it('gives the fenced area a dashed peak standing on its own width', () => {
            const paints = minedAreaFencedPaint()(hostile(TacticalGraphicName.MinedAreaFenced), context());
            const peak = paints.find(p => p.stroke?.dashPx);
            expect(peak).toBeDefined();

            const [left, right] = (peak!.geometry as {coordinates: ProjectedPosition[][]}).coordinates;
            // Two sloping sides meeting above the area, and no base line: the base is the
            // graphic's own top edge.
            expect(left[0]).toEqual([-400_000, 300_000]);
            expect(right[1]).toEqual([400_000, 300_000]);
            expect(left[1]).toEqual(right[0]);
            expect(left[1][0]).toBeCloseTo(0, 6);
            expect(left[1][1]).toBeCloseTo(300_000 + 800_000 * 0.6, 6);
        });

        it('sets an ENY on the fence itself, between north and each shoulder', () => {
            // The Template's `N` boxes sit on the boundary, not above it, and the ray that
            // finds them is the same one the `M`s use. (User's call, 2026-08-27.)
            const paints = minedAreaFencedPaint()(hostile(TacticalGraphicName.MinedAreaFenced), context());
            const eny = paints.filter(p => p.text?.text === 'ENY');
            expect(eny).toHaveLength(2);

            const at = eny.map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
            // On the boundary, not floating above it: each letter sits where its ray
            // leaves the ring. The fixture is 800 x 600 km, so a 60 degree ray leaves
            // through a *side* rather than the top — which is the whole reason this is
            // asserted against the ring rather than against a named edge.
            for (const p of at) expect(onRing(RING, p)).toBeLessThan(1);
            // …north of the middle, one either side of it, and symmetric.
            for (const [, y] of at) expect(y).toBeGreaterThan(0);
            expect(at[0][0]).toBeCloseTo(-at[1][0], 3);

            // The point of the bearing: further from north is further apart. A smaller one
            // brings the pair *together*, which is how 30/330 came to render `ENYENY`.
            expect(Math.abs(at[0][0] - at[1][0])).toBeGreaterThan(600_000);
            expect(at[0][0]).toBeGreaterThan(0);
            expect(at[1][0]).toBeLessThan(0);
        });

        it('keeps field H inside the peak, just above the boundary', () => {
            // Lifted clear of the apex it read as a caption on the marker rather than on
            // the minefield. (User's call, 2026-08-27.)
            const feature: PaintFeature = {
                geometry: {type: 'Point', coordinates: ORIGIN},
                properties: {
                    name: TacticalGraphicName.MinedAreaFenced,
                    hostility: TacticalGraphicHostility.hostileFaker,
                    additionalInfo: '+S',
                },
                bounds: {minX: -400_000, minY: -300_000, maxX: 400_000, maxY: 300_000},
                ring: RING,
            } as unknown as PaintFeature;
            const mark = mineFillPaint()(feature, context()).find(p => p.text)!;
            const y = (mark.geometry as {coordinates: ProjectedPosition}).coordinates[1];
            expect(y).toBeGreaterThan(300_000);
            expect(y).toBeLessThan(300_000 + 800_000 * 0.6);
        });

        it('puts the dynamic depiction ENY due east and west, on the line, and no peak', () => {
            const paints = minefieldAreaPaint()(hostile(TacticalGraphicName.MinefieldDynamicDepiction), context());
            expect(paints.some(p => p.stroke?.dashPx)).toBe(false);

            const eny = paints.filter(p => p.text?.text === 'ENY');
            expect(eny).toHaveLength(2);

            // Where a horizontal ray from the middle leaves the ring: the graphic's widest
            // points, halfway up it, sitting *on* the boundary rather than beside it.
            // (User's call, 2026-08-27.)
            const at = eny.map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
            for (const p of at) expect(onRing(RING, p)).toBeLessThan(1);
            for (const [, y] of at) expect(y).toBeCloseTo(0, 6);
            expect(at.map(([x]) => x).sort((a, b) => a - b)).toEqual([-400_000, 400_000]);
            // Centred on the crossing, not aligned away from it.
            expect(eny.map(p => p.text!.align)).toEqual(['center', 'center']);
        });

        it('holds that rule on a lopsided boundary too', () => {
            // A shape whose widest segment is nowhere near its vertical middle: the old
            // rule set the letters at the segment's own midpoint, which drifted with the
            // shape. The ray does not.
            const lopsided: ProjectedPosition[] = [
                [-500_000, -300_000], [500_000, -100_000], [200_000, 300_000],
                [-300_000, 200_000], [-500_000, -300_000],
            ];
            const paints = minefieldAreaPaint()({
                geometry: {type: 'Polygon', coordinates: [lopsided]},
                properties: {
                    name: TacticalGraphicName.MinefieldDynamicDepiction,
                    hostility: TacticalGraphicHostility.hostileFaker,
                },
            }, context());
            const at = paints.filter(p => p.text?.text === 'ENY')
                .map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
            expect(at).toHaveLength(2);
            for (const p of at) {
                expect(onRing(lopsided, p)).toBeLessThan(1);
                // Halfway between the boundary's lowest and highest points.
                expect(p[1]).toBeCloseTo(0, 6);
            }
        });

        it('draws neither when the graphic is not hostile', () => {
            const friendly = minedAreaFencedPaint()({
                geometry: {type: 'Polygon', coordinates: [RING]},
                properties: {name: TacticalGraphicName.MinedAreaFenced},
            }, context());
            expect(friendly.some(p => p.stroke?.dashPx)).toBe(false);
            expect(friendly.some(p => p.text?.text === 'ENY')).toBe(false);
        });
    });

    it('keeps the fence marks a screen size', () => {
        // Halving the resolution halves them in meters, which is the same pixels — the
        // rule every repeating mark in this library follows.
        const at = (resolution: number) => {
            const paints = minedAreaFencedPaint()(areaFeature(), context(resolution));
            const crosses = paints.find(p => p.geometry.type === 'MultiLineString')!;
            const [a, b] = (crosses.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
            return Math.hypot(b[0] - a[0], b[1] - a[1]);
        };
        expect(at(400)).toBeCloseTo(at(200) * 2, 6);
    });
});

/**
 * # The fence's wire is a decoration, and decorations are capped
 *
 * The crosses were a flat 9 px arm at any size, so a fence 60 px across wore marks a third
 * of its own side and read as a row of glyphs with an outline behind them. They take the
 * shape-relative rule the obstacle teeth and the fortified merlons take, and they are laid
 * out per side rather than round the ring, so none straddles a corner where a mark built on
 * one segment's frame belongs to neither. (User's report, 2026-09-10.)
 */
describe('APP-06 270801 — the fence marks are sized to the area', () => {
    /** A square of `sidePx` on screen, at one metre per pixel. */
    const square = (sidePx: number): PaintFeature => {
        const half = sidePx / 2;
        return {
            geometry: {
                type: 'Polygon',
                coordinates: [[[-half, -half], [half, -half], [half, half], [-half, half], [-half, -half]]],
            },
            properties: {name: TacticalGraphicName.MinedAreaFenced},
        } as PaintFeature;
    };

    /** Every wire arm, as drawn. Two per cross. */
    const arms = (sidePx: number): ProjectedPosition[][] => {
        const marks = minedAreaFencedPaint()(square(sidePx), context(1)).find(
            p => p.geometry.type === 'MultiLineString' && p.stroke,
        );
        return marks ? ((marks.geometry as {coordinates: ProjectedPosition[][]}).coordinates) : [];
    };

    const armLength = (sidePx: number): number => {
        const found = arms(sidePx);
        if (!found.length) return 0;
        return Math.hypot(found[0][1][0] - found[0][0][0], found[0][1][1] - found[0][0][1]);
    };

    it('keeps its full size on an area big enough to carry it', () => {
        expect(armLength(700)).toBeCloseTo(armLength(300), 6);
    });

    it('shrinks the marks on a small area instead of stamping full-size ones', () => {
        expect(armLength(120)).toBeLessThan(armLength(300));
        expect(armLength(60)).toBeLessThan(armLength(120));
    });

    /**
     * **And never drops them.** `decorationScale` returns zero below its floor and the caller
     * draws a plain ring, which here would be 270800 — a different symbol that means the
     * opposite of a fence.
     */
    it('still draws wire on an area far too small for a full-size mark', () => {
        expect(arms(40).length).toBeGreaterThan(0);
        expect(armLength(40)).toBeGreaterThan(0);
    });

    /**
     * A mark belongs to the side it sits on, so a whole one has to fit before the corner.
     *
     * Measured on the cross's centre against its own span along the side. The arms reach
     * across the line as well, which is what a wire mark is, so the perpendicular offset is
     * not what this asks about.
     */
    it('lays whole crosses along each side, none over a corner', () => {
        const sidePx = 300;
        const half = sidePx / 2;
        // The arms run at 45 degrees, so a mark whose arm spans `armLength` is
        // `armLength / sqrt(2)` wide along the side it sits on.
        const halfSpan = armLength(sidePx) / Math.SQRT2 / 2;
        const found = arms(sidePx);
        expect(found.length).toBeGreaterThan(8);
        for (const arm of found) {
            const mid: ProjectedPosition = [(arm[0][0] + arm[1][0]) / 2, (arm[0][1] + arm[1][1]) / 2];
            for (const corner of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
                expect(Math.hypot(mid[0] - corner[0], mid[1] - corner[1])).toBeGreaterThanOrEqual(halfSpan - 1e-6);
            }
        }
    });
});

/**
 * The directional mine's arrow as APP-06 Table 8-24 draws it (user's call, 2026-09-21): a
 * solid shaft from the disc to 1.5 radii, a break, and a small filled head from 1.74 to 2.1.
 * It was a solid shaft to 2.2 under an open chevron. Inside an area it points right, upright,
 * as the table draws the row.
 */
describe('APP-06 Table 8-24 — the directional mine arrow', () => {
    const R = 1000;
    const marks = mineGlyph([0, 0], R, TacticalGraphicMineType.antipersonnelDirectional, '#000');

    it('is a shaft, a break, then a filled head, pointing right', () => {
        const shaft = marks.find(p => p.geometry.type === 'LineString')!;
        const [a, b] = shaft.geometry.coordinates as [number, number][];
        expect(a[0] / R).toBeCloseTo(1, 5);
        expect(b[0] / R).toBeCloseTo(1.5, 5);
        expect(a[1]).toBeCloseTo(0, 5);

        const head = marks.find(p => p.geometry.type === 'Polygon' && (p.geometry.coordinates[0] as unknown[]).length === 4)!;
        expect(head.fill).toBeDefined();
        expect(head.stroke).toBeUndefined();
        const ring = head.geometry.coordinates[0] as [number, number][];
        expect(Math.min(...ring.map(q => q[0])) / R).toBeCloseTo(1.74, 5);
        expect(Math.max(...ring.map(q => q[0])) / R).toBeCloseTo(2.1, 5);
        expect(Math.max(...ring.map(q => q[1])) / R).toBeCloseTo(0.19, 5);
        // The break: the head starts past where the shaft ends.
        expect(Math.min(...ring.map(q => q[0]))).toBeGreaterThan(b[0]);
    });

    it('reaches as far as the extent table says, so rows stay clear', () => {
        const xs = marks.flatMap(p => {
            const out: number[] = [];
            (function walk(n: unknown): void {
                if (!Array.isArray(n)) return;
                if (typeof n[0] === 'number') out.push(n[0] as number);
                else n.forEach(walk);
            })((p.geometry as {coordinates: unknown}).coordinates);
            return out;
        });
        expect(Math.max(...xs) / R).toBeCloseTo(mineGlyphExtent(TacticalGraphicMineType.antipersonnelDirectional).right, 5);
    });
});
