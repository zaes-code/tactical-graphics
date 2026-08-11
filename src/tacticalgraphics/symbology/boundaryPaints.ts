/**
 * # Boundary and the range fans
 *
 * The last two families whose amplifiers come from somewhere other than the
 * properties bag — boundary reads the echelon the properties dialog stamps on the
 * feature, and the range fans read a resolved band list the holder stamps on the
 * label feature.
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {BASE_FONT_SIZE_PX} from '../core/config';
import {HALO_WIDTH, LINE_WIDTH, fontStyle, formatAltitude, getColorByHostility, getLabelFillColor, getLabelHaloColor} from '../core/symbology';
import {TacticalGraphicEchelon, TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import {projectedMidSegment} from './decorations';
import {echelonMarks} from './echelonPaints';
import {amplifierDash, formatFullLabel, lineColorOf, scaleOf} from './paintFunctions';

type LinePaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/** Screen-pixel clearance between the echelon glyph and the line ends, and the labels. */
const BOUNDARY_GAP_PX = 10;
/** Share of the segment the gap takes, before the pixel clearance is added. */
const BOUNDARY_GAP_SHARE = 0.1;

/** The echelon glyph's half-extent *across* the line, in screen pixels at scale 1. */
function echelonPerpExtentPx(echelon: TacticalGraphicEchelon): number {
    switch (echelon) {
        case TacticalGraphicEchelon.companyBatteryTroop:
        case TacticalGraphicEchelon.battalionSquadron:
        case TacticalGraphicEchelon.regimentGroup:
        case TacticalGraphicEchelon.brigade:
            return 10;
        default:
            return 5;
    }
}

/** A text amplifier with the usual halo. */
function amplifier(at: ProjectedPosition, text: string, scale: number, rotation: number): Paint {
    return {
        geometry: {type: 'Point', coordinates: at},
        text: {
            text,
            font: fontStyle,
            fill: getLabelFillColor(),
            halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
            rotation,
            align: 'center',
            baseline: 'middle',
            scale,
        },
    };
}

/**
 * The boundary: the line broken open at its projected midpoint, the echelon glyph
 * in the gap, and the two commands' designations above and below it.
 *
 * **The echelon glyph stays in the unaffiliated colour even on a hostile
 * boundary** — the documented exception to the "hostile line work goes red" rule.
 * A boundary separates two commands and the glyph belongs to neither, so
 * colouring it by the line's affiliation would assert something the symbol does
 * not say. The line itself does take the affiliation colour.
 *
 * ## The offset is built from what it has to clear
 *
 * `anchor = (half the font's height + the echelon's reach across the line + the
 * gap) × scale`. With a middle baseline the near text edge sits half a glyph
 * closer to the line than its anchor, so this leaves exactly `gap` pixels of
 * clear space. All three terms scale together, which is what keeps the layout
 * looking identical at every zoom.
 *
 * `perpSign` tracks the upright flip: correcting the rotation by π without
 * flipping the perpendicular put the top label underneath on a line drawn
 * right-to-left.
 */
export function boundaryPaint(): LinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'LineString' && geometry.type !== 'MultiPoint') return [];
        const coords = geometry.coordinates;
        if (coords.length < 2) return [];

        const props = feature.properties;
        const topLabel = formatFullLabel(props.label ?? '', props.countryCode ?? '');
        const bottomLabel = formatFullLabel(props.secondId ?? '', props.secondCountryCode ?? '');
        const echelon = feature.echelon ?? props.echelon ?? TacticalGraphicEchelon.unknown;

        const {index, t} = projectedMidSegment(coords);
        const outline: ProjectedPosition[][] = [];
        for (let i = 0; i < coords.length - 1; i++) {
            if (i !== index) outline.push([coords[i], coords[i + 1]]);
        }

        const p1 = coords[index];
        const p2 = coords[index + 1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) return [];

        const scale = scaleOf(feature, context);
        const gapHalfMap = BOUNDARY_GAP_SHARE * segLen + BOUNDARY_GAP_PX * scale * context.resolution;
        const gapRatio = gapHalfMap / segLen;

        const gapA: ProjectedPosition = [p1[0] + dx * (t - gapRatio), p1[1] + dy * (t - gapRatio)];
        const gapB: ProjectedPosition = [p1[0] + dx * (t + gapRatio), p1[1] + dy * (t + gapRatio)];
        outline.push([p1, gapA], [gapB, p2]);

        let rotation = -Math.atan2(dy, dx);
        let perpSign = 1;
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
            perpSign = -1;
        }
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        const midGap: ProjectedPosition = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];
        const anchorMap =
            (BASE_FONT_SIZE_PX / 2 + echelonPerpExtentPx(echelon) + BOUNDARY_GAP_PX) * scale * context.resolution;
        const nx = perpSign * (-dy / segLen);
        const ny = perpSign * (dx / segLen);

        return [
            amplifier([midGap[0] + nx * anchorMap, midGap[1] + ny * anchorMap], topLabel, scale, rotation),
            amplifier([midGap[0] - nx * anchorMap, midGap[1] - ny * anchorMap], bottomLabel, scale, rotation),
            ...echelonMarks(
                midGap,
                dx,
                dy,
                context.resolution,
                echelon,
                getColorByHostility(TacticalGraphicHostility.unknown),
                scale,
            ),
            {
                geometry: {type: 'MultiLineString', coordinates: outline},
                stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: amplifierDash(feature)},
            },
        ];
    };
}

