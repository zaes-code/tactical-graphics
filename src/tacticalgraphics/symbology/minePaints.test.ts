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

    // "The area boundary will be filled with the type of mine(s) contained in the
    //  minefield [...] the H field will be filled with an 'S' or a '+S' as appropriate,
    //  and a self-destruct DTG will be posted in the W field."
    it('sets field H above the boundary and the DTG below it, and no designation', () => {
        const feature = labelFeature();
        feature.properties.additionalInfo = '+S';
        feature.properties.startDate = '240700ZMAY2026';
        feature.properties.label = 'IGNORED';

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
        expect(clearance(400)).toBeCloseTo(30, 6);
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

        it('sets an ENY at each end of that base, clear of the sloping sides', () => {
            const paints = minedAreaFencedPaint()(hostile(TacticalGraphicName.MinedAreaFenced), context());
            const eny = paints.filter(p => p.text?.text === 'ENY');
            expect(eny).toHaveLength(2);
            const xs = eny.map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates[0]);
            expect(xs.map(x => Math.abs(x))).toEqual([400_000 * 0.67, 400_000 * 0.67]);
        });

        it('lifts field H above the peak rather than into it', () => {
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
            expect(y).toBeGreaterThan(300_000 + 800_000 * 0.6);
        });

        it('puts the dynamic depiction ENY on its flanks instead, and no peak', () => {
            const paints = minefieldAreaPaint()(hostile(TacticalGraphicName.MinefieldDynamicDepiction), context());
            expect(paints.some(p => p.stroke?.dashPx)).toBe(false);

            const eny = paints.filter(p => p.text?.text === 'ENY');
            expect(eny).toHaveLength(2);
            // The midpoints of the westmost and eastmost segments, pushed outward so the
            // letters clear the line work, and reading away from the shape.
            const [west, east] = eny.map(p => (p.geometry as {coordinates: ProjectedPosition}).coordinates);
            expect(west[0]).toBeLessThan(-400_000);
            expect(east[0]).toBeGreaterThan(400_000);
            expect(west[1]).toBeCloseTo(0, 6);
            expect(eny.map(p => p.text!.align)).toEqual(['right', 'left']);
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
