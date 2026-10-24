/**
 * Paint-function tests.
 *
 * These exist to pin two claims the MapLibre spike rests on.
 *
 * **1. The symbology layer is renderer-free and DOM-free.** Everything below runs
 * with no map, no canvas and no `document` — text widths come from a stub
 * measurer. That is the property that makes a second renderer possible at all, and
 * it is easy to lose: one `document.createElement` at module scope is what made
 * `openlayerStyles.ts` unimportable in Node for months.
 *
 * **2. The screen-pixel decorations behave against the shape, not the zoom.** The
 * obstacle line's teeth are the spike's representative of all 128 in-style
 * geometry constructions, so the cases that matter are the boundaries: teeth
 * shrink as the shape gets small on screen, and drop out entirely rather than
 * degenerating into fuzz.
 */

import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {RATIO_LOCKED_LABEL_FONT, fontStyle} from '../core/symbology';
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {arcMissionTaskPaint, defaultLinePaint, missionTaskLabelPaint, obstacleLinePaint, phaseLinePaint} from './paintFunctions';
import {renderTacticalGraphic} from '../core/render';
import {anchorsFromFrame} from '../core/anchors';
import {encirclementPaint} from './areaPaints';
import {crenellatedPath, decorationScale, uprightRotation} from './decorations';
import {envelopmentLabelPaint} from './movementPaints';

/**
 * A deterministic stand-in for `ctx.measureText`, at roughly the aspect ratio of
 * a bold sans-serif capital. A real canvas is not needed and would make these
 * tests depend on the host's font rendering.
 */
const context = (resolution: number): PaintContext => ({
    resolution,
    measureText: (text, font) => {
        const px = parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16');
        return text.length * px * 0.6;
    },
});

const lineFeature = (coords: ProjectedPosition[], overrides: Partial<PaintFeature> = {}): PaintFeature => ({
    geometry: {type: 'LineString', coordinates: coords},
    properties: {name: TacticalGraphicName.PhaseLine},
    ...overrides,
});

/** A 400 km line — long enough to carry teeth at a middling resolution. */
const LONG_LINE: ProjectedPosition[] = [[0, 0], [400_000, 0]];

beforeEach(() => resetTacticalGraphicsConfig());

describe('the symbology layer needs no DOM', () => {
    it('paints a phase line with no canvas and no map', () => {
        const paints = phaseLinePaint(TacticalGraphicName.PhaseLine)(
            lineFeature(LONG_LINE, {properties: {name: TacticalGraphicName.PhaseLine, designation: 'BLUE'}}),
            context(1000),
        );

        // One stroke plus a label at each end.
        expect(paints).toHaveLength(3);
        expect(paints[0].stroke).toBeDefined();
        expect(paints[1].text?.text).toBe('PL BLUE');
        expect(paints[2].text?.text).toBe('PL BLUE');
    });

    it('prefixes a hostile phase line with ENY and turns the line work red', () => {
        const paints = phaseLinePaint(TacticalGraphicName.PhaseLine)(
            lineFeature(LONG_LINE, {
                properties: {
                    name: TacticalGraphicName.PhaseLine,
                    designation: 'BLUE',
                    hostility: TacticalGraphicHostility.hostileFaker,
                },
            }),
            context(1000),
        );

        expect(paints[1].text?.text).toBe('ENY PL BLUE');
        expect(paints[0].stroke?.color).toBe('rgba(255, 0, 0, 1)');
        // The amplifier stays in the label color — hostile line work goes red, text
        // does not. @see ai/decisions.md, the hostility color rule.
        expect(paints[1].text?.fill).not.toBe('rgba(255, 0, 0, 1)');
    });

    it('pushes each end label to the outside, whichever way the line was drawn', () => {
        const paint = phaseLinePaint(TacticalGraphicName.PhaseLine);
        const eastward = paint(lineFeature(LONG_LINE), context(1000));
        const westward = paint(lineFeature([...LONG_LINE].reverse() as ProjectedPosition[]), context(1000));

        // The "keep upright" flip gives both directions the same rotation, so the
        // side has to be chosen from the segment's own x-direction. If it were not,
        // one of these would sit on top of the line instead of past its end.
        expect(Math.sign(eastward[1].text!.offsetXPx!)).toBe(-Math.sign(westward[1].text!.offsetXPx!));
    });
});

