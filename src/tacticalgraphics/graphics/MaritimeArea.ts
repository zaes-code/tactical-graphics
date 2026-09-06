import {Feature, GeometryCollection, MultiPoint, Point, Polygon, Position} from 'geojson';
import {RangeFanOptions, RectangularTargetOptions, TacticalGraphicName} from '../core/type';
import {TacticalGraphicsBase} from './TacticalGraphicsBase';
import {resolveBandAzimuths, resolveBands, resolveCenterAzimuth} from './RangeFan';
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
export const RSD_DEFAULT_START_SHARE = 0.4;

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
/** What 200700's clicks have stated so far. @see radarSearchFromClicks */
export interface RadarSearchFrame {
    /** Point 1 — *"the axis of angular rotation"*, which is the radar itself. */
    center: Position;
    /** The search axis azimuth, degrees clockwise from north. */
    centerAzimuthDeg: number;
    /** The ranges stated, near first: one after the second click, both after the third. */
    ranges: number[];
}

/**
 * 200700's four numbers, read off the three clicks that place it.
 *
 * ## Why a Point-based symbol is drawn with three clicks
 *
 * The plate asks for **one anchor point** and states everything else as a value: *"the size
 * and shape ... determined by additional numeric values, a search axis azimuth, a start
 * range, a stop range, and a stop relative bearing."* So one point and four numbers is what
 * is **stored**, and that is not in question.
 *
 * How those numbers are first *given* is a separate question, and the answer is three
 * clicks — the radar, then each arc. It was that until 2026-09-05, when moving the storage
 * to one point took the gesture with it and left a drop-and-drag that can only state one
 * range; the user asked for the clicks back. The distinction is the one this repo has paid
 * for twice already: **how long a draw runs is not what shape the base is.**
 * @see centreToEdgeDrawParity, drawClickCount
 *
 * ## What each click decides
 *
 * | Click | Decides |
 * |---|---|
 * | 1 | the radar |
 * | 2 | the search axis, and the first range — one arc is drawn, and only one |
 * | 3 | the other range — the sector closes and the draw ends |
 *
 * **Click 3's bearing is discarded, and only its distance counts.** The axis was settled by
 * click 2, and a third point off it would describe a sector whose two arcs are not
 * concentric — which 200700 does not have. Same discipline as pursuit's third click.
 * @see pursuitAnchors
 *
 * **Neither click is assumed to be the nearer one**, so the operator may place the stop arc
 * before the start arc and get the symbol they drew rather than an inside-out one.
 *
 * Returns `undefined` until there is something to state — a cursor still sitting on the
 * first click describes no axis and no range.
 */
export function radarSearchFromClicks(clicks: Position[]): RadarSearchFrame | undefined {
    if (clicks.length < 2) return undefined;
    const center = clicks[0];
    const reach = (to: Position): number => turf.distance(turf.point(center), turf.point(to), {units: 'meters'});

    const first = reach(clicks[1]);
    if (!Number.isFinite(first) || first <= 0) return undefined;
    const centerAzimuthDeg = ((turf.bearing(turf.point(center), turf.point(clicks[1])) % 360) + 360) % 360;

    if (clicks.length < 3) return {center, centerAzimuthDeg, ranges: [first]};
    const second = reach(clicks[2]);
    // A third click that has not moved off the second states nothing new, and two equal
    // ranges are a sector of no depth — hold the arc phase rather than draw one.
    if (!Number.isFinite(second) || second <= 0 || second === first) {
        return {center, centerAzimuthDeg, ranges: [first]};
    }
    return {center, centerAzimuthDeg, ranges: [Math.min(first, second), Math.max(first, second)]};
}

/**
 * The narrowest 200700's sector may be dragged, in degrees of full opening.
 *
 * A wedge dragged to zero is a line, and dragged through zero it turns inside out — the left
 * edge ends up right of the right edge and the arc takes the long way round. Neither is
 * recoverable by dragging back, because there is no longer an arc under the cursor to grab.
 */
/**
 * The *stop relative bearing* an untouched 200700 opens at, in degrees either side of the
 * axis — so a 90 degree sector.
 *
 * Stated here rather than borrowed from the weapon fans' `SECTOR_HALF_ARC_DEFAULT_DEG`,
 * which happens to be the same number today: they are two symbols' defaults and nothing
 * says they move together. Both engines and the properties dialog read this one.
 */
