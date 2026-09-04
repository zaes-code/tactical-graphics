import {Feature, MultiPoint, Point, Polygon, Position} from 'geojson';
import {RangeFanOptions, RectangularTargetOptions, TacticalGraphicName} from '../core/type';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {resolveBandAzimuths, resolveBands} from './RangeFan';
import * as turf from '../core/turf';

/**
 * # APP-06 §8.10 Table 8-12 — the maritime control areas that are not rectangles
 *
 * Two generators, for the two constructions in group 20 the rest of the library does not
 * already have. The five that *are* covered elsewhere are not here: 200202 and 200402 are
 * two anchor points and a width, which is `RectangularArea`'s own definition, and 200300
 * and 200500 are a centre and a radius, which is `CircularArea`'s.
 *
 * @see maritimeAreaPaints, the other half — what these shapes look like
 */

/** Full major axis used when an ellipse files none, in metres. `AM1` is half of it. */
const DEFAULT_MAJOR_AXIS_M = 2000;
/** Minor-axis radius used when an ellipse files none, in metres — amplifier `AM`. */
const DEFAULT_MINOR_RADIUS_M = 500;

/**
 * Vertices in the ellipse ring.
 *
 * 72 is one every five degrees. Chosen against the same measure `ARC_STEPS = 60` uses on
 * the range fans and rounded up because an ellipse is read as a smooth closed curve where
 * a fan's arc is read as a sector edge: at 72 the maximum sagitta is 0.1% of the radius,
 * which is a quarter of a pixel on a 500 px ellipse.
 */
const ELLIPSE_STEPS = 72;

/**
 * `metres` along a true bearing, **signed** — a negative distance runs the other way.
 *
 * `RectangularTarget.along` takes only positives, because it is always handed one. This
 * one is not: an ellipse is walked with `cos(t)` and `sin(t)`, which are negative for half
 * the sweep. The first version rejected those the way turf does and returned `from`
 * unchanged, so **the whole left half of every ellipse collapsed onto its centre** — a
 * half-ellipse closed by a vertical line, which is what the generated thumbnail showed
 * before anything else did. Read the picture, not the code.
 */
function along(from: Position, metres: number, bearingDeg: number): Position {
    if (metres === 0 || !Number.isFinite(metres)) return from;
    const [distance, bearing] = metres > 0 ? [metres, bearingDeg] : [-metres, bearingDeg + 180];
    return turf.destination(turf.point(from), distance, bearing, {units: 'meters'}).geometry.coordinates as Position;
}

/**
 * The three ellipse/circle maritime areas — APP-06 200101, 200201 and 200401.
 *
 * ## One anchor point and three numbers, which is the rectangular target's contract
 *
 * > This symbol requires one anchor point. This anchor point represents the centre of an
 * > ellipse and, therefore, the geographic location of that ellipse. […] The size and
 * > shape of this symbol is determined by three additional numeric values; a minor axis
 * > radius (AM), a major axis radius (AM1), and a rotation angle (AN).
 *
 * That is 240802's rule with `ellipse` written where `rectangle` is, so this shares
 * `RectangularTargetOptions`, `RectangularTargetGraphicBase` and the `rectangularTarget`
 * controller rather than growing a parallel set. The mapping is the only thing to keep
 * straight, and it is a factor of two: **`AM1` is a radius and `length` is the full
 * figure**, so `length = 2 · AM1`, while `AM` is a radius and `radius` is already the
 * half-width. Getting that backwards draws an ellipse half as long as the operator typed.
 *
 * ## `AN` is the one angle in this library that needs no conversion
 *
 * > […] where 0 degrees is east/west, and a positive rotation angle rotates the ellipse in
 * > a counter-clockwise direction.
 *
 * Which is the trigonometric convention exactly, and exactly what the point-anchored
 * holders already store in `rotation`. The rectangular target's own `AN` is a compass
 * bearing and `RectangularTarget.frame` converts with `90 - rotation`; **the ellipses want
 * the same conversion for the same reason** — `along` below takes a bearing whatever the
 * plate's convention is — so the code is identical and only the plate's wording differs.
 * The distinction matters to anyone reading `rotation` back out of a saved graphic, which
 * is why it is written down rather than left to the arithmetic.
 */
