/**
 * Labels stay on their graphic, and go when they are too small to read (user, 2026-10-23).
 *
 * Three ways they used to leave: an axis of advance set its name and date-time groups as one
 * straight line back from the head, which ran out through the wall wherever the arrow turned,
 * smooth or hard; an "ACP n" kept a minimum size and overran a circle a few pixels across;
 * and that minimum went negative zoomed out, which MapLibre drew across the whole world.
 */
import type {Geometry, Position} from 'geojson';
import {buildPaintedGraphic, configureTacticalGraphics, paintGraphic, resetTacticalGraphicsConfig} from '../index';
import {MIN_LEGIBLE_TEXT_PX} from '../core/config';
import {TacticalGraphicName as N} from '../core/type';
import type {Paint, PaintContext} from '../core/paint';
import {acpLabelScale} from './corridorPaints';
import {textAlongPath} from './curvedText';
import {withLegibleText} from './paintFunctions';

afterEach(() => resetTacticalGraphicsConfig());

const context = (resolution: number): PaintContext => ({resolution, measureText: (text: string) => text.length * 9});

const textPx = (paint: Paint) => 16 * (paint.text?.scale ?? 1);

describe('the legibility floor', () => {
    const at = {type: 'Point' as const, coordinates: [0, 0] as [number, number]};
    const label = (scale: number): Paint => ({geometry: at, text: {text: 'PL', font: 'bold 16px sans-serif', fill: '#000', scale}});

    it('takes away text drawn under MIN_LEGIBLE_TEXT_PX, keeps text at or over it', () => {
        const kept = withLegibleText([label(MIN_LEGIBLE_TEXT_PX / 16), label(0.36), label(-1.3), label(NaN)]);
        expect(kept.map(p => p.text?.scale)).toEqual([MIN_LEGIBLE_TEXT_PX / 16]);
    });

    it('keeps the rest of a mark whose text it takes', () => {
        const ringed: Paint = {...label(0.2), stroke: {color: '#000', widthPx: 2}};
        expect(withLegibleText([ringed])).toEqual([{geometry: at, stroke: {color: '#000', widthPx: 2}}]);
    });

    it('is applied to every painted graphic', () => {
        // A phase line a few pixels long, zoomed far out: its labels shrink with it.
        const graphic = buildPaintedGraphic(
            N.PhaseLine,
            {
                type: 'LineString',
                coordinates: [
                    [0, 0],
                    [0.05, 0],
                ],
            },
            {designation: 'BLUE'},
            5000,
        )!;
        const marks = paintGraphic(graphic, context(5000));
        expect(marks.filter(p => p.text && textPx(p) < MIN_LEGIBLE_TEXT_PX)).toEqual([]);
    });
});

describe('ACP labels', () => {
    it('are never given a negative size, and fit their circle', () => {
        // A circle under a pixel across, at a zoom-anchored scale of 0.1: the old floor gave -1.3.
        expect(acpLabelScale(context(1), 'ACP 1', 'bold 16px sans-serif', 0.1)).toBeGreaterThanOrEqual(0);
        expect(acpLabelScale(context(1), 'ACP 1', 'bold 16px sans-serif', 0.1, 0.5, 0.4)).toBe(0);
        const scale = acpLabelScale(context(1), 'ACP 1', 'bold 16px sans-serif', 1, 20, 2);
        expect('ACP 1'.length * 9 * scale).toBeLessThanOrEqual(2 * 20);
    });

    it('go rather than overrun a corridor zoomed out', () => {
        const base: Geometry = {
            type: 'LineString',
            coordinates: [
                [-116.51, 35.16],
                [-116.54, 35.23],
                [-116.45, 35.24],
            ],
        };
        const corridor = buildPaintedGraphic(N.AirCorridor, base, {width: 2500}, 50)!;
        const zoomedOut = paintGraphic(corridor, context(40000));
        expect(zoomedOut.filter(p => p.text?.text.startsWith('ACP'))).toEqual([]);
        expect(paintGraphic(corridor, context(20)).filter(p => p.text?.text.startsWith('ACP')).length).toBe(3);
    });

    it('size from the corridor half-width it files as width, as OpenLayers does', () => {
        // A corridor files `width`, never `radius`; read only `radius`, an imported one drew its
        // ACP labels against a fixed 12 px circle, a third of OpenLayers' size.
        const base: Geometry = {
            type: 'LineString',
            coordinates: [
                [-116.51, 35.16],
                [-116.54, 35.23],
                [-116.45, 35.24],
            ],
        };
        const corridor = buildPaintedGraphic(N.AirCorridor, base, {width: 2500}, 50)!;
        expect(corridor.labels?.graphicSize).toBe(1250);
        const acp = paintGraphic(corridor, context(20)).find(p => p.text?.text === 'ACP 1')!;
        // The circle is 1250 m across at 20 m/px, so about 62 px in radius: the label fills its
        // share of that, capped at the largest a graphic's label is drawn.
        expect(acp.text!.scale).toBeGreaterThan(1);
    });
});

/** Whether `p` is inside the closed outline `ring`. */
function inside(p: Position, ring: Position[]): boolean {
    let isIn = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (
            ring[i][1] > p[1] !== ring[j][1] > p[1] &&
            p[0] < ((ring[j][0] - ring[i][0]) * (p[1] - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]
        ) {
            isIn = !isIn;
        }
    }
    return isIn;
}