export const RSD_DEFAULT_RELATIVE_BEARING_DEG = 45;

export const RSD_MIN_OPENING_DEG = 5;

/**
 * 200700's *stop relative bearing*, read off the grip that states it.
 *
 * Returns the pair of absolute edge bearings to file on every band, or `undefined` when the
 * cursor describes an opening too narrow or too wide to be an opening at all.
 *
 * **A geodesic bearing, and that is the point of it living here.** The grip is *placed* at a
 * geodesic bearing — `generateHandles` walks it out with `turf.destination` — so reading it
 * back any other way does not round-trip. MapLibre's editor works in planar Mercator and its
 * `atan2` would have answered a few degrees out on a large sector away from the equator, so
 * the wedge would have jumped the moment it was grabbed on one engine and not the other.
 * One reading, called from both. @see ai/conventions.md, "A symbology fact never lives in a
 * holder"
 *
 * The half-angle is taken either way round the axis, so the grip may be dragged past it and
 * out the other side rather than sticking at zero.
 */
export function radarSectorOpening(
    center: Position,
    axisAzimuthDeg: number,
    cursor: Position,
): {leftAzimuthDeg: number; rightAzimuthDeg: number} | undefined {
    const norm = (deg: number): number => ((deg % 360) + 360) % 360;
    const bearing = turf.bearing(turf.point(center), turf.point(cursor));
    if (!Number.isFinite(bearing)) return undefined;

    const axis = norm(axisAzimuthDeg);
    const delta = norm(norm(bearing) - axis);
    const half = Math.abs(delta > 180 ? delta - 360 : delta);
    if (half * 2 < RSD_MIN_OPENING_DEG || half * 2 > 360 - RSD_MIN_OPENING_DEG) return undefined;

    return {leftAzimuthDeg: norm(axis - half), rightAzimuthDeg: norm(axis + half)};
}

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
    /**
     * The radar, the two ranges, the axis and the opening — **all four as the plate names
     * them**, with the shape 200700 used to be saved in read as a fallback.
     *
     * ## The four values first
     *
     * `searchAxisAzimuthDeg`, `startRange`, `stopRange` and `stopRelativeBearingDeg` are what
     * the standard states and what the file now carries. Read straight through: no bands, no
     * `rotation` standing in for an azimuth, no pair of absolute bearings standing in for one
     * relative angle.
     *
     * ## ...then the legacy shape
     *
     * A 200700 saved before 2026-09-05 describes itself as a two-band range fan — the ranges
     * as `rangeFan.bands`, the axis as `rotation` (degrees counter-clockwise from east, hence
     * `resolveCenterAzimuth`), the opening as a pair of absolute band azimuths. Those still
     * render, and so does a symbol carrying neither: a sample, a thumbnail or a host drop has
     * only a drawn `size`, and takes {@link RSD_DEFAULT_START_SHARE} for its near arc.
     *
     * **The opening is re-centred on the axis whichever way it arrived.** The plate calls it
     * "an equal angle either side of the search axis", so only the angle between the two
     * edges is meaningful — a stored pair taken at face value would pin the wedge to the
     * compass and sit still under every rotate.
     */
    private frame(base: Feature<Point>, opts: RangeFanOptions | undefined) {
        const center = base.geometry.coordinates ?? [0, 0];
        const norm = (deg: number): number => ((deg % 360) + 360) % 360;

        // ── the legacy description, used only where a plate value is absent ──
        const bands = resolveBands(opts);
        const outer = bands[bands.length - 1];
        const typed = opts?.bands ?? [];
        const bandStop = typed.length ? outer.range : (opts?.size ?? outer.range);
        const bandStart = typed.length > 1 ? bands[0].range : undefined;
        const {leftAz, rightAz} = resolveBandAzimuths(outer, opts);

        const stop = Math.max(opts?.stopRange ?? bandStop, 1);
        const statedStart = opts?.startRange ?? bandStart;
        const start = Math.max(0, Math.min(statedStart ?? stop * RSD_DEFAULT_START_SHARE, stop));

        /*
         * **Exactly one range stated means the second has not been decided yet** — the state
         * the symbol is in between the second click and the third. A finished 200700 carries
         * both, a restored one carries both, and one built with neither takes the default
         * share above and is drawn whole. @see radarSearchFromClicks
         */
        const halfDrawn = opts?.stopRange !== undefined
            ? opts?.startRange === undefined
            : typed.length === 1;

        const axis = norm(opts?.searchAxisAzimuthDeg ?? resolveCenterAzimuth(opts));
        const half = opts?.stopRelativeBearingDeg ?? norm(rightAz - leftAz) / 2;
        return {center, start, stop, axis, halfDrawn, leftAz: norm(axis - half), rightAz: norm(axis + half)};
    }

    generateGraphics(base: Feature<Point>, opts: RangeFanOptions | undefined): Feature<GeometryCollection> {
        const {center, start, stop, axis, halfDrawn, leftAz, rightAz} = this.frame(base, opts);
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
         * **One range known: draw the arc, and only the arc.** (User's call, 2026-09-04,
         * restored 2026-09-05 with the three-click draw it belongs to.)
         *
         * Between the second click and the third the symbol holds the radar, an axis and one
         * distance, and which of the plate's two ranges that distance *is* has not been
         * decided yet. Closing a sector around it puts a second arc on the map at a range the
         * user has not given — a picture of a symbol they have not finished describing — and
         * the whole figure then jumps when the next click lands.
         *
         * So the preview is the bare arc the sweep already defines: one range, one mark. The
         * sector arrives with the third click, which is what settles which range is which.
         *
         * **The test is the band count, not `size`.** It used to read "nothing is known at
         * all", which no drawn symbol is — the holder always publishes a `size` — so the
         * branch was unreachable from the moment 200700 stopped being three drawn vertices
         * and the arc phase went with it. @see frame, halfDrawn
         */
        if (halfDrawn) {
            return this.asGeometryCollectionFeature([
                {type: 'LineString', coordinates: arc(stop, false)},
                this.labelAnchor(center, stop, stop, axis),
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
            this.labelAnchor(center, start, stop, axis),
        ]);
    }

    /**
     * Field `T`'s point: on the search axis, midway between the two arcs.
     *
     * Takes the axis rather than the two edges. It bisected them here as well until
     * 2026-09-05, which is a second copy of the frame's own statement — and the copy is
     * what let the label sit on a different bearing from the wedge. @see frame
     */
    private labelAnchor(center: Position, start: number, stop: number, axis: number): Point {
        const reach = start + (stop - start) * RSD_LABEL_FRACTION;
        return {type: 'Point', coordinates: along(center, reach, axis)};
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
        const {center, start, stop, axis, halfDrawn, rightAz} = this.frame(base, opts);
        /*
         * **One grip per range that has actually been stated.** Between the second click and
         * the third only one has, and a rim handle for the other would be a grip on a number
         * nobody gave — worse, the renderers index a rim drag into `resolveBands`, so a
         * second handle against a single band writes past the end of the list.
         */
        if (halfDrawn) return this.asMultiPointFeature([center, along(center, stop, axis)]);
        /*
         * **Four grips for the four numbers 200700 states**, in the order the renderers index:
         * the radar — inert, because the anchor point is not a size — then the start range,
         * the stop range, and the *stop relative bearing*.
         *
         * The first two ride the search axis, so dragging either moves a range and nothing
         * else. The fourth sits on the outer arc's right edge, where the opening's own width
         * is: dragging it swings both edges an equal angle off the axis, which is the plate's
         * *"equal angle either side of the search axis"* and is why one grip states a pair of
         * bearings. The axis itself moves with the rotate gesture rather than with a grip.
         * (User's call, 2026-09-05.) @see setRadarHalfAngle
         */
        return this.asMultiPointFeature([
            center,
            along(center, start, axis),
            along(center, stop, axis),
            along(center, stop, rightAz),
        ]);
    }

    /**
     * Where field `T` goes: *"positioned in the centre of the search area aligned with the
     * search axis"* — so on the axis, midway between the two arcs, not at the anchor point.
     * The anchor is the radar; the search area is out in front of it.
     */
    generateLabels(base: Feature<Point>, opts: RangeFanOptions | undefined): Feature<Point> {
        const {center, start, stop, axis} = this.frame(base, opts);
        return this.asPointFeature(this.labelAnchor(center, start, stop, axis).coordinates);
    }
}

