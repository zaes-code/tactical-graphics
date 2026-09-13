/**
 * # The wire's marks belong to the run they sit on
 *
 * The nine wire obstacles scale correctly — `decorationScale` has always capped them — but
 * they were laid out by walking the whole path from half a period in and stopping when the
 * next group no longer fitted. Two things follow from that, and a user reported both:
 * the pattern is not centred, so the far end carries a longer tail than the near one; and
 * a mark can land on a corner, where it is built on one segment's frame while sitting on
 * the join between two. (User's report, 2026-09-10.)
 *
 * The obstacle teeth and the fortified merlons were moved to a per-run layout in September
 * for the same reasons. These measure that the wire now does what they do.
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import {wireObstaclePaint} from './obstaclePaints';

/** One metre per pixel, so a screen size and a ground size are the same number. */
const context: PaintContext = {resolution: 1, measureText: (text, font) => text.length * 10};

/** An L: 400 along the x axis, then 300 up, with a right angle between them. */
const CORNER: ProjectedPosition = [400, 0];
const ELL: ProjectedPosition[] = [[0, 0], CORNER, [400, 300]];

const WIRES = [
    TacticalGraphicName.WireSingleFence,
    TacticalGraphicName.WireDoubleFence,
    TacticalGraphicName.WireDoubleApronFence,
    TacticalGraphicName.WireSingleConcertina,
    TacticalGraphicName.WireHighWireFence,
];

/** The centre of every mark the wire draws, in order. */
const markCentres = (name: TacticalGraphicName, path = ELL): ProjectedPosition[] => {
    const feature = {geometry: {type: 'LineString', coordinates: path}, properties: {name}} as PaintFeature;
    const marks = wireObstaclePaint(name)(feature, context).find(
        p => p.stroke && p.geometry.type === 'MultiLineString',
    );
    if (!marks) return [];
    return (marks.geometry as {coordinates: ProjectedPosition[][]}).coordinates.map(part => {
        const xs = part.map(c => c[0]);
        const ys = part.map(c => c[1]);
        return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    });
};

beforeEach(() => resetTacticalGraphicsConfig());

describe.each(WIRES)('%s', name => {
    it('leaves the same room at both ends of a run', () => {
        const onFirstLeg = markCentres(name).filter(c => c[1] < 1 && c[0] <= CORNER[0]);
        expect(onFirstLeg.length).toBeGreaterThan(1);
        const leading = Math.min(...onFirstLeg.map(c => c[0]));
        const trailing = CORNER[0] - Math.max(...onFirstLeg.map(c => c[0]));
        // Within a pixel: the two ends are the same leftover split in half.
        expect(Math.abs(leading - trailing)).toBeLessThan(1);
    });

    /**
     * **Nothing on the corner.** A mark there is drawn along one leg's tangent while sitting
     * where the two legs meet, so it reads as a stray glyph rather than as wire on a line.
     */
    it('keeps its marks clear of the corner', () => {
        const nearest = Math.min(...markCentres(name).map(c => Math.hypot(c[0] - CORNER[0], c[1] - CORNER[1])));
        expect(nearest).toBeGreaterThan(4);
    });

    /** A straight run is unchanged in kind: still a whole number of groups, still centred. */
    it('centres the pattern on a plain straight line too', () => {
        const straight: ProjectedPosition[] = [[0, 0], [500, 0]];
        const centres = markCentres(name, straight);
        expect(centres.length).toBeGreaterThan(1);
        const leading = Math.min(...centres.map(c => c[0]));
        const trailing = 500 - Math.max(...centres.map(c => c[0]));
        expect(Math.abs(leading - trailing)).toBeLessThan(1);
    });
});