/**
 * A range band as the holder resolves it for rendering.
 *
 * Distinct from `RangeFanBand` in `core/type.ts`, which is the **user-facing**
 * config: its azimuths are deflections from the graphic's centre bearing. These
 * are absolute, already resolved. Keeping them apart means a paint function can
 * never be handed a deflection and print it as a bearing.
 */
export interface ResolvedRangeFanBand {
    /** Kilometres. */
    range: number;
    label?: string;
    altitude?: string;
    /**
     * Absolute compass bearings, already resolved. The user-facing fields on a
     * band are deflections from the graphic's centre bearing; resolving them is
     * the holder's job so the paint function never re-runs the resolver.
     */
    resolvedLeftAz?: number;
    resolvedRightAz?: number;
}

/** Range bands are stored in km; print them dropping a trailing .0. */
function formatKm(km: number): string {
    if (!Number.isFinite(km)) return '0';
    return Number.isInteger(km) ? String(km) : km.toFixed(1);
}

/** An azimuth as FM 1-02.2 prints it — three digits, zero-padded. */
function formatAzimuth(deg: number): string {
    let n = Math.round(deg) % 360;
    if (n < 0) n += 360;
    return String(n).padStart(3, '0');
}

/**
 * The doctrinal weapon/sensor range fans' labels.
 *
 * MultiPoint vertex layout, written by `RangeFan.generateLabels`:
 *
 * - circular: `[centre, band1Mid, band2Mid, …]`
 * - sector: `[centre, band1Mid, band1LeftAz, band1RightAz, band2Mid, …]`
 *
 * so the stride is three for a sector and one for a circle. Per band the stack
 * reads: the user's name if there is one, then the range — "MIN RG" on a circle
 * and "RG" on a sector — then the altitude if entered. **The range line renders
 * even when nothing is typed**: an unnamed band still has a range, and that is
 * the number the symbol exists to communicate.
 */
export function rangeFanLabelPaint(name: TacticalGraphicName): LinePaint {
    return (feature, context) => {
        const geometry = feature.geometry;
        if (geometry.type !== 'MultiPoint') return [];
        const coords = geometry.coordinates;
        if (coords.length < 2) return [];

        const bands = feature.rangeFanBands;
        if (!bands || bands.length === 0) return [];

        const isSector = feature.rangeFanShape === 'sector' && name === TacticalGraphicName.WeaponSensorRangeFanSector;
        const stride = isSector ? 3 : 1;
        const scale = scaleOf(feature, context);
        const paints: Paint[] = [];

        const text = (at: ProjectedPosition, value: string): Paint => ({
            geometry: {type: 'Point', coordinates: at},
            text: {
                text: value,
                font: fontStyle,
                fill: getLabelFillColor(),
                halo: {color: getLabelHaloColor(), widthPx: HALO_WIDTH},
                align: 'center',
                baseline: 'middle',
                scale,
            },
        });

        for (let i = 0; i < bands.length; i++) {
            const midIndex = 1 + i * stride;
            if (midIndex >= coords.length) break;

            const band = bands[i];
            const lines: string[] = [];
            const bandLabel = band.label?.trim();
            if (bandLabel) lines.push(bandLabel);
            if (feature.rangeFanShape === 'circular') lines.push(`MIN RG ${formatKm(band.range)}`);
            else if (isSector) lines.push(`RG ${formatKm(band.range)}`);
            // Not `.trim()` — a band's altitude is a number now, and a legacy string
            // still has to survive the same call. @see formatAltitude
            const altitude = band.altitude;
            // The band carries the number; the datum is the graphic's, since every band of one
            // fan is measured from the same thing.
            const written = formatAltitude(altitude, feature.properties.altitudeDatum);
            if (written) lines.push(`ALT ${written}`);
            if (lines.length) paints.push(text(coords[midIndex], lines.join('\n')));

            if (!isSector) continue;
            if (midIndex + 1 < coords.length && band.resolvedLeftAz !== undefined) {
                paints.push(text(coords[midIndex + 1], formatAzimuth(band.resolvedLeftAz)));
            }
            if (midIndex + 2 < coords.length && band.resolvedRightAz !== undefined) {
                paints.push(text(coords[midIndex + 2], formatAzimuth(band.resolvedRightAz)));
            }
        }

        return paints;
    };
}
