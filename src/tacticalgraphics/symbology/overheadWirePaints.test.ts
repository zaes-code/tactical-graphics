/**
 * # The two obstacle symbols added on 2026-09-01
 *
 * **Both are pinned against the thing that makes them wrong rather than against a snapshot.**
 * The overhead wire's pylon is a screen-sized glyph, so what has to hold is that it stops
 * being the same size when the zoom changes and does not stop being the same size when the
 * wire gets longer. The safe lane shares its entire outline with the passage lane, so what
 * has to hold is that the amplifiers are the only difference — a picture test would pass on
 * both halves of that and prove nothing.
 */

import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {resetTacticalGraphicsConfig} from '../core/config';
import {TacticalGraphicName} from '../core/type';
import {getPaintFunction} from './registry';
import {formatLaneWidth, PYLON_HEIGHT_PX} from './overheadWirePaints';

const context = (resolution = 10): PaintContext => ({
    resolution,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
});

beforeEach(() => resetTacticalGraphicsConfig());

/** Every stroked path a paint emits, flattened, whatever geometry type carried it. */
const paths = (name: TacticalGraphicName, feature: PaintFeature, ctx: PaintContext): ProjectedPosition[][] => {
    const paint = getPaintFunction(name)?.graphic;
    if (!paint) throw new Error(`no graphic paint for ${name}`);
    const out: ProjectedPosition[][] = [];
    for (const p of paint(feature, ctx)) {
        if (!p.stroke) continue;
        const g = p.geometry;
        if (g.type === 'LineString') out.push(g.coordinates as ProjectedPosition[]);
        else if (g.type === 'MultiLineString') out.push(...(g.coordinates as ProjectedPosition[][]));
    }
    return out;
};

const texts = (name: TacticalGraphicName, feature: PaintFeature, ctx: PaintContext): string[] => {
    const paint = getPaintFunction(name)?.graphic;
    return (paint?.(feature, ctx) ?? []).map(p => p.text?.text).filter((t): t is string => Boolean(t));
};

describe('APP-06 282003 — overhead wire', () => {
    const NAME = TacticalGraphicName.OverheadWire;

    /** The drawn line, as the generator publishes it: the base's own vertices. */
    const wire = (coords: ProjectedPosition[], props: Record<string, unknown> = {}): PaintFeature =>
        ({
            geometry: {type: 'LineString', coordinates: coords},
            properties: {name: NAME, ...props},
        }) as unknown as PaintFeature;

    const STRAIGHT: ProjectedPosition[] = [
        [0, 0],
        [10_000, 0],
    ];

    /** The tallest and shortest y a pylon's strokes reach, relative to its anchor. */
    const pylonSpan = (all: ProjectedPosition[][], anchorX: number) => {
        const ys = all
            .flat()
            .filter(p => Math.abs(p[0] - anchorX) < 5_000)
            .map(p => p[1]);
        return Math.max(...ys) - Math.min(...ys);
    };

    it('stands one pylon on every anchor point, not just the two ends', () => {
        const bent: ProjectedPosition[] = [
            [0, 0],
            [10_000, 4_000],
            [20_000, 0],
        ];
        // Seven strokes make a pylon, plus the one wire.
        expect(paths(NAME, wire(bent), context())).toHaveLength(7 * 3 + 1);
        expect(paths(NAME, wire(STRAIGHT), context())).toHaveLength(7 * 2 + 1);
    });

    it('draws the wire along the anchors themselves', () => {
        const [first] = paths(NAME, wire(STRAIGHT), context());
        expect(first).toEqual(STRAIGHT);
    });

    it('stands the pylon up, not down', () => {
        // The glyph's own y runs down and the projection's runs up; flipping the wrong way
        // buries the pylon below the wire and still looks like a symbol.
        const above = paths(NAME, wire(STRAIGHT), context())
            .slice(1)
            .flat()
            .filter(p => p[1] > 0.001).length;
        const below = paths(NAME, wire(STRAIGHT), context())
            .slice(1)
            .flat()
            .filter(p => p[1] < -0.001).length;
        expect(above).toBeGreaterThan(0);
        expect(below).toBe(0);
    });

    it('holds the pylon to a constant screen size across zooms', () => {
        // Its span in metres has to track the resolution exactly, which is what "the same
        // number of pixels" means. A glyph baked in metres passes nothing here.
        const near = pylonSpan(paths(NAME, wire(STRAIGHT), context(10)).slice(1), 0);
        const far = pylonSpan(paths(NAME, wire(STRAIGHT), context(40)).slice(1), 0);
        expect(far / near).toBeCloseTo(4, 6);
        expect(near / 10).toBeCloseTo(PYLON_HEIGHT_PX, 6);
    });

    it('does not grow the pylon when the wire gets longer', () => {
        const short = pylonSpan(paths(NAME, wire(STRAIGHT), context()).slice(1), 0);
        const long = pylonSpan(
            paths(
                NAME,
                wire([
                    [0, 0],
                    [400_000, 0],
                ]),
                context(),
            ).slice(1),
            0,
        );
        expect(long).toBeCloseTo(short, 6);
    });

    it('paints no text at all — 282003 letters nothing', () => {
        // Not "paints no text when the bag is empty": a bag that arrived with a name and a
        // date from an import must still put nothing on a symbol that has no box for either.
        expect(texts(NAME, wire(STRAIGHT, {designation: 'ALPHA', startDate: 'A', endDate: 'B'}), context())).toEqual(
            [],
        );
    });

    it('draws nothing for a line that has not got two points yet', () => {
        expect(paths(NAME, wire([[0, 0]]), context())).toEqual([]);
    });
});