describe('a long axis-of-advance label', () => {
    // The supporting axis from the user's file: tip first, a corner in the middle, the width
    // point last. At this zoom the name and both date-time groups are longer than the stretch
    // behind the head.
    const base: Geometry = {
        type: 'LineString',
        coordinates: [
            [-116.515, 35.292],
            [-116.598, 35.296],
            [-116.676, 35.306],
            [-116.53998161225579, 35.32238961302728],
        ],
    };
    const properties = {designation: 'COPPER', startDate: '091649ZOCT26', endDate: '301650ZOCT26', radius: 600};
    const resolution = 30;

    function glyphsAndBody() {
        const graphic = buildPaintedGraphic(N.SupportingAxisOfAdvance, base, properties, resolution)!;
        const marks = paintGraphic(graphic, context(resolution));
        // The walls and the head, walked in order, close into the body's outline.
        const body = marks
            .filter(p => !p.text && p.geometry.type === 'MultiLineString')
            .flatMap(p => (p.geometry as {coordinates: Position[][]}).coordinates.flat());
        const glyphs = marks.filter(p => p.text && p.text.fill !== 'rgba(0,0,0,0)');
        return {glyphs, body};
    }

    it.each([
        ['hard', false],
        ['smooth', true],
    ])('stays inside the arrow, %s', (_, smooth) => {
        configureTacticalGraphics({smoothLines: smooth});
        const {glyphs, body} = glyphsAndBody();
        expect(glyphs.length).toBeGreaterThan(20);
        const outside = glyphs.filter(p => !inside(p.geometry.coordinates as Position, body)).map(p => p.text!.text);
        expect(outside).toEqual([]);
    });

    it('reads left to right and paints every halo before any letter', () => {
        configureTacticalGraphics({smoothLines: true});
        const {glyphs} = glyphsAndBody();
        const xs = glyphs.map(p => (p.geometry.coordinates as Position)[0]);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        expect(glyphs.map(p => p.text!.text).join('')).toBe('COPPER091649ZOCT26-301650ZOCT26');
    });
});

describe('textAlongPath', () => {
    const spec = {text: 'AB CD', font: 'bold 16px sans-serif', fill: '#000', halo: {color: '#fff', widthPx: 2}, scale: 1};

    it('leaves a run that fits on one segment to the straight label', () => {
        expect(
            textAlongPath(
                [
                    [0, 0],
                    [1000, 0],
                    [1000, 1000],
                ],
                900,
                'end',
                spec,
                context(1),
            ),
        ).toBeUndefined();
    });

    it('bends a run across a corner, halos first', () => {
        const marks = textAlongPath(
            [
                [0, 0],
                [100, 0],
                [100, 100],
            ],
            120,
            'center',
            spec,
            context(1),
        )!;
        expect(marks.map(p => p.text!.text)).toEqual(['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']);
        expect(marks.slice(0, 4).every(p => p.text!.fill === 'rgba(0,0,0,0)')).toBe(true);
        expect(marks.slice(4).every(p => p.text!.halo === undefined)).toBe(true);
    });

    it('shrinks a run longer than its path to fit it', () => {
        const marks = textAlongPath(
            [
                [0, 0],
                [20, 0],
                [20, 10],
            ],
            0,
            'start',
            spec,
            context(1),
        )!;
        expect(marks[0].text!.scale).toBeCloseTo(30 / 45);
    });
});

describe('a doctrinal prefix outlasts the name it is joined to', () => {
    // A phase line about 220 km long. Zoomed out, "PL BLUE" shrinks under the floor; the name
    // goes and "PL" stays at 6 px until the line itself is too short to carry it.
    const line = buildPaintedGraphic(N.PhaseLine, {type: 'LineString', coordinates: [[0, 0], [2, 0]]}, {designation: 'BLUE'}, 100)!;
    const labels = (resolution: number) => paintGraphic(line, context(resolution)).filter(p => p.text);

    it('draws the whole label while it is readable, then the prefix alone, then nothing', () => {
        const seen = [100, 1000, 3000, 6000, 12_000, 24_000, 100_000].map(r => labels(r).map(p => `${p.text!.text}@${textPx(p).toFixed(1)}`)[0] ?? '');
        expect(seen[0].startsWith('PL BLUE@')).toBe(true);
        const prefixOnly = seen.filter(s => s.startsWith('PL@'));
        expect(prefixOnly.length).toBeGreaterThan(0);
        prefixOnly.forEach(s => expect(Number(s.split('@')[1])).toBeGreaterThanOrEqual(MIN_LEGIBLE_TEXT_PX));
        expect(seen[seen.length - 1]).toBe('');
        // Never a name under the floor, never a bare name.
        seen.filter(Boolean).forEach(s => expect(s.startsWith('PL')).toBe(true));
    });
});

describe('cover, guard and screen', () => {
    it('never draw their letter under 6 px, and drop it once the symbol is tiny', () => {
        const cover = buildPaintedGraphic(N.Cover, {type: 'LineString', coordinates: [[0, 0], [0.2, 0]]}, {}, 100)!;
        const letters = (resolution: number) => paintGraphic(cover, context(resolution)).filter(p => p.text?.text === 'C');
        const sizes = [50, 200, 400, 800, 1600, 3200].map(r => letters(r).map(textPx)[0]);
        sizes.filter(px => px !== undefined).forEach(px => expect(px!).toBeGreaterThanOrEqual(MIN_LEGIBLE_TEXT_PX - 1e-9));
        expect(sizes[0]).toBeGreaterThan(MIN_LEGIBLE_TEXT_PX);
        // Held at the floor on the way down rather than taken by it.
        expect(sizes.some(px => px !== undefined && Math.abs(px - MIN_LEGIBLE_TEXT_PX) < 1e-9)).toBe(true);
        expect(letters(100_000)).toEqual([]);
    });
});
