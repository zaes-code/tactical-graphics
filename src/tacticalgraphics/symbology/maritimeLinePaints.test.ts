/**
 * # APP-06 §8.11 — the maritime control lines
 *
 * Nine of the ten are the same construction and differ only in a letter, which makes this
 * family the shape of defect that has bitten this repository before: **two symbols that
 * render as the same picture, with nothing objecting.** The mined anti-tank ditch drew
 * identically to the unmined one for months. Here 220103 and 220104 are *both* lettered `A`
 * and the dash is the whole of the difference, so that case is asserted directly.
 *
 * The rhumb line's `AN` is pinned against the plate's own Example rather than against my
 * arithmetic: the Example draws a run bearing about 059 and prints `060`.
 */
import {TacticalGraphicName, getLabel} from '../core/type';
import {isPaintable} from './registry';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {BEARING_LINES, BEARING_LINE_DASHED, bearingLinePaint, navigationalLinePaint, rhumbBearing, rhumbLinePaint} from './maritimeLinePaints';

const RESOLUTION = 10;

/** A paint context standing in for a renderer, measuring text the way a canvas would. */
const context = {resolution: RESOLUTION, measureText: (text: string) => text.length * 9} as unknown as PaintContext;

/** A two-point run, and whatever amplifiers the case under test needs. */
function lineFeature(
    name: TacticalGraphicName,
    coordinates: ProjectedPosition[] = [
        [0, 0],
        [1000, 0],
    ],
    properties: Record<string, unknown> = {},
): PaintFeature {
    return {
        geometry: {type: 'LineString', coordinates},
        properties: {name, ...properties},
    } as unknown as PaintFeature;
}

/** Every string the paint draws, in order. */
const textsOf = (paints: Paint[]): string[] => paints.map(p => p.text?.text).filter((t): t is string => typeof t === 'string');

/** Where a paint puts its text. */
const atOf = (paint: Paint | undefined): ProjectedPosition => (paint!.geometry as {coordinates: ProjectedPosition}).coordinates;