describe('obstacle teeth are sized against the shape', () => {
    const paintObstacle = obstacleLinePaint(TacticalGraphicName.ObstacleLine);
    const feature = lineFeature(LONG_LINE, {properties: {name: TacticalGraphicName.ObstacleLine}});

    /** Vertices in the tooth-bearing line work. A plain line has only its own. */
    const toothVertices = (resolution: number): number => {
        const paints = paintObstacle(feature, context(resolution));
        const geometry = paints[paints.length - 1].geometry;
        return geometry.type === 'LineString' ? geometry.coordinates.length : 0;
    };

    it('draws teeth when the line has room for them', () => {
        // 400 km over 1000 m/px is 400 px of line: comfortably above the floor.
        expect(toothVertices(1000)).toBeGreaterThan(2);
    });

    it('drops the teeth entirely once they would fall under the minimum', () => {
        // 400 km over 100_000 m/px is 4 px of line. A tooth here would be a smudge,
        // so the plain geometry stands — two vertices, no teeth.
        expect(toothVertices(100_000)).toBe(2);
    });

    it('shrinks the teeth with the shape rather than with the zoom', () => {
        // The rule is about the graphic's on-screen size, so a short line at a fine
        // resolution and a long line at a coarse one get the same treatment when
        // they cover the same pixels.
        const shortLineFinesse = decorationScale([[0, 0], [40_000, 0]], false, 100, 10);
        const longLineCoarse = decorationScale([[0, 0], [400_000, 0]], false, 1000, 10);
        expect(shortLineFinesse).toBeCloseTo(longLineCoarse, 10);
    });

    it('puts the teeth left of travel and the label right, so both flip with drawing order', () => {
        // APP-06 290100: "Orientation is determined by the order in which the anchor points
        // are entered." LONG_LINE runs west to east, so left of travel is up.
        const forward = paintObstacle(feature, context(1000));
        const backward = paintObstacle(
            lineFeature([...LONG_LINE].reverse() as ProjectedPosition[], {properties: {name: TacticalGraphicName.ObstacleLine}}),
            context(1000),
        );

        const labelY = (paints: ReturnType<typeof paintObstacle>) => {
            const g = paints[0].geometry;
            return g.type === 'Point' ? g.coordinates[1] : NaN;
        };
        const toothYs = (paints: ReturnType<typeof paintObstacle>) => {
            const g = paints[paints.length - 1].geometry;
            return g.type === 'LineString' ? g.coordinates.map(([, y]) => y).filter((y) => Math.abs(y) > 1e-6) : [];
        };
        expect(labelY(forward)).toBeLessThan(0);
        expect(toothYs(forward).every((y) => y > 0)).toBe(true);
        expect(labelY(backward)).toBeGreaterThan(0);
        expect(toothYs(backward).every((y) => y < 0)).toBe(true);
        expect(toothYs(forward).length).toBeGreaterThan(0);
        expect(toothYs(backward).length).toBeGreaterThan(0);
    });
});

/**
 * Encirclement used to bake its triangles into the GeoJSON at the resolution the
 * graphic was drawn at, so they were a *ground* distance: they grew and shrank with
 * the map while the obstacle belt beside them held its size, and far enough out they
 * degenerated into sub-pixel fuzz along the outline instead of dropping out. These
 * pin the belt's behavior on them.
 */
