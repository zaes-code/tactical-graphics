/**
 * # APP-06 270701 minefield, static depiction
 *
 * A closed frame that follows the drawn line, with Table 8-24's glyph repeated inside it.
 * @see minefieldStaticPaint, staticMinefieldLayout
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {renderTacticalGraphic} from '../core/render';
import {GRAPHIC_ENTITY_CODES} from '../core/entityCodes';
import {TacticalGraphicHostility, TacticalGraphicMineType, TacticalGraphicName} from '../core/type';
import {TacticalGraphicsConfig, setTacticalGraphicsConfig} from '../core/config';
import {getPaintFunction, isPaintable} from './registry';
import {mineGlyph} from './minePaints';
import {pathLength} from './decorations';
import {
    STATIC_MINEFIELD_HALF_HEIGHT,
    STATIC_MINEFIELD_MARGIN,
    STATIC_MINEFIELD_MINE_PX,
    STATIC_MINEFIELD_PITCH,
    minefieldStaticPaint,
    minelinePaint,
    staticMinefieldLayout,
} from './protectionLinePaints';

const N = TacticalGraphicName.MinefieldStaticDepiction;

const context = (resolution = 40): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

/** 40 km due east: 1,000 px at a resolution of 40. */
const EAST: ProjectedPosition[] = [
    [0, 0],
    [40_000, 0],
];
/** Two legs at a right angle. */
const BENT: ProjectedPosition[] = [
    [0, 0],
    [20_000, 0],
    [20_000, 20_000],
];

const feature = (coordinates: ProjectedPosition[] = EAST, properties: Record<string, unknown> = {}, name = N): PaintFeature => ({
    geometry: {type: 'LineString', coordinates},
    properties: {name, ...properties},
});

const points = (paint: Paint): ProjectedPosition[] => {
    const out: ProjectedPosition[] = [];
    const walk = (value: unknown): void => {
        if (!Array.isArray(value)) return;
        if (typeof value[0] === 'number') return void out.push(value as ProjectedPosition);
        value.forEach(walk);
    };
    walk((paint.geometry as {coordinates: unknown}).coordinates);
    return out;
};

/** Even-odd point in polygon. */
const inside = (ring: ProjectedPosition[], [x, y]: ProjectedPosition): boolean => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
};

/** How far along a straight eastward line a point sits. */
const along = (p: ProjectedPosition) => p[0];

beforeEach(() => setTacticalGraphicsConfig(new TacticalGraphicsConfig({enemyLabels: true})));
afterEach(() => setTacticalGraphicsConfig(new TacticalGraphicsConfig({})));

