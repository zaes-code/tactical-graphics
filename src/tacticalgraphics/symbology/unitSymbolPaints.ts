/**
 * # The host's unit symbol on Search Area and the swept-arc tasks
 *
 * Four graphics whose plates draw a unit symbol (field A) the operator does not type: Search Area's
 * *"tactical symbol indicator is centred over point 1"*, the vertex, and Capture, Evacuate and
 * Recover's circle, *"adjusted as needed to contain the unit assigned the task"*, whose centre is
 * point 1. Like the security operations', the symbol is the host's (`resolveSecuritySymbol`): this
 * says only where it goes and how big, and the provider's answer is the picture.
 *
 * Neither graphic leaves a gap for it. Search Area's symbol sits on the vertex, over the arms,
 * as the Example draws it; the swept-arc tasks' sits inside the circle, which is what the circle
 * is for.
 */
import type {PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {getSecuritySymbolSize, MIN_SYMBOL_SIZE_PX, resolveSecuritySymbol, securitySymbolSidc, symbolGraphicId} from '../core/securitySymbol';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';
import type {GraphicLabels} from '../core/render';

/** Where a unit symbol goes and how big, and the provider's picture for it. */
export interface UnitSymbolPlacement {
    at: ProjectedPosition;
    sizePx: number;
    src: string;
}

/**
 * How much of the circle's radius the symbol's larger side takes. A land unit frame is about 1.5
 * times as wide as it is tall, so its corners reach 0.6 of its width from its centre: at 1.5 radii
 * wide they stay inside the circle with room for its line.
 */
const SYMBOL_SHARE_OF_RADIUS = 1.5;

/** The provider's picture at `at`, `wantedPx` across, or undefined when no provider gives one. */
function placed(feature: PaintFeature, context: PaintContext, at: ProjectedPosition, wantedPx: number): UnitSymbolPlacement | undefined {
    if (!(wantedPx >= MIN_SYMBOL_SIZE_PX)) return undefined;
    const hostility = (feature.properties.hostility as TacticalGraphicHostility) ?? TacticalGraphicHostility.pending;
    const image = resolveSecuritySymbol(
        {
            name: feature.properties.name as TacticalGraphicName,
            graphicId: symbolGraphicId(feature),
            hostility,
            sidc: securitySymbolSidc(hostility),
            sizePx: wantedPx,
            labels: feature.properties as unknown as GraphicLabels,
        },
        context.centerSymbolProvider,
    );
    if (!image) return undefined;
    return {at, sizePx: image.sizePx ?? wantedPx, src: image.src};
}

/** Search Area's symbol: on the vertex, where both arms start, at the center-symbol size. */
export function searchAreaSymbol(feature: PaintFeature, context: PaintContext): UnitSymbolPlacement | undefined {
    const g = feature.geometry;
    if (g.type !== 'MultiLineString' || !g.coordinates[0]?.length) return undefined;
    const apex = g.coordinates[0][0];
    return placed(feature, context, [apex[0], apex[1]], getSecuritySymbolSize());
}

/** Capture, Evacuate and Recover's symbol: in the middle of the circle, sized to stay inside it. */
export function sweptArcTaskSymbol(feature: PaintFeature, context: PaintContext): UnitSymbolPlacement | undefined {
    const g = feature.geometry;
    if (g.type !== 'MultiLineString') return undefined;
    // The circle is the first part, a closed ring: its centre is the mean of its points, the
    // closing repeat left out, and its radius their mean distance from it.
    const ring = g.coordinates[0] ?? [];
    const points = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    if (points.length < 3) return undefined;
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
    const radius = points.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / points.length;
    return placed(feature, context, [cx, cy], (SYMBOL_SHARE_OF_RADIUS * radius) / context.resolution);
}

/** The four graphics this module places a symbol on. */
export const UNIT_SYMBOL_GRAPHICS: ReadonlySet<TacticalGraphicName> = new Set([
    TacticalGraphicName.SearchArea,
    TacticalGraphicName.Capture,
    TacticalGraphicName.Evacuate,
    TacticalGraphicName.Recover,
]);
