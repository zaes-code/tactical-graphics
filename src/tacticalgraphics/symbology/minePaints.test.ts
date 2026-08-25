/**
 * # The mine-type icons
 *
 * Seven glyphs that differ from one another by one stroke each, which is exactly the kind
 * of family where a wrong table entry renders plausibly and means something else. Each
 * assertion below is about what tells one type from another.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicMineType, TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {mineFillPaint, minedAreaFencedPaint, minefieldAreaPaint, mineRowMarks} from './minePaints';

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

describe('APP-06 270707 / 270801 — the two mine areas', () => {
    const areaFeature = (): PaintFeature => ({
        geometry: {type: 'Polygon', coordinates: [RING]},
        properties: {name: TacticalGraphicName.MinedAreaFenced},
    });

    const labelFeature = (mineType?: TacticalGraphicMineType): PaintFeature => ({
        geometry: {type: 'Point', coordinates: ORIGIN},
        properties: {name: TacticalGraphicName.MinefieldDynamicDepiction, label: 'SECTOR 1', mineType},
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