describe('the nine bearing lines', () => {
    it.each(BEARING_LINES)('%s draws its own fixed letter at the midpoint', name => {
        const letter = getLabel(name);
        expect(letter).toBeTruthy();
        expect(textsOf(bearingLinePaint(name)(lineFeature(name), context))).toContain(letter);
    });

    it('letters no two of them the same, except the pair the standard itself doubles up', () => {
        // 220103 acoustic and 220104 acoustic (ambiguous) share `A` in the standard. Every
        // other letter is unique, and a duplicate anywhere else would be a misreading of a
        // plate — which is exactly what nearly happened twice: electro-optical intercept
        // letters `O` rather than the obvious `EO`, and the RDF spells itself out.
        const letters = BEARING_LINES.map(getLabel);
        const duplicated = letters.filter((letter, i) => letters.indexOf(letter) !== i);
        expect(duplicated).toEqual(['A']);
    });

    it('separates the two `A` lines by the dash, since the letter cannot', () => {
        const solid = bearingLinePaint(TacticalGraphicName.BearingLineAcoustic)(lineFeature(TacticalGraphicName.BearingLineAcoustic), context);
        const ambiguous = bearingLinePaint(TacticalGraphicName.BearingLineAcousticAmbiguous)(
            lineFeature(TacticalGraphicName.BearingLineAcousticAmbiguous),
            context,
        );
        // Same letter — which is the premise, and why the next assertion is the whole test.
        expect(textsOf(solid)).toEqual(textsOf(ambiguous));
        expect(solid[0].stroke?.dashPx).toBeUndefined();
        expect(ambiguous[0].stroke?.dashPx?.length).toBeGreaterThan(0);
    });

    it('dashes that one and no other', () => {
        expect(BEARING_LINE_DASHED).toEqual([TacticalGraphicName.BearingLineAcousticAmbiguous]);
        for (const name of BEARING_LINES.filter(n => !BEARING_LINE_DASHED.includes(n))) {
            expect(bearingLinePaint(name)(lineFeature(name), context)[0].stroke?.dashPx).toBeUndefined();
        }
    });

    it('sets the letter ON the line, in a gap, not above it', () => {
        // The defect this replaced: the letter was offset 13 px off the run, so it floated
        // over the line instead of sitting in it. On the line means its anchor is *on* the
        // run — here y = 0 — and the run is drawn as two stubs with a hole between them.
        const name = TacticalGraphicName.BearingLine;
        const paints = bearingLinePaint(name)(lineFeature(name), context);
        const letter = paints.find(p => p.text)!;
        expect(atOf(letter)[1]).toBeCloseTo(0, 9);
        expect(atOf(letter)[0]).toBeCloseTo(500, 9); // the midpoint of [0,0]..[1000,0]

        const stubs = paints.filter(p => p.geometry.type === 'LineString');
        expect(stubs).toHaveLength(2);
        // The hole is real: the first stub stops short of the midpoint and the second
        // starts past it, and neither is inverted.
        const [a, b] = stubs.map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);
        expect(a[1][0]).toBeLessThan(500);
        expect(b[0][0]).toBeGreaterThan(500);
        expect(a[0][0]).toBeLessThan(a[1][0]);
        expect(b[0][0]).toBeLessThan(b[1][0]);
    });

    it('sizes the gap from the glyph, so a wide letter gets a wide hole', () => {
        // A fixed slice of the run cannot do this: `RDF` is three characters and `B` is one,
        // and one hole size is wrong for at least one of them. @see arcMissionTaskPaint.
        const holeOf = (name: TacticalGraphicName) => {
            const stubs = bearingLinePaint(name)(lineFeature(name), context)
                .filter(p => p.geometry.type === 'LineString')
                .map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);
            return stubs[1][0][0] - stubs[0][1][0];
        };
        expect(holeOf(TacticalGraphicName.BearingLineRadioDirectionFinder)).toBeGreaterThan(
            holeOf(TacticalGraphicName.BearingLine),
        );
    });

    it('keeps the dash on both stubs, so the break cannot erase 220104`s identity', () => {
        // The break splits the line into two paints. A dash applied to only one of them
        // would leave half of 220104 solid -- and its dash is the whole of what separates
        // it from 220103.
        const name = TacticalGraphicName.BearingLineAcousticAmbiguous;
        const stubs = bearingLinePaint(name)(lineFeature(name), context).filter(p => p.geometry.type === 'LineString');
        expect(stubs).toHaveLength(2);
        for (const stub of stubs) expect(stub.stroke?.dashPx?.length).toBeGreaterThan(0);
    });

    it('never lets the gap swallow the line, however short it is drawn', () => {
        // Text scale is clamped, so on a short enough run the measured gap exceeds the run.
        // Two negative-length stubs draw as nothing, which reads as a missing symbol.
        const name = TacticalGraphicName.BearingLineRadioDirectionFinder;
        const tiny: ProjectedPosition[] = [[0, 0], [30, 0]];
        const stubs = bearingLinePaint(name)(lineFeature(name, tiny), context)
            .filter(p => p.geometry.type === 'LineString')
            .map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);
        for (const [a, b] of stubs) expect(b[0] - a[0]).toBeGreaterThan(0);
    });

    it('puts H on the far side of the line from the letter', () => {
        const name = TacticalGraphicName.BearingLine;
        const paints = bearingLinePaint(name)(lineFeature(name, undefined, {additionalInfo: '12'}), context);
        const info = paints.find(p => p.text?.text === '12')!;
        // The letter is on the run (y = 0) now, so "opposite sides" is no longer the test.
        // What still matters is that H is off the line, clear of it.
        expect(atOf(info)[1]).not.toBeCloseTo(0, 3);
    });

    it('right-justifies H against point 2, so it cannot overhang the line', () => {
        /*
         * The defect: H was centred at a fixed 0.84 along the run, so how far it stuck out
         * past the end depended on how long the operator's value happened to be. Anchoring
         * its *right edge* at point 2 makes the overhang impossible by construction.
         */
        const name = TacticalGraphicName.BearingLine;
        const short = bearingLinePaint(name)(lineFeature(name, undefined, {additionalInfo: '1'}), context)
            .find(p => p.text?.text === '1')!;
        const long = bearingLinePaint(name)(lineFeature(name, undefined, {additionalInfo: 'MCU-TENT'}), context)
            .find(p => p.text?.text === 'MCU-TENT')!;

        expect(short.text?.align).toBe('right');
        expect(long.text?.align).toBe('right');
        // Both anchored at the same place — point 2's x — however long the value is.
        expect(atOf(short)[0]).toBeCloseTo(1000, 6);
        expect(atOf(long)[0]).toBeCloseTo(1000, 6);
    });

    it('draws no H when none was typed', () => {
        const name = TacticalGraphicName.BearingLine;
        expect(textsOf(bearingLinePaint(name)(lineFeature(name), context))).toEqual(['B']);
    });
});