describe('APP-06 270701 — static-depiction minefield', () => {
    it('is registered under its entity code, with a generator and a paint', () => {
        expect(GRAPHIC_ENTITY_CODES[N]).toBe('270701');
        expect(isPaintable(N)).toBe(true);
        expect(getPaintFunction(N)?.graphic).toBeDefined();
        const out = renderTacticalGraphic({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [10, 50],
                    [10.1, 50],
                ],
            },
            properties: {tacticalGraphic: {name: N}},
        } as never);
        expect(out.graphic.geometry.type).toBe('LineString');
    });

    it('draws a closed frame that encloses every mine', () => {
        for (const path of [EAST, BENT]) {
            for (const mineType of Object.values(TacticalGraphicMineType)) {
                const paints = minefieldStaticPaint()(feature(path, {mineType}), context());
                const frame = paints[0].geometry;
                expect(frame.type).toBe('LineString');
                const ring = (frame as {coordinates: ProjectedPosition[]}).coordinates;
                expect(ring[0]).toEqual(ring[ring.length - 1]);
                const marks = paints.slice(1).filter(p => !p.text);
                expect(marks.length).toBeGreaterThan(0);
                for (const mark of marks) for (const p of points(mark)) expect(inside(ring, p)).toBe(true);
            }
        }
    });

    it('spaces the mines evenly, with the same margin before the first as after the last', () => {
        const layout = staticMinefieldLayout(EAST, 40, TacticalGraphicMineType.antitank)!;
        const xs = layout.mines.map(m => along(m.at));
        expect(xs.length).toBeGreaterThan(2);
        const pitch = xs[1] - xs[0];
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(pitch, 6);
        expect(pitch).toBeCloseTo(STATIC_MINEFIELD_PITCH * layout.radius, 6);
        const before = xs[0];
        const after = 40_000 - xs[xs.length - 1];
        expect(before).toBeCloseTo(after, 6);
        expect(before).toBeGreaterThanOrEqual(STATIC_MINEFIELD_MARGIN * layout.radius - 1e-6);
        expect(before).toBeLessThan(STATIC_MINEFIELD_MARGIN * layout.radius + pitch / 2 + 1e-6);
        // The frame ends are the line's ends.
        const frameXs = layout.frame.map(p => p[0]);
        expect(Math.min(...frameXs)).toBeCloseTo(0, 6);
        expect(Math.max(...frameXs)).toBeCloseTo(40_000, 6);
    });

    it('keeps the mines and the frame a constant size on screen, so the count follows the zoom', () => {
        const counts = [80, 40, 20].map(resolution => {
            const layout = staticMinefieldLayout(EAST, resolution, TacticalGraphicMineType.antitank)!;
            expect(layout.radius / resolution).toBeCloseTo(STATIC_MINEFIELD_MINE_PX, 6);
            expect(layout.halfHeight / resolution).toBeCloseTo(STATIC_MINEFIELD_HALF_HEIGHT * STATIC_MINEFIELD_MINE_PX, 6);
            return layout.mines.length;
        });
        expect(counts[1]).toBeGreaterThan(counts[0]);
        expect(counts[2]).toBeGreaterThan(counts[1]);
    });

    it('draws the same glyph the mineline does, antitank filled and antipersonnel with antennae', () => {
        const glyphs = (mineType: TacticalGraphicMineType) => {
            const paints = minefieldStaticPaint()(feature(EAST, {mineType}), context());
            const layout = staticMinefieldLayout(EAST, 40, mineType)!;
            const color = paints[0].stroke!.color;
            const expected = mineGlyph(layout.mines[0].at, layout.radius, mineType, color, 40, {along: layout.mines[0].along, arrowAcross: true});
            expect(paints.slice(1, 1 + expected.length)).toEqual(expected);
            return expected;
        };
        const at = glyphs(TacticalGraphicMineType.antitank);
        expect(at.map(p => p.geometry.type)).toEqual(['Polygon']);
        const ap = glyphs(TacticalGraphicMineType.antipersonnel);
        expect(ap.map(p => p.geometry.type)).toEqual(['Polygon', 'MultiLineString']);
    });

    it('centres each glyph across the frame by its reach', () => {
        const ap = staticMinefieldLayout(EAST, 40, TacticalGraphicMineType.antipersonnel)!;
        // Antennae reach 2.2 radii up and the disc 1 down: the centre drops 0.6 radii.
        expect(ap.mines[0].at[1]).toBeCloseTo(-0.6 * ap.radius, 6);
        const at = staticMinefieldLayout(EAST, 40, TacticalGraphicMineType.antitank)!;
        expect(at.mines[0].at[1]).toBeCloseTo(0, 6);
    });

    it('bends with a bent line, rails parallel to it', () => {
        const layout = staticMinefieldLayout(BENT, 40, TacticalGraphicMineType.antitank)!;
        // Left rail, two corners and the mitred bend: 3 + 3 + the closing point.
        expect(layout.frame).toHaveLength(7);
        const h = layout.halfHeight;
        expect(layout.frame[0]).toEqual([0, h]);
        expect(layout.frame[1][0]).toBeCloseTo(20_000 - h, 6);
        expect(layout.frame[1][1]).toBeCloseTo(h, 6);
        // Mines on both legs.
        expect(layout.mines.some(m => m.at[1] === 0 && m.at[0] < 20_000)).toBe(true);
        expect(layout.mines.some(m => m.at[0] === 20_000 && m.at[1] > 0)).toBe(true);
        expect(pathLength(BENT)).toBe(40_000);
    });

    it('draws a two-point line as a rectangle', () => {
        const layout = staticMinefieldLayout(EAST, 40, TacticalGraphicMineType.antitank)!;
        const h = layout.halfHeight;
        expect(layout.frame).toEqual([
            [0, h],
            [40_000, h],
            [40_000, -h],
            [0, -h],
            [0, h],
        ]);
    });

    it('keeps the frame and one centred mine on a short line, shrinking both together', () => {
        // 40 px on screen, under the 44 px a full-size mine and its margins need.
        const short: ProjectedPosition[] = [
            [0, 0],
            [1_600, 0],
        ];
        const layout = staticMinefieldLayout(short, 40, TacticalGraphicMineType.antitank)!;
        expect(layout.mines).toHaveLength(1);
        expect(layout.mines[0].at[0]).toBeCloseTo(800, 6);
        expect(layout.radius / 40).toBeCloseTo((STATIC_MINEFIELD_MINE_PX * 40) / (2 * STATIC_MINEFIELD_MARGIN * STATIC_MINEFIELD_MINE_PX), 6);
        expect(layout.halfHeight / layout.radius).toBeCloseTo(STATIC_MINEFIELD_HALF_HEIGHT, 6);

        // 6 px: the mine is under the legibility floor, and the frame is drawn alone.
        const tiny: ProjectedPosition[] = [
            [0, 0],
            [240, 0],
        ];
        const bare = minefieldStaticPaint()(feature(tiny), context());
        expect(bare).toHaveLength(1);
        expect(bare[0].geometry.type).toBe('LineString');
    });

    it('keeps full size on a short line when the host asks for full-size decorations', () => {
        setTacticalGraphicsConfig(new TacticalGraphicsConfig({fullSizeDecorations: true}));
        const layout = staticMinefieldLayout(
            [
                [0, 0],
                [1_600, 0],
            ],
            40,
            TacticalGraphicMineType.antitank,
        )!;
        expect(layout.radius / 40).toBeCloseTo(STATIC_MINEFIELD_MINE_PX, 6);
        expect(layout.mines).toHaveLength(1);
    });

    it('draws in the mineline’s colour', () => {
        const box = minefieldStaticPaint()(feature(), context())[0].stroke!.color;
        const line = minelinePaint(TacticalGraphicName.Mineline)(feature(EAST, {}, TacticalGraphicName.Mineline), context())[0].stroke!.color;
        expect(box).toBe(line);
    });

    it('sets ENY beyond each end when hostile, H above and W below', () => {
        const friendly = minefieldStaticPaint()(feature(), context());
        expect(friendly.filter(p => p.text)).toHaveLength(0);

        const paints = minefieldStaticPaint()(
            feature(EAST, {hostility: TacticalGraphicHostility.hostileFaker, additionalInfo: '+S', startDate: '032400ZJUL2007'}),
            context(),
        );
        const text = paints.filter(p => p.text);
        const at = (t: string) => text.filter(p => p.text!.text === t).map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
        const eny = at('ENY');
        expect(eny).toHaveLength(2);
        expect(eny[0][0]).toBeLessThan(0);
        expect(eny[1][0]).toBeGreaterThan(40_000);
        const layout = staticMinefieldLayout(EAST, 40, TacticalGraphicMineType.unspecified)!;
        expect(at('+S')[0][1]).toBeGreaterThan(layout.halfHeight);
        expect(at('032400ZJUL2007')[0][1]).toBeLessThan(-layout.halfHeight);
    });

    it('draws nothing for a line of no length', () => {
        expect(
            minefieldStaticPaint()(
                feature([
                    [0, 0],
                    [0, 0],
                ]),
                context(),
            ),
        ).toEqual([]);
    });
});