export class EllipticalArea extends TacticalGraphicsBase<RectangularTargetOptions> {
    name: string;
    type: string = 'Point';

    constructor(tacticalGraphicName: TacticalGraphicName) {
        super();
        this.name = tacticalGraphicName;
    }

    /** The centre, the two semi-axes in metres, and the attitude as a bearing. */
    private frame(base: Feature<Point>, opts: RectangularTargetOptions | undefined) {
        const center = base.geometry.coordinates;
        const length = opts?.length && opts.length > 0 ? opts.length : DEFAULT_MAJOR_AXIS_M;
        const minor = opts?.radius && opts.radius > 0 ? opts.radius : DEFAULT_MINOR_RADIUS_M;
        return {center, major: length / 2, minor, attitude: 90 - (opts?.rotation ?? 0)};
    }

    generateGraphics(base: Feature<Point>, opts: RectangularTargetOptions | undefined): Feature<Polygon> {
        const {center, major, minor, attitude} = this.frame(base, opts);
        const ring: Position[] = [];
        for (let i = 0; i < ELLIPSE_STEPS; i++) {
            const t = (i / ELLIPSE_STEPS) * 2 * Math.PI;
            /*
             * **Along the axis, then across it** — two geodesic steps rather than one
             * polar step of `sqrt(...)` metres on a computed bearing.
             *
             * Both are correct on a sphere to well inside a pixel at these distances; this
             * one is preferred because it is the construction `rectangleFromAxis` uses for
             * the rectangles beside it, so the two families cannot disagree about what
             * "rotated by AN" means. @see ai/current-task.md, where the same choice was
             * control-run for `Defeat` and the two agreed to three parts in a million.
             */
            const onAxis = along(center, major * Math.cos(t), attitude);
            ring.push(along(onAxis, minor * Math.sin(t), attitude + 90));
        }
        ring.push(ring[0]);
        return this.asPolygonFeature([ring]);
    }

    /**
     * `[major-axis grip, minor-axis grip, centre]` — the rectangular target's layout, so
     * the holder that splits it needs no case for this family.
     *
     * @see RectangularTarget.generateHandles, which explains why a two-dimension shape
     * publishes two grips where every other point-anchored graphic publishes one.
     */
    generateHandles(base: Feature<Point>, opts: RectangularTargetOptions | undefined): Feature<MultiPoint> {
        const {center, major, minor, attitude} = this.frame(base, opts);
        return this.asMultiPointFeature([along(center, major, attitude), along(center, minor, attitude + 90), center]);
    }

    generateLabels(base: Feature<Point>, opts: RectangularTargetOptions | undefined): Feature<Point> {
        return this.asPointFeature(this.frame(base, opts).center);
    }
}

/** Where the `T` sits along the search axis, as a fraction of the way from start to stop range. */
const RSD_LABEL_FRACTION = 0.5;

/**
 * The start range a single-band radar search doctrine gets, as a share of its stop range.
 *
 * **A default, not a rule, and chosen rather than measured.** Two ranges is what the plate
 * draws — an annular band standing off from the radar — and a symbol dropped before anyone
 * opens the bands editor has only the one the drag produced. Left at zero it draws a pie
 * wedge with its apex on the anchor point, which is a legibly *different* picture from
 * every Template and Example this symbol has, and the one the thumbnail, the picker and
 * the sample sheet would all show.
 *
 * The plate's own proportion was measured and **the measurement was thrown away**: its two
 * arcs are short and nearly concentric, so a joint circle fit came out with an RMS residual
 * of 45 px on radii around 300 and two independent fits disagreed by 20 percentage points.
 * A number that unstable is not evidence. This is a legibility choice — wide enough that
 * the band reads as a band at picker size — and an explicit inner band overrides it
 * outright. @see RadarSearchDoctrine.frame
 */
const RSD_DEFAULT_START_SHARE = 0.4;