describe('encirclement teeth are sized against the shape, like the obstacle belt', () => {
    const paintEncirclement = encirclementPaint();

    /** A square ring, `half` meters from center to edge, anticlockwise. */
    const square = (half: number): ProjectedPosition[] => [
        [-half, -half], [half, -half], [half, half], [-half, half], [-half, -half],
    ];

    const ringFeature = (ring: ProjectedPosition[], overrides: Partial<PaintFeature['properties']> = {}): PaintFeature => ({
        geometry: {type: 'MultiLineString', coordinates: [ring]},
        properties: {name: TacticalGraphicName.Encirclement, ...overrides},
    });

    /** How far the line work reaches past the ring, in screen pixels. */
    const toothHeightPx = (half: number, resolution: number, feature = ringFeature(square(half))): number => {
        const geometry = paintEncirclement(feature, context(resolution))[0].geometry;
        if (geometry.type !== 'MultiLineString') return NaN;
        const reach = Math.max(...geometry.coordinates.flat().map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
        return (reach - half) / resolution;
    };

    it('holds the same pixel height as the map zooms out', () => {
        // The same ring on the ground, seen four times as far out. A baked tooth would
        // report a quarter the pixels here; a screen-sized one reports the same number.
        expect(toothHeightPx(400_000, 250)).toBeCloseTo(toothHeightPx(400_000, 1000), 6);
        expect(toothHeightPx(400_000, 1000)).toBeGreaterThan(1);
    });

    it('shrinks the teeth once they would overwhelm the ring', () => {
        // A ring 40 px across cannot carry a 10 px tooth, so the cap bites and this
        // comes out below the uncapped height rather than at it.
        const capped = toothHeightPx(10_000, 1000);
        const uncapped = toothHeightPx(400_000, 1000);
        expect(capped).toBeLessThan(uncapped);
    });

    it('drops the teeth entirely rather than drawing fuzz', () => {
        // A ring 8 px across. The plain outline stands: five vertices, no teeth.
        const geometry = paintEncirclement(ringFeature(square(400_000)), context(100_000))[0].geometry;
        expect(geometry.type === 'MultiLineString' && geometry.coordinates[0]).toHaveLength(5);
    });

    it('points the teeth outward whichever way the ring was drawn', () => {
        const clockwise = [...square(400_000)].reverse() as ProjectedPosition[];
        expect(toothHeightPx(400_000, 1000)).toBeGreaterThan(1);
        expect(toothHeightPx(400_000, 1000, ringFeature(clockwise))).toBeGreaterThan(1);
    });

    it('teeth a hostile outline too, and keeps the ENY amplifiers', () => {
        // Hostile arrives as a collection: the outline already cut into segments to
        // clear the amplifiers, plus the anchors they sit on.
        const ring = square(400_000);
        const feature: PaintFeature = {
            geometry: {
                type: 'GeometryCollection',
                geometries: [
                    {type: 'MultiLineString', coordinates: [ring.slice(0, 3), ring.slice(3)]},
                    {type: 'MultiPoint', coordinates: [[0, 400_000]]},
                ],
            },
            properties: {name: TacticalGraphicName.Encirclement, hostility: TacticalGraphicHostility.hostileFaker},
        };

        const paints = paintEncirclement(feature, context(1000));
        expect(toothHeightPx(400_000, 1000, feature)).toBeGreaterThan(1);
        expect(paints.some(p => p.text?.text === 'ENY')).toBe(true);
    });
});

/**
 * The mission-task designation had two sizings in OpenLayers — a named set took the
 * ratio-locked 24 px treatment, everything else the ordinary zoom-anchored 16 px one
 * — and the set lived in the OpenLayers holder where no other renderer could see it.
 * The paint layer therefore drew the whole family ratio-locked. Nothing failed: the
 * suite went from 1683 tests to 1683 across the fix, which is what these are for.
 */
describe('a mission-task letter is sized by which family it is in', () => {
    const letter = (name: TacticalGraphicName, graphicSize?: number, resolution = 1000) =>
        missionTaskLabelPaint(name)(
            {
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {name},
                graphicSize,
                drawingResolution: 1000,
            },
            context(resolution),
        )[0].text!;

    it('gives a ratio-locked task the 24px font and an ordinary one the 16px font', () => {
        expect(letter(TacticalGraphicName.Isolate, 50_000).font).toBe(RATIO_LOCKED_LABEL_FONT);
        expect(letter(TacticalGraphicName.TacticalTurn, 50_000).font).toBe(fontStyle);
    });

    it('tracks the graphic only for the ratio-locked half', () => {
        // Same graphic, twice the radius. A ratio-locked letter grows with it; a turn's
        // "T" must not — it has to hold its size while the curve is resized, which is
        // why the turns were left off the list in the first place.
        expect(letter(TacticalGraphicName.Isolate, 100_000).scale)
            .toBeGreaterThan(letter(TacticalGraphicName.Isolate, 50_000).scale!);
        expect(letter(TacticalGraphicName.TacticalTurn, 100_000).scale)
            .toBe(letter(TacticalGraphicName.TacticalTurn, 50_000).scale);
    });

    /**
     * Two bugs met here, and both were invisible in a picture.
     *
     * The first reconstructed the axis from `properties.rotation`, read as a compass
     * bearing. It is a maths angle — anticlockwise from east — so every letter came out a
     * quarter turn off, and the graphic still measured 1.01 ink and 0.068% against
     * OpenLayers *with the bug in it*. A quarter turn on a single capital is nearly
     * nothing to a pixel diff.
     *
     * The second put the letter at a point the generator named in 4326. That is exact on
     * the geodesic and a little off the straight segment a renderer draws between the
     * run's reprojected ends — by an error proportional to the run, so the "E" slid out
     * of its hole as the graphic grew, and only at large sizes.
     *
     * So this asserts the letter is **on the drawn segment**, not merely near the right
     * bearing, and at a size where the old error was meters wide.
     */
    it('puts the letter on the run as drawn, at every bearing and at size', () => {
        const R = 6378137;
        const merc = ([x, y]: number[]): ProjectedPosition =>
            [(x * Math.PI * R) / 180, Math.log(Math.tan(Math.PI / 4 + (y * Math.PI) / 360)) * R];

        for (const rotation of [0, 30, 45, 90, 135, 200, 270, 300, 359]) {
            // Envelopment is drawn from anchor points now, so the fixture states the
            // same frame the dropped version used to and lets `anchorsFromFrame` turn it
            // into the points APP-06 asks for. @see core/anchors.ts
            const rendered = renderTacticalGraphic({
                type: 'Feature',
                geometry: {type: 'LineString', coordinates: anchorsFromFrame([0, 0], 900_000, rotation)},
                properties: {tacticalGraphic: {name: TacticalGraphicName.Envelopment, rotation}},
            } as never)!;

            // Sub-line 0 is the straight run the "E" lies along.
            const [start, end] = (rendered.graphic.geometry as {coordinates: number[][][]}).coordinates[0];
            const [a, b] = [merc(start), merc(end)];

            const anchors = (rendered.labels.geometry as {coordinates: number[][]}).coordinates.map(merc);
            const painted = envelopmentLabelPaint()(
                {geometry: {type: 'MultiPoint', coordinates: anchors}, properties: {name: TacticalGraphicName.Envelopment, rotation}},
                context(1000),
            );
            const at = (painted[0].geometry as {coordinates: ProjectedPosition}).coordinates;

            // Distance from the letter to the segment it is cut into. Planar, because
            // these are projected meters — which is the whole point.
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const t = ((at[0] - a[0]) * dx + (at[1] - a[1]) * dy) / (dx * dx + dy * dy);
            const offBy = Math.hypot(at[0] - (a[0] + t * dx), at[1] - (a[1] + t * dy));

            // A meter, on a run of some 1800 km. The old placement missed by kilometers.
            expect(offBy).toBeLessThan(1);
            // And a quarter of the way along it, where the gap is.
            expect(t).toBeCloseTo(0.25, 3);

            // The letter still lies along the run rather than across it.
            const drawn = uprightRotation(a, b);
            const painted0 = painted[0].text!.rotation!;
            const along = Math.abs(Math.abs(painted0 - drawn) % Math.PI);
            expect(Math.min(along, Math.PI - along)).toBeLessThan(0.01);
        }
    });

    it('draws envelopment\'s "E" at the scale its line work cut the gap for', async () => {
        const {approachLetterScale} = await import('./movementPaints');
        const feature: PaintFeature = {
            geometry: {type: 'Point', coordinates: [0, 0]},
            properties: {name: TacticalGraphicName.Envelopment},
            drawingResolution: 100,
            bounds: {minX: 0, minY: 0, maxX: 40_000, maxY: 10_000},
        };
        const [paint] = missionTaskLabelPaint(TacticalGraphicName.Envelopment)(feature, context(1000));
        expect(paint.text!.scale).toBe(approachLetterScale(feature, context(1000), 'E', 0));
        // Under twice its letter: no "E", as the run is drawn whole.
        expect(missionTaskLabelPaint(TacticalGraphicName.Envelopment)({...feature, bounds: {minX: 0, minY: 0, maxX: 10_000, maxY: 2_500}}, context(1000)))
            .toEqual([]);
    });

    it('carries the rotation through, for a letter that lies along its graphic', () => {
        const rotated = missionTaskLabelPaint(TacticalGraphicName.Envelopment, 0.7)(
            // The extent the holder stamps on the label: the "E" is sized against it, and with
            // none there is nothing to fit it to and no letter. @see approachLetterScale
            {
                geometry: {type: 'Point', coordinates: [0, 0]},
                properties: {name: TacticalGraphicName.Envelopment},
                bounds: {minX: -200_000, minY: -100_000, maxX: 200_000, maxY: 100_000},
            },
            context(1000),
        );
        expect(rotated[0].text?.rotation).toBeCloseTo(0.7, 10);
    });
});

describe('crenellatedPath', () => {
    it('returns its input unchanged when the pattern is non-positive', () => {
        const path: ProjectedPosition[] = [[0, 0], [100, 0]];
        expect(crenellatedPath(path, 10, 0, 10, 'up')).toBe(path);
    });

    it('puts the teeth on the same side regardless of drawn direction', () => {
        const heights = (path: ProjectedPosition[]) =>
            crenellatedPath(path, 10, 10, 10, 'up').map(p => p[1]).filter(y => y !== 0);

        const forward = heights([[0, 0], [200, 0]]);
        const backward = heights([[200, 0], [0, 0]]);
        expect(forward.every(y => y > 0)).toBe(true);
        expect(backward.every(y => y > 0)).toBe(true);
    });
});

describe('uprightRotation', () => {
    it('keeps text upright on a westward segment', () => {
        const eastward = uprightRotation([0, 0], [100, 0]);
        const westward = uprightRotation([100, 0], [0, 0]);
        expect(eastward).toBeCloseTo(0, 10);
        expect(westward).toBeCloseTo(0, 10);
    });

    it('never returns a rotation that would read upside down', () => {
        for (let deg = -180; deg <= 180; deg += 15) {
            const rad = (deg * Math.PI) / 180;
            const rotation = uprightRotation([0, 0], [Math.cos(rad) * 100, Math.sin(rad) * 100]);
            expect(Math.abs(rotation)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
        }
    });
});

describe('the arc mission tasks cut their gap from the rendered glyph', () => {
    /** Two arcs meeting at due east, where the label sits. */
    const arcs = (radius: number): ProjectedPosition[][] => {
        const upper: ProjectedPosition[] = [];
        const lower: ProjectedPosition[] = [];
        for (let i = 0; i <= 100; i++) {
            const a = (i / 100) * Math.PI;          // 0 → 180°, counter-clockwise
            upper.push([Math.cos(a) * radius, Math.sin(a) * radius]);
            lower.push([Math.cos(-a) * radius, Math.sin(-a) * radius]);
        }
        return [upper, lower];
    };

    /**
     * The geometry radius and `graphicSize` move together, because on a real graphic
     * they are the same quantity — the generator draws the circle at the radius the
     * holder stamped. Varying only one of them tests nothing: the gap is
     * `glyphExtentPx × resolution ÷ radius`, so holding the radius fixed while the
     * label grows makes the gap grow, which is correct and not the property here.
     */
    const secureFeature = (radius: number): PaintFeature => ({
        geometry: {type: 'MultiLineString', coordinates: arcs(radius)},
        properties: {name: TacticalGraphicName.Secure, radius},
        graphicSize: radius,
        graphicCenter: [0, 0],
        graphicLabelPoint: [radius, 0],
    });

    /** Angular clearance the gap leaves either side of the label axis (due east). */
    const gapRadians = (radius: number, resolution: number): number => {
        const paints = arcMissionTaskPaint(TacticalGraphicName.Secure, true)(
            secureFeature(radius),
            context(resolution),
        );
        const geometry = paints[0].geometry;
        if (geometry.type !== 'MultiLineString') throw new Error('expected line work');
        // The first arc starts at due east; after the cut its first point has moved
        // round by the gap.
        const [x, y] = geometry.coordinates[0][0];
        return Math.abs(Math.atan2(y, x));
    };

    it('opens a gap for the letter', () => {
        expect(gapRadians(100_000, 1000)).toBeGreaterThan(0);
    });

    it('opens a *smaller* angular gap on a bigger circle, because the label is capped', () => {
        // This is the whole reason the gap is cut here rather than being a fixed
        // slice of the circle in the generator: the label scale is capped, so a
        // fixed angle that fits a letter on a small circle is far too wide on a
        // large one. Past the cap the letter stops growing while the circle does
        // not, so the angle it subtends falls away.
        const small = gapRadians(60_000, 1000);
        const large = gapRadians(400_000, 1000);
        expect(large).toBeLessThan(small);
    });

    it('never opens more than the 40° cap, however small the circle', () => {
        for (const radius of [5_000, 6_000, 8_000, 12_000, 20_000]) {
            expect(gapRadians(radius, 1000)).toBeLessThanOrEqual((40 * Math.PI) / 180 + 1e-9);
        }
    });

    /** The letter a Secure's label feature draws, or undefined for none. */
    const secureLetter = (radius: number, resolution: number) =>
        missionTaskLabelPaint(TacticalGraphicName.Secure)(
            {geometry: {type: 'Point', coordinates: [radius, 0]}, properties: {name: TacticalGraphicName.Secure}, graphicSize: radius},
            context(resolution),
        )[0]?.text;

    it('keeps its letter at 6 px, then drops it and closes the arcs', () => {
        // A 20 px circle: the ratio-locked letter would be 4.5 px, under the legibility
        // floor, so it is held at 6 and the arcs still open round it.
        const small = secureLetter(10_000, 1000);
        expect(small).toBeDefined();
        expect(24 * small!.scale!).toBeCloseTo(MIN_LEGIBLE_TEXT_PX, 6);
        expect(gapRadians(10_000, 1000)).toBeGreaterThan(0);

        // A 10 px circle is under twice its 6 px letter: no letter, and no hole for one.
        expect(secureLetter(5_000, 1000)).toBeUndefined();
        expect(gapRadians(5_000, 1000)).toBe(0);
    });

    it('cuts area defense\'s gap for the ratio-locked letter its label draws', () => {
        const feature = (geometry: PaintFeature['geometry']): PaintFeature => ({
            geometry,
            properties: {name: TacticalGraphicName.AreaDefense},
            graphicSize: 100_000,
            graphicCenter: [0, 0],
            graphicLabelPoint: [100_000, 0],
        });
        const letter = missionTaskLabelPaint(TacticalGraphicName.AreaDefense)(feature({type: 'Point', coordinates: [100_000, 0]}), context(1000))[0]
            .text!;
        const paints = arcMissionTaskPaint(TacticalGraphicName.AreaDefense, false)(
            feature({type: 'MultiLineString', coordinates: arcs(100_000)}),
            context(1000),
        );
        const geometry = paints[0].geometry;
        if (geometry.type !== 'MultiLineString') throw new Error('expected line work');
        const [x, y] = geometry.coordinates[0][0];
        // Due east the gap runs along the letter's height: half of it plus 5 px of clearance.
        const halfHeightPx = (24 * letter.scale! * 0.72) / 2;
        expect(letter.font).toBe(RATIO_LOCKED_LABEL_FONT);
        expect(Math.abs(Math.atan2(y, x))).toBeCloseTo(((halfHeightPx + 5) * 1000) / 100_000, 6);
    });
});

/**
 * A default line's identifier keeps its prefix when the whole is too small to read: the name
 * goes, `FSCL` stays at 6 px, and goes only once the line is under twice it. The dates are
 * not a designation and keep their own scale. @see legibleDesignation
 */
describe("a default line's identifier keeps its prefix when too small", () => {
    const fscl = (length: number, boundsPx: number) =>
        defaultLinePaint(TacticalGraphicName.FireSupportCoordinationLine)(
            {
                geometry: {type: 'LineString', coordinates: [[0, 0], [length, 0]]},
                properties: {name: TacticalGraphicName.FireSupportCoordinationLine, designation: 'ALPHA', startDate: 'D1', endDate: 'D2'},
                // The stamped extent is what caps the label; the path is what the prefix must fit.
                bounds: {minX: 0, minY: 0, maxX: boundsPx, maxY: 0},
            },
            context(1),
        );
    const identifiers = (paints: ReturnType<typeof fscl>) => paints.filter(p => p.text && p.text.baseline === 'bottom').map(p => p.text!);

    it('draws the whole identifier while it is legible', () => {
        const ids = identifiers(fscl(400, 400));
        expect(ids.map(t => t.text)).toEqual(['FSCL ALPHA', 'FSCL ALPHA']);
        expect(ids[0].scale).toBe(1);
    });

    it('drops the name and holds FSCL at 6 px once the whole would be under it', () => {
        const paints = fscl(100, 10);
        const ids = identifiers(paints);
        expect(ids.map(t => t.text)).toEqual(['FSCL', 'FSCL']);
        for (const t of ids) expect(16 * t.scale!).toBeCloseTo(MIN_LEGIBLE_TEXT_PX, 9);
        // The dates are left at the scale the graphic gave them.
        const dates = paints.filter(p => p.text?.baseline === 'top').map(p => p.text!);
        expect(dates.map(t => t.text)).toEqual(['D1 - D2', 'D1 - D2']);
        expect(16 * dates[0].scale!).toBeLessThan(MIN_LEGIBLE_TEXT_PX);
    });

    it('draws no identifier on a line under twice FSCL', () => {
        expect(identifiers(fscl(20, 10))).toEqual([]);
    });
});
