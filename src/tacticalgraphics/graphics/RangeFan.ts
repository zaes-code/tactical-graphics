import {TacticalGraphicsBase} from "./TacticalGraphicsBase";
import {RangeFanBand, RangeFanOptions, TacticalGraphicName} from "../core/type";
import {Feature, MultiLineString, MultiPoint, Point, Position} from "geojson";
import geometryService from "../core/GeometryService";

/** Fallback outer range when a fan has no bands yet, in metres. */
const DEFAULT_RADIUS_M = 1000;
const SECTOR_HALF_ARC_DEFAULT_DEG = 45;
const ARC_STEPS = 60;
/** Where the arrow's tip sits, expressed as a fraction of the outer band's
 * radius past the arc. 0.20 = tip lands 20% of the outer radius beyond
 * the outermost arc — visibly outside the wedge. */
const ARROW_TIP_OFFSET_FRACTION = 0.20;
const ARROW_HEAD_LENGTH_FRACTION = 0.06;
const ARROW_HEAD_HALF_DEG = 25;
const TICK_FRACTION = 0.04;

/**
 * Convert math-convention rotation (degrees CCW from east) to
 * navigation-convention azimuth (degrees CW from north). Both range fans
 * accept `centerAzimuthDeg` directly; if absent we derive it from the
 * controller-supplied `rotation`.
 */
export function rotationToAzimuth(rotationDeg: number): number {
    let az = 90 - rotationDeg;
    while (az < 0) az += 360;
    while (az >= 360) az -= 360;
    return az;
}

export function resolveBands(opts: RangeFanOptions | undefined): RangeFanBand[] {
    const bands = opts?.bands?.filter(b => Number.isFinite(b.range) && b.range > 0) ?? [];
    if (bands.length === 0) {
        // opts.size is projected metres from the controller (OL Circle.getRadius), which
        // is now the same unit a band carries — no conversion left to get wrong.
        return [{range: opts?.size ?? DEFAULT_RADIUS_M}];
    }
    // Sort by range so we can render concentric rings cleanly.
    return [...bands].sort((a, b) => a.range - b.range);
}

/**
 * Resolve the global center azimuth (absolute, CW from N) for the sector
 * fan. Falls back to the controller's drawn rotation.
 */
export function resolveCenterAzimuth(opts: RangeFanOptions | undefined): number {
    return opts?.centerAzimuthDeg ?? rotationToAzimuth(opts?.rotation ?? 0);
}