describe('APP-06 290600 — safe lane or gap', () => {
    const NAME = TacticalGraphicName.SafeLaneOrGap;
    const ENTRY: ProjectedPosition = [0, 0];
    const EXIT: ProjectedPosition = [0, -20_000];

    /** The realized graphic: `[splay, centre line, splay]`, as `passageLineGraphic` emits. */
    const lane = (props: Record<string, unknown> = {}, entry = ENTRY, exit = EXIT): PaintFeature =>
        ({
            geometry: {
                type: 'MultiLineString',
                coordinates: [
                    [[-3_000, -3_000], exit, [3_000, -3_000]],
                    [entry, exit],
                    [[-3_000, 3_000], entry, [3_000, 3_000]],
                ],
            },
            properties: {name: NAME, ...props},
        }) as unknown as PaintFeature;

    it('draws the same outline as the passage lane, from the same function', () => {
        const passage = getPaintFunction(TacticalGraphicName.PassageLane)!.graphic!;
        const mine = paths(NAME, lane(), context());
        const theirs = passage(lane(), context())
            .filter(p => p.stroke)
            .flatMap(p =>
                p.geometry.type === 'MultiLineString' ? (p.geometry.coordinates as ProjectedPosition[][]) : [],
            );
        expect(mine).toEqual(theirs);
    });

    it('stacks T, AM and the date range, in that order', () => {
        const marks = texts(NAME, lane({designation: 'LANE ALPHA', width: 4.5, startDate: 'A', endDate: 'B'}), context());
        expect(marks).toHaveLength(1);
        expect(marks[0].split('\n')).toEqual(['LANE ALPHA', '4.5M', 'A - B']);
    });

    it('leaves out whichever of them is unset, without a blank line', () => {
        expect(texts(NAME, lane({designation: 'L'}), context())[0]).toBe('L');
        expect(texts(NAME, lane({width: 4.5}), context())[0]).toBe('4.5M');
        expect(texts(NAME, lane(), context())).toEqual([]);
    });

    it('keeps the name and drops the rest when amplifiers are hidden', () => {
        const hidden = {
            ...lane({designation: 'LANE ALPHA', width: 4.5, startDate: 'A', endDate: 'B'}),
            hideAmplifiers: true,
        } as PaintFeature;
        // One mark still, carrying the designation alone -- the column is a single mark, so
        // tagging the whole thing as an amplifier would take the name with it.
        expect(texts(NAME, hidden, context())).toEqual(['LANE ALPHA']);
    });

    it('sets the column on the same side of the lane whichever way it was drawn', () => {
        const spotOf = (entry: ProjectedPosition, exit: ProjectedPosition) => {
            const paint = getPaintFunction(NAME)!.graphic!;
            const mark = paint(lane({designation: 'L'}, entry, exit), context()).find(p => p.text);
            return (mark!.geometry as {coordinates: ProjectedPosition}).coordinates;
        };
        // Left of travel, which is the plate's side: drawn southward the column is east of
        // the lane, drawn northward it is west. Taking the side from the map's north
        // instead would put it on the same compass side both times, which is the bug this
        // is for -- the column would swap sides of the symbol on a redraw.
        expect(spotOf([0, 0], [0, -20_000])[0]).toBeGreaterThan(0);
        expect(spotOf([0, -20_000], [0, 0])[0]).toBeLessThan(0);
    });

    it('does not print the date range twice', () => {
        // The line work is the passage lane's paint, which draws a date-time group of its
        // own behind the fishtail. It has to be off here, or one lane shows its dates in
        // two places.
        const marks = texts(NAME, lane({startDate: 'A', endDate: 'B'}), context());
        expect(marks.filter(t => t.includes('A - B'))).toHaveLength(1);
    });
});

describe('the AM amplifier as the plate writes it', () => {
    it('appends the unit with no space, and drops a pointless decimal', () => {
        expect(formatLaneWidth(4.5)).toBe('4.5M');
        expect(formatLaneWidth(4)).toBe('4M');
        expect(formatLaneWidth(4.04)).toBe('4M');
    });

    it('renders nothing for a width nobody set', () => {
        expect(formatLaneWidth(undefined)).toBe('');
        expect(formatLaneWidth(0)).toBe('');
        expect(formatLaneWidth(Number.NaN)).toBe('');
    });
});
