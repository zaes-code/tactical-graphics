import {Feature, GeometryCollection, MultiPoint, Point, Polygon, Position} from 'geojson';
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
 * ## Three anchor points: the radar, the start range and the stop range
 *
 * **The base is drawn, not typed.** Its plate names one anchor point and four numbers, and
 * the first version took that literally: a two-click centre-and-radius drag that set the
 * stop range and defaulted the start. That draws the symbol *from the radar to the far
 * arc*, which is not its shape — the near arc is where the search begins, and it is a
 * placement rather than a default. (User's call, 2026-09-04.)
 *
 * So point 1 is the radar, point 2 is on the start arc and point 3 is on the stop arc. Two
 * ranges and the search axis all come off those three, which leaves the **stop relative
 * bearing** as the only number the geometry cannot carry — and that stays with the bands
 * editor, as the outermost band's left and right azimuths.
 *
 * ## Typed wins, drawn is the fallback
 *
 * A band range that has been typed overrides the drag, which is the precedence the
 * rectangular target's width already uses (`typedHalfWidth ?? derived`). Nothing in the
 * dialog is dead: type a range and it takes, drag and it takes. A bare two-point base — a
 * graphic drawn before this change, or a sketch mid-draw — gets the old behaviour, the
 * stop range with {@link RSD_DEFAULT_START_SHARE} inside it.
 *
 * **Only the innermost and outermost rings are drawn.** A sector fan draws every band; this
 * draws the annulus between the first and the last, because the plate has exactly two arcs.
 * Bands in between are carried but not painted — the alternative was refusing them, which
 * would make the shared editor lie about what it accepts.
 *
 * The whole ring is one closed polygon, walked out along the far arc and back along the
 * near one, so the fill the plate specifies has something to fill. @see radarSearchDoctrinePaint
 */
export class RadarSearchDoctrine extends TacticalGraphicsBase<RangeFanOptions> {
    name: string = TacticalGraphicName.RadarSearchDoctrine;
    /**
     * **One anchor point, as 200700 states.** *"This symbol requires one anchor point that
     * defines the axis of angular rotation."* Everything else the shape needs is named in
     * Size/Shape as a number rather than a place: *"determined by additional numeric
     * values, a search axis azimuth, a start range, a stop range, and a stop relative
     * bearing."*
     *
     * It was three anchor points from 2026-09-04 to 2026-09-05 — the radar, a point on the
     * start arc and a point on the stop arc, all on the axis. That encoded exactly the same
     * four numbers, but as geometry, and it is not what the plate describes: a base that
     * carries a start range as a *coordinate* cannot be typed, only dragged. The four values
     * now live where the standard puts them, on `rangeFan` — which already carried them,
     * because the field registry has offered this symbol the range-fan editor with two fixed
     * bands since it was built. (User's call, 2026-09-05.)
     */
    type: string = 'Point';

    /**
     * The radar, the two ranges and the two edge bearings — every one of them a number.
     *
     * `resolveBands` supplies the fan's defaults where nothing is typed, so a symbol that
     * has only just been dropped still has a start range, a stop range and an opening.
     * `size` is the reach the draw gesture measured, and it seeds the stop range until a
     * band states one.
     */
    private frame(base: Feature<Point>, opts: RangeFanOptions | undefined) {
        const center = base.geometry.coordinates ?? [0, 0];
        const bands = resolveBands(opts);
        const outer = bands[bands.length - 1];
        const typed = opts?.bands ?? [];

        // Two bands, named individually by the plate: the near one is the start range and
        // the far one the stop range. @see fixedBands
        const stop = Math.max(typed.length ? outer.range : (opts?.size ?? outer.range), 1);
        const typedStart = typed.length > 1 ? bands[0].range : undefined;
        const start = Math.max(0, Math.min(typedStart ?? stop * RSD_DEFAULT_START_SHARE, stop));

        /*
         * **The axis is the azimuth, and the opening is centred on it.** 200700 gives a
         * *search axis azimuth* and a *stop relative bearing* that is "an equal angle either
         * side of the search axis", which is exactly the fan's centre azimuth and half-angle
         * — so the two edge bearings are derived rather than stored, and cannot drift apart
         * from the axis they are quoted against.
         */
        const norm = (deg: number): number => ((deg % 360) + 360) % 360;
        const {leftAz, rightAz} = resolveBandAzimuths(outer, opts);
        const half = norm(rightAz - leftAz) / 2;
        const axis = norm(opts?.centerAzimuthDeg ?? opts?.rotation ?? norm(leftAz + half));
        return {center, start, stop, leftAz: norm(axis - half), rightAz: norm(axis + half)};
    }

    generateGraphics(base: Feature<Point>, opts: RangeFanOptions | undefined): Feature<GeometryCollection> {
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

        /*
         * **One range known: draw the arc, and only the arc.** (User's call, 2026-09-04.)
         *
         * Between the first click and the second the base holds the radar and one distance,
         * and which of the plate's two ranges that distance *is* has not been decided yet.
         * Closing a sector around it puts a second arc on the map at a range the user has
         * not given — a picture of a symbol they have not finished describing — and the
         * whole figure then jumps when the next click lands.
         *
         * So the preview is the bare quarter arc the sweep already defines: one range, one
         * mark. The full annulus arrives with the third point, which is the click that
         * settles which range is which. A typed band is a decision too, so a stated range
         * closes the sector however many points the base carries.
         */
        const known = (opts?.bands?.length ?? 0) > 0 || (opts?.size ?? 0) > 0;
        if (!known) {
            return this.asGeometryCollectionFeature([
                {type: 'LineString', coordinates: arc(stop, false)},
                this.labelAnchor(center, stop, stop, leftAz, rightAz),
            ]);
        }

        // Out along the far arc, back along the near one. With a zero start range the
        // near arc collapses onto the centre, which closes the wedge at its apex.
        const ring = start > 0 ? [...arc(stop, false), ...arc(start, true)] : [...arc(stop, false), center];
        ring.push(ring[0]);

        /*
         * **The sector and field `T`'s anchor travel together, in one collection.**
         *
         * A `LineGraphicBase` graphic puts nothing on a label feature — every mark it draws
         * comes off the one geometry — and 200700 became one of those when its draw went to
         * three anchor points. Emitting the anchor here is what lets the paint place `T`
         * *"in the centre of the search area"* without reconstructing that point from the
         * ring. Fix does the same with its arrowhead. @see radarSearchDoctrinePaint
         */
        return this.asGeometryCollectionFeature([
            {type: 'Polygon', coordinates: [ring]},
            this.labelAnchor(center, start, stop, leftAz, rightAz),
        ]);
    }

    /** Field `T`'s point: on the search axis, midway between the two arcs. */
    private labelAnchor(
        center: Position,
        start: number,
        stop: number,
        leftAz: number,
        rightAz: number,
    ): Point {
        const sweep = ((rightAz - leftAz) % 360 + 360) % 360;
        const reach = start + (stop - start) * RSD_LABEL_FRACTION;
        return {type: 'Point', coordinates: along(center, reach, leftAz + sweep / 2)};
    }

    /**
     * The three grips: the radar, the start arc and the stop arc — **all on the search
     * axis**, whatever the clicks that produced them looked like.
     *
     * A vertex line, so each grip is the anchor point it was placed as. @see anchorVertex,
     * which makes the radar inert under a reshape so the sector cannot be bent about its own
     * origin — the same contract fields of fire and the search area have.
     *
     * The middle grip is re-derived rather than published where it was dropped. It used to
     * be handed back raw, so a click off to one side left a handle sitting beside the
     * symbol, on nothing, and the base line drawn through it made a `V` of a straight run.
     * The frame has already projected it; this draws it where the frame put it.
     * @see projectOntoAxis
     */
    generateHandles(base: Feature<Point>, opts: RangeFanOptions | undefined): Feature<MultiPoint> {
        const {center, start, stop, leftAz, rightAz} = this.frame(base, opts);
        const sweep = ((rightAz - leftAz) % 360 + 360) % 360;
        const axis = leftAz + sweep / 2;
        return this.asMultiPointFeature([center, along(center, start, axis), along(center, stop, axis)]);
    }

    /**
     * Where field `T` goes: *"positioned in the centre of the search area aligned with the
     * search axis"* — so on the axis, midway between the two arcs, not at the anchor point.
     * The anchor is the radar; the search area is out in front of it.
     */
    generateLabels(base: Feature<Point>, opts: RangeFanOptions | undefined): Feature<Point> {
        const {center, start, stop, leftAz, rightAz} = this.frame(base, opts);
        return this.asPointFeature(this.labelAnchor(center, start, stop, leftAz, rightAz).coordinates);
    }
}