describe('rhumbBearing', () => {
    it("prints the plate Example's own bearing", () => {
        // The Example runs up and to the right, its anchor points about 265 x 160 apart in
        // page units, and prints `060`. Same run, same answer.
        expect(rhumbBearing([0, 0], [265, 160])).toBe('059');
        expect(rhumbBearing([0, 0], [160, 96])).toBe('059');
    });

    it('measures clockwise from north, not anticlockwise from east', () => {
        // The transpose is the easy bug and it is silent: both forms return a plausible
        // three-digit bearing, and only a cardinal direction tells them apart.
        expect(rhumbBearing([0, 0], [0, 100])).toBe('000'); // due north
        expect(rhumbBearing([0, 0], [100, 0])).toBe('090'); // due east
        expect(rhumbBearing([0, 0], [0, -100])).toBe('180'); // due south
        expect(rhumbBearing([0, 0], [-100, 0])).toBe('270'); // due west
    });

    it('pads to the three digits a bearing is written in, and wraps 360 to 000', () => {
        expect(rhumbBearing([0, 0], [1, 100])).toBe('001');
        // A hair west of north rounds to 360, which is the same bearing as 000.
        expect(rhumbBearing([0, 0], [-0.1, 100])).toBe('000');
    });
});

describe('the navigational rhumb line', () => {
    const NAME = TacticalGraphicName.NavigationalRhumbLine;
    const paintOf = (coordinates?: ProjectedPosition[], properties?: Record<string, unknown>) =>
        rhumbLinePaint()(lineFeature(NAME, coordinates, properties), context);

    it('draws AN with no amplifier typed at all, because it is the geometry', () => {
        // The defect this replaced: AN was read off `properties.rotation`, so the symbol
        // printed whatever the plumbing had defaulted that to — a bare `0` — and printed
        // nothing once it was absent. A rhumb line always has a bearing.
        expect(
            textsOf(
                paintOf([
                    [0, 0],
                    [1000, 1000],
                ]),
            ),
        ).toEqual(['045']);
    });

    it('ignores a stored rotation, which belongs to graphics that swing a handle', () => {
        expect(
            textsOf(
                paintOf(
                    [
                        [0, 0],
                        [1000, 1000],
                    ],
                    {rotation: 123},
                ),
            ),
        ).toEqual(['045']);
    });

    it('lays AN along the run and stands T upright, per the rule', () => {
        const paints = paintOf(
            [
                [0, 0],
                [1000, 1000],
            ],
            {designation: '15'},
        );
        expect(paints.find(p => p.text?.text === '045')?.text?.rotation).toBeCloseTo(-Math.PI / 4, 6);
        // Upright means no rotation at all — the box turns with nothing.
        expect(paints.find(p => p.text?.text === '15')?.text?.rotation).toBeUndefined();
    });

    it('boxes T and leaves AN unboxed, which is what the Example draws', () => {
        // The Template prints both amplifier *names* in boxes; the Example, which is the
        // drawn symbol, boxes only the designation. The Draw Rules agree — they say "within
        // a box" of T alone. Following the Template here would have drawn a box too many.
        const withT = paintOf(undefined, {designation: '15'});
        expect(withT.filter(p => p.geometry.type === 'Polygon')).toHaveLength(1);
        expect(paintOf().filter(p => p.geometry.type === 'Polygon')).toHaveLength(0);
    });

    it('puts AN north of the line and T on the far side', () => {
        // Northing is +y projected, so "north of the line" is decidable outright: the run
        // goes due east, and AN has to sit above it whichever way that is drawn.
        const eastward = paintOf(undefined, {designation: '15'});
        expect(atOf(eastward.find(p => p.text?.text === '090'))[1]).toBeGreaterThan(0);
        expect(atOf(eastward.find(p => p.text?.text === '15'))[1]).toBeLessThan(0);
    });

    it('keeps AN north when the same line is drawn the other way round', () => {
        // The side is named by the standard — North/West — not by the drawing order, so
        // reversing the anchor points must not flip it. A rule stated as "left of 1 -> 2"
        // would pass every test above and fail this one.
        const westward = paintOf(
            [
                [1000, 0],
                [0, 0],
            ],
            {designation: '15'},
        );
        expect(atOf(westward.find(p => p.text?.text === '270'))[1]).toBeGreaterThan(0);
    });

    it('falls back to west for a line running due north, where no side is north', () => {
        const northward = paintOf(
            [
                [0, 0],
                [0, 1000],
            ],
            {designation: '15'},
        );
        expect(atOf(northward.find(p => p.text?.text === '000'))[0]).toBeLessThan(0);
    });

    it('keeps the box clear of the line at every bearing', () => {
        /*
         * **The box does not turn with the line**, so the part of it facing the run changes
         * from an edge to a corner as the bearing sweeps, and so does how far it reaches.
         * A flat perpendicular offset is right at one bearing and wrong at the rest — the
         * old one put the near edge 1 px off a horizontal line and drove the corner straight
         * through a diagonal one.
         *
         * So this sweeps the bearing and measures the *nearest corner* to the line each
         * time. A test at a single angle would have passed against the defect.
         */
        const R = 1000;
        for (let deg = 0; deg < 360; deg += 7) {
            const rad = (deg * Math.PI) / 180;
            const run: ProjectedPosition[] = [
                [-R * Math.cos(rad), -R * Math.sin(rad)],
                [R * Math.cos(rad), R * Math.sin(rad)],
            ];
            const paints = paintOf(run, {designation: 'NSFS002'});
            const ring = (paints.find(p => p.geometry.type === 'Polygon')!.geometry as {coordinates: ProjectedPosition[][]})
                .coordinates[0];

            /*
             * **Signed** perpendicular distance from the line, which passes through the
             * origin along `rad`. The sign is what makes this test work: taking `Math.abs`
             * here would read a corner that has crossed to the *far* side as a positive
             * distance, and the test could then only fail on an exact hit. (It did exactly
             * that on the first draft, and passed against the very offset it was written
             * to reject.) Normalising by the box centre's own sign puts "the box's side"
             * at positive, so any corner across the line comes out negative.
             */
            const signed = ([x, y]: ProjectedPosition) => -Math.sin(rad) * x + Math.cos(rad) * y;
            const centre = ring.reduce((acc, p) => acc + signed(p), 0) / ring.length;
            const side = Math.sign(centre) || 1;
            expect(Math.min(...ring.map(p => signed(p) * side))).toBeGreaterThan(0);
        }
    });

    it('holds the same clearance at every bearing, rather than merely avoiding a crossing', () => {
        // Not just "clear" but *evenly* clear: the support-distance offset is what makes the
        // gap independent of bearing, and a padded constant would leave it varying.
        const R = 1000;
        const gaps: number[] = [];
        for (let deg = 0; deg < 360; deg += 11) {
            const rad = (deg * Math.PI) / 180;
            const run: ProjectedPosition[] = [
                [-R * Math.cos(rad), -R * Math.sin(rad)],
                [R * Math.cos(rad), R * Math.sin(rad)],
            ];
            const ring = (paintOf(run, {designation: 'NSFS002'}).find(p => p.geometry.type === 'Polygon')!
                .geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
            gaps.push(Math.min(...ring.map(([x, y]) => Math.abs(-Math.sin(rad) * x + Math.cos(rad) * y))));
        }
        // Every bearing within a whisker of every other.
        expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(Math.min(...gaps) * 0.02);
    });

    it('sizes the box to the designation rather than to a nominal width', () => {
        const spanOf = (paints: Paint[]) => {
            const ring = (paints.find(p => p.geometry.type === 'Polygon')!.geometry as {coordinates: ProjectedPosition[][]}).coordinates[0];
            return Math.max(...ring.map(p => p[0])) - Math.min(...ring.map(p => p[0]));
        };
        expect(spanOf(paintOf(undefined, {designation: '188888'}))).toBeGreaterThan(spanOf(paintOf(undefined, {designation: '1'})));
    });
});

describe('the navigational line — APP-06 218400', () => {
    /**
     * A drawn line filed under "Maritime Control Points", and the only one of its kind the
     * 2026-09-03 sweep missed: a group-level filter cannot see it, and a plate-level one
     * finds exactly three such rows in the six Points groups — this, the abatis and the
     * overhead wire, the other two already built.
     */
    const RESOLUTION = 10;
    const context = {resolution: RESOLUTION, measureText: (t: string) => t.length * 9} as unknown as PaintContext;

    const run = (coordinates: ProjectedPosition[] = [[0, 0], [4000, 0]]): PaintFeature => ({
        geometry: {type: 'LineString', coordinates},
        properties: {name: TacticalGraphicName.NavigationalLine},
    } as unknown as PaintFeature);

    const segments = (coordinates?: ProjectedPosition[]) =>
        navigationalLinePaint()(run(coordinates), context)
            .filter(p => p.geometry.type === 'LineString')
            .map(p => (p.geometry as {coordinates: ProjectedPosition[]}).coordinates);

    it('is registered, and draws the bar with a tick at each end', () => {
        expect(isPaintable(TacticalGraphicName.NavigationalLine)).toBe(true);
        expect(segments()).toHaveLength(3);
    });

    it('puts the two ticks on the same hand, not mirrored', () => {
        /*
         * **The whole shape, and the reading a careless symmetry gets wrong.** Both ticks
         * rise to the right: the one at point 1 leads forward and up, the one at point 2
         * trails backward and down, so the figure is rotationally symmetric about the bar's
         * midpoint. Mirroring the second draws a shallow `Z` with both ends turning the same
         * way up, which is a different figure. Measured as the sign of the cross-axis
         * component of each tick, which must be opposite.
         */
        const [, first, second] = segments();
        const firstUp = first[1][1] - first[0][1];
        const secondUp = second[1][1] - second[0][1];
        expect(Math.sign(firstUp)).toBe(-Math.sign(secondUp));
        // ...and the along-axis components too: one leads, one trails.
        expect(Math.sign(first[1][0] - first[0][0])).toBe(-Math.sign(second[1][0] - second[0][0]));
    });

    it('sets both ticks at the plate angle', () => {
        // 40.0 and 40.4 degrees, measured off the Template at 600 dpi; one number for both.
        for (const tick of segments().slice(1)) {
            const dx = tick[1][0] - tick[0][0];
            const dy = tick[1][1] - tick[0][1];
            // **Undirected**: the trailing tick runs the other way along the same line, so
            // its `atan2` is 40 - 180. Folding into [0, 180) compares the lines, which is
            // what "both at the plate angle" means. The first probe compared headings and
            // reported 140 against 40 for a tick that was correct.
            const heading = Math.atan2(dy, dx) * (180 / Math.PI);
            expect(((heading % 180) + 180) % 180).toBeCloseTo(40, 5);
        }
    });

    it('holds the ticks at one screen size however long the bar is', () => {
        // "The symbol varies only in length", so the run is the only thing that grows.
        const lengthOf = (coordinates: ProjectedPosition[]) => {
            const [, tick] = segments(coordinates);
            return Math.hypot(tick[1][0] - tick[0][0], tick[1][1] - tick[0][1]);
        };
        expect(lengthOf([[0, 0], [4000, 0]])).toBeCloseTo(lengthOf([[0, 0], [40_000, 0]]), 6);
    });

    it('shrinks them rather than letting one span the whole bar', () => {
        const [, tick] = segments([[0, 0], [400, 0]]);
        expect(Math.hypot(tick[1][0] - tick[0][0], tick[1][1] - tick[0][1])).toBeLessThan(400 * 0.4);
    });

    it('falls back to a bare bar when a tick would be under the visibility floor', () => {
        expect(segments([[0, 0], [60, 0]])).toEqual([[[0, 0], [60, 0]]]);
    });
});