function normAz(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/**
 * Resolve a single band's *absolute* left/right azimuths. Per-band fields
 * win; absent fields fall back to ±45° around the global center azimuth
 * (so an untouched band still renders as a 90° wedge centered on the
 * arrow). Used by both the geometry generator and by RangeFanGraphicBase
 * when stamping resolved bands on the OL label feature.
 */
export function resolveBandAzimuths(
    band: RangeFanBand,
    opts: RangeFanOptions | undefined,
): { leftAz: number; rightAz: number } {
    const centerAz = resolveCenterAzimuth(opts);
    const leftAz = band.leftAzimuthDeg ?? normAz(centerAz - SECTOR_HALF_ARC_DEFAULT_DEG);
    const rightAz = band.rightAzimuthDeg ?? normAz(centerAz + SECTOR_HALF_ARC_DEFAULT_DEG);
    return {leftAz, rightAz};
}

/**
 * Multi-band weapon/sensor range fan (full 360°). Renders one full circle
 * per band plus a radial reference tick along the controller's rotation
 * direction. Per-band labels are anchored at the mid-radius along that
 * same reference bearing — the OL style function reads the MultiPoint
 * vertex for each band and stamps "RG <range>" / "ALT <altitude>".
 */
export class WeaponRangeFanCircular extends TacticalGraphicsBase<RangeFanOptions> {
    name: string = TacticalGraphicName.WeaponSensorRangeFanCircular;
    type: string = 'Point';

    generateGraphics(base: Feature<Point>, opts?: RangeFanOptions): Feature<MultiLineString> {
        const center = base.geometry.coordinates;
        const bands = resolveBands(opts);
        const refAz = opts?.centerAzimuthDeg ?? rotationToAzimuth(opts?.rotation ?? 0);

        const lines: Position[][] = [];
        for (const band of bands) {
            // turf-based circle (geographic coords). createCircularArc with
            // a 0–360 sweep returns a closed ring; passing rotation=0 is
            // fine because we want the same circle no matter what bearing
            // we're "facing". Band ranges are metres, which is what turf wants.
            const ring = geometryService.createCircularArc(center, 0, band.range, 0, 360, ARC_STEPS * 2);
            lines.push(ring);
        }

        // Radial tick at the reference bearing, at the outermost band.
        const outerRadiusM = bands[bands.length - 1].range;
        const tickStartR = outerRadiusM * (1 - TICK_FRACTION);
        const tickStart = pointAtAzimuth(center, refAz, tickStartR);
        const tickEnd = pointAtAzimuth(center, refAz, outerRadiusM);
        lines.push([tickStart, tickEnd]);

        return this.asMultiLineStringFeature(lines, {
            graphicName: this.name,
        });
    }

    /**
     * `[center, ...one rim per band]` — every ring gets its own handle, sitting
     * on that ring along the reference bearing, so each band's range can be
     * dragged independently. Rims follow the **sorted** band order
     * (`resolveBands`), which is the order the renderer's handle index maps to.
     */
    generateHandles(base: Feature<Point>, opts?: RangeFanOptions): Feature<MultiPoint> {
        const center = base.geometry.coordinates;
        const bands = resolveBands(opts);
        const refAz = opts?.centerAzimuthDeg ?? rotationToAzimuth(opts?.rotation ?? 0);
        const rims = bands.map(band => pointAtAzimuth(center, refAz, band.range));
        return this.asMultiPointFeature([center, ...rims]);
    }

    /**
     * Returns a MultiPoint whose vertices the OL label-style function
     * iterates: vertex 0 is the center (no text), vertices 1..N are the
     * per-band label anchors at mid-radius along the reference bearing.
     * Stash the resolved bands and reference azimuth in feature properties
     * so the style function can pair vertex i with band[i-1].
     */
    generateLabels(base: Feature<Point>, opts?: RangeFanOptions): Feature<Point> {
        const center = base.geometry.coordinates;
        const bands = resolveBands(opts);
        const refAz = opts?.centerAzimuthDeg ?? rotationToAzimuth(opts?.rotation ?? 0);

        const points: Position[] = [center];
        let prevM = 0;
        for (const band of bands) {
            const midM = (prevM + band.range) / 2;
            points.push(pointAtAzimuth(center, refAz, midM));
            prevM = band.range;
        }

        return this.asMultiPointFeature(points, {
            rangeFanShape: 'circular',
            rangeFanBands: bands,
            rangeFanCenterAzimuth: refAz,
        }) as unknown as Feature<Point>;
    }
}

/**
 * Multi-band sector (pie-slice) weapon/sensor range fan. Renders one arc
 * per band plus the two outer edge lines, a center axis line with arrow
 * head, per-band range/altitude labels along the center bearing, and
 * azimuth labels at the outer arc edges.
 */
export class WeaponRangeFanSector extends TacticalGraphicsBase<RangeFanOptions> {
    name: string = TacticalGraphicName.WeaponSensorRangeFanSector;
    type: string = 'Point';

    generateGraphics(base: Feature<Point>, opts?: RangeFanOptions): Feature<MultiLineString> {
        const center = base.geometry.coordinates;
        const bands = resolveBands(opts);
        const centerAz = resolveCenterAzimuth(opts);

        const lines: Position[][] = [];
        for (let i = 0; i < bands.length; i++) {
            const band = bands[i];
            const {leftAz, rightAz} = resolveBandAzimuths(band, opts);
            const radiusM = band.range;
            // Inner endpoint of this band's edge lines: for the innermost
            // band that's the center; for every outer band it's the
            // *previous* band's circle along the same azimuth (visible or
            // not), so each band reads as its own enclosed donut slice
            // instead of one giant fan with overlapping radial spokes.
            const prevRadiusM = i === 0 ? 0 : bands[i - 1].range;

            // Outer arc at this band's radius.
            lines.push(arcAtAzimuthRange(center, leftAz, rightAz, radiusM, ARC_STEPS));

            // Inner arc closes the donut for non-innermost bands. Without
            // this the band reads as an open "C". For i=0 the inner radius
            // is 0 — no inner arc; the two edges already meet at center.
            if (prevRadiusM > 0) {
                lines.push(arcAtAzimuthRange(center, leftAz, rightAz, prevRadiusM, ARC_STEPS));
            }

            // Two edge lines: from prev-band's circle (or center for i=0)
            // out to this band's arc endpoints.
            const leftStart = i === 0 ? center : pointAtAzimuth(center, leftAz, prevRadiusM);
            const leftEnd = pointAtAzimuth(center, leftAz, radiusM);
            const rightStart = i === 0 ? center : pointAtAzimuth(center, rightAz, prevRadiusM);
            const rightEnd = pointAtAzimuth(center, rightAz, radiusM);
            lines.push([leftStart, leftEnd]);
            lines.push([rightStart, rightEnd]);
        }

        // One axis arrow for the whole fan along the global center bearing.
        // Tip lands well past the outermost arc so the head reads as
        // pointing away from the wedge rather than touching its edge.
        const outerRadiusM = bands[bands.length - 1].range;
        const tipR = outerRadiusM * (1 + ARROW_TIP_OFFSET_FRACTION);
        const arrowTip = pointAtAzimuth(center, centerAz, tipR);
        lines.push([center, arrowTip]);

        const headLen = outerRadiusM * ARROW_HEAD_LENGTH_FRACTION;
        const backAz = (centerAz + 180) % 360;
        const arrowLeft = pointAtAzimuth(arrowTip, backAz - ARROW_HEAD_HALF_DEG, headLen);
        const arrowRight = pointAtAzimuth(arrowTip, backAz + ARROW_HEAD_HALF_DEG, headLen);
        lines.push([arrowTip, arrowLeft]);
        lines.push([arrowTip, arrowRight]);

        return this.asMultiLineStringFeature(lines, {
            graphicName: this.name,
        });
    }

    /**
     * `[center, ...one handle per band]` — each band's handle sits on its own arc
     * along the *global* center bearing (the same anchor the band's mid-label
     * uses), so every band's range can be dragged independently. Handles follow
     * the **sorted** band order from `resolveBands`.
     */
    generateHandles(base: Feature<Point>, opts?: RangeFanOptions): Feature<MultiPoint> {
        const center = base.geometry.coordinates;
        const bands = resolveBands(opts);
        const centerAz = resolveCenterAzimuth(opts);
        const rims = bands.map(band => pointAtAzimuth(center, centerAz, band.range));
        return this.asMultiPointFeature([center, ...rims]);
    }

    /**
     * MultiPoint label anchor layout for the sector — three vertices per
     * band so each band can carry its own per-band azimuth labels:
     *   [0]                center (no label)
     *   [3i+1]             band i mid-label (along *global* centerAz)
     *   [3i+2]             band i left azimuth label (outside arc)
     *   [3i+3]             band i right azimuth label (outside arc)
     * Each band's resolved left/right azimuths are baked into the bands
     * array stamped on the label feature so the OL style fn can format
     * the text without re-running the resolver.
     */
    generateLabels(base: Feature<Point>, opts?: RangeFanOptions): Feature<Point> {
        const center = base.geometry.coordinates;
        const bands = resolveBands(opts);
        const centerAz = resolveCenterAzimuth(opts);

        const points: Position[] = [center];
        let prevM = 0;
        const bandsWithAzimuths = bands.map(band => {
            const {leftAz, rightAz} = resolveBandAzimuths(band, opts);
            const radiusM = band.range;
            const midM = (prevM + band.range) / 2;
            // On the arc, not past it. This used to be `radiusM * 1.05`, which is a metric
            // offset baked into the geometry: 5% of a 180 km band is 9 km of ground, a few
            // pixels when the whole fan fits the screen and tens of pixels once you zoom
            // in, so the bearing crept away from the edge it marks the further in you went.
            // The clearance is a screen quantity and belongs in the paint, which already
            // nudges these outward by a fixed pixel gap. @see AZIMUTH_LABEL_GAP_PX
            const azLabelR = radiusM;
            points.push(pointAtAzimuth(center, centerAz, midM));
            points.push(pointAtAzimuth(center, leftAz, azLabelR));
            points.push(pointAtAzimuth(center, rightAz, azLabelR));
            prevM = band.range;
            // Stamp the *resolved absolute* azimuths so the OL style fn
            // can format them as compass bearings (e.g. "315"). The raw
            // user-facing fields on RangeFanBand are deflections, not
            // azimuths.
            return {
                ...band,
                resolvedLeftAz: leftAz,
                resolvedRightAz: rightAz,
            };
        });

        return this.asMultiPointFeature(points, {
            rangeFanShape: 'sector',
            rangeFanBands: bandsWithAzimuths,
        }) as unknown as Feature<Point>;
    }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * `geometryService.createCircularArc` works in math-convention (CCW from
 * east). We want navigation-convention (CW from north). Easy bridge: feed
 * the desired bearing as `90 - azimuth` into the math-convention rotation
 * argument with a 0..0 sweep — that pins the arc to a single point.
 */
function pointAtAzimuth(center: Position, azimuthDeg: number, distanceM: number): Position {
    const rotationMath = 90 - azimuthDeg;
    return geometryService.createCircularArc(center, rotationMath, distanceM, 0, 0, 1)[0];
}

function arcAtAzimuthRange(
    center: Position,
    leftAz: number,
    rightAz: number,
    distanceM: number,
    steps: number,
): Position[] {
    // Sample the arc clockwise from leftAz to rightAz. Plain subtraction
    // breaks when the sector crosses 0°/360° (e.g. left=350, right=10) —
    // the sweep would go negative and the arc would traverse the long
    // way around. Normalize end ≥ start so the sweep is always positive
    // CW; turf.destination treats bearings modulo 360 so values >360 are
    // fine to pass through pointAtAzimuth.
    const points: Position[] = [];
    let endAz = rightAz;
    if (endAz < leftAz) endAz += 360;
    const sweep = endAz - leftAz;
    for (let i = 0; i <= steps; i++) {
        const az = leftAz + (sweep * i) / steps;
        points.push(pointAtAzimuth(center, az, distanceM));
    }
    return points;
}

/**
 * The band data a renderer needs to label a range fan, resolved from the portable
 * property bag.
 *
 * A fan's bands are amplifiers, and the geometry generator consumes them and emits
 * only points — the band a given anchor belongs to, and the azimuths a sector's
 * arms actually ended up at, are not recoverable from the output. Every renderer
 * therefore has to re-resolve them with the same defaults the generator used, or
 * its labels drift off the arcs.
 *
 * That derivation was written out inside `RangeFanGraphicBase`, so it existed for
 * one renderer only: MapLibre drew the arcs and none of the three labels, because
 * `rangeFanLabelPaint` returns nothing without bands to walk.
 *
 * `resolvedLeftAz` / `resolvedRightAz` are **absolute** compass bearings, which is
 * what a sector's arm labels print. The band's own fields are deflections from the
 * center, so they cannot be printed directly.
 */
export function resolveRangeFanBands(
    name: TacticalGraphicName,
    opts: RangeFanOptions | undefined,
): {shape: 'sector' | 'circular'; bands: RangeFanBand[]} {
    const isSector = name === TacticalGraphicName.WeaponSensorRangeFanSector;
    const bands = resolveBands(opts);
    if (!isSector) return {shape: 'circular', bands};

    return {
        shape: 'sector',
        bands: bands.map(band => {
            const {leftAz, rightAz} = resolveBandAzimuths(band, opts);
            return {...band, resolvedLeftAz: leftAz, resolvedRightAz: rightAz};
        }),
    };
}