/**
 * Radar search doctrine — APP-06 200700. **An annular sector**, and the only one here.
 *
 * > This symbol requires one anchor point that defines the axis of angular rotation. […]
 * > The size and shape of this symbol is determined by additional numeric values, a search
 * > axis azimuth, a start range, a stop range, and a stop relative bearing. The stop
 * > relative bearing is an equal angle either side of the search axis.
 *
 * ## Why it is a range fan rather than a bag of four new fields
 *
 * Those four numbers are, in this library's terms, a **sector range fan with two rings**:
 * the innermost band's range is the start range, the outermost band's is the stop range,
 * and a band already carries a left and a right azimuth about a global `centerAzimuthDeg`.
 * So it takes `RangeFanOptions`, the `rangeFan` controller and the existing bands editor,
 * and adds no parallel schema for quantities the schema already describes.
 *
 * Two consequences worth stating, because both are deliberate:
 *
 * - **One band still draws two arcs.** A single ring leaves the start range unstated, and
 *   zero would put the symbol's apex on the radar itself — a pie wedge, which is a
 *   different picture from every Template and Example this symbol has. So the innermost
 *   arc falls back to a share of the outermost. @see RSD_DEFAULT_START_SHARE
 * - **Only the innermost and outermost rings are drawn.** A sector fan draws every band;
 *   this draws the annulus between the first and the last, because the plate has exactly
 *   two arcs. Bands in between are carried but not painted — the alternative was refusing
 *   them, which would make the shared editor lie about what it accepts.
 *
 * The whole ring is one closed polygon, walked out along the far arc and back along the
 * near one, so the fill the plate specifies has something to fill. @see radarSearchDoctrinePaint
 */
export class RadarSearchDoctrine extends TacticalGraphicsBase<RangeFanOptions> {
    name: string = TacticalGraphicName.RadarSearchDoctrine;
    type: string = 'Point';

    /** Start range, stop range and the two edge bearings, all resolved. */
    private frame(base: Feature<Point>, opts: RangeFanOptions | undefined) {
        const center = base.geometry.coordinates;
        const bands = resolveBands(opts);
        const outer = bands[bands.length - 1];
        // Two or more bands: the innermost is the start range, stated. One band: the
        // default share, so a freshly drawn symbol is the plate's annulus rather than a
        // wedge. @see RSD_DEFAULT_START_SHARE
        const start = bands.length > 1 ? bands[0].range : outer.range * RSD_DEFAULT_START_SHARE;
        const {leftAz, rightAz} = resolveBandAzimuths(outer, opts);
        return {center, start, stop: outer.range, leftAz, rightAz};
    }

    generateGraphics(base: Feature<Point>, opts: RangeFanOptions | undefined): Feature<Polygon> {
        const {center, start, stop, leftAz, rightAz} = this.frame(base, opts);
        // Clockwise from left to right, wrapping through north the way the fans do.
        const sweep = ((rightAz - leftAz) % 360 + 360) % 360;
        const steps = Math.max(8, Math.ceil(sweep / 3));

        const arc = (radius: number, reverse: boolean): Position[] => {
            const out: Position[] = [];
            for (let i = 0; i <= steps; i++) {
                const t = reverse ? 1 - i / steps : i / steps;
                out.push(along(center, radius, leftAz + sweep * t));
            }
            return out;
        };

        // Out along the far arc, back along the near one. With a zero start range the
        // near arc collapses onto the centre, which closes the wedge at its apex.
        const ring = start > 0 ? [...arc(stop, false), ...arc(start, true)] : [...arc(stop, false), center];
        ring.push(ring[0]);
        return this.asPolygonFeature([ring]);
    }

    /** `[stop-range grip, centre]` — the one-radius layout every point-anchored circle has. */
    generateHandles(base: Feature<Point>, opts: RangeFanOptions | undefined): Feature<MultiPoint> {
        const {center, stop, leftAz, rightAz} = this.frame(base, opts);
        const sweep = ((rightAz - leftAz) % 360 + 360) % 360;
        return this.asMultiPointFeature([along(center, stop, leftAz + sweep / 2), center]);
    }

    /**
     * Where field `T` goes: *"positioned in the centre of the search area aligned with the
     * search axis"* — so on the axis, midway between the two arcs, not at the anchor point.
     * The anchor is the radar; the search area is out in front of it.
     */
    generateLabels(base: Feature<Point>, opts: RangeFanOptions | undefined): Feature<Point> {
        const {center, start, stop, leftAz, rightAz} = this.frame(base, opts);
        const sweep = ((rightAz - leftAz) % 360 + 360) % 360;
        return this.asPointFeature(along(center, start + (stop - start) * RSD_LABEL_FRACTION, leftAz + sweep / 2));
    }
}
