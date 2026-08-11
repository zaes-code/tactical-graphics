/**
 * # The area graphics that draw something structural
 *
 * `areaOutlinePaint` covers 59 of the 75 area graphics with a plain stroke. These
 * are the rest: the ones whose *shape* carries meaning beyond the ring the user
 * drew — teeth, merlons, a hatch, a gap cut for a designation, an amplifier that
 * only appears when the graphic is hostile.
 *
 * Split out of `paintFunctions.ts` to keep that file readable, not because they
 * are different in kind. Everything here follows the same rules: planar Euclidean
 * math in EPSG:3857 metres, no DOM, screen sizes as `px × resolution`.
 */

import type {HatchSpec, Paint, PaintContext, PaintFeature} from '../core/paint';
import {paintGeometryMembers, paintLineWork} from '../core/paint';
import {LINE_WIDTH, fontStyle, getColorByHostility, getLabelFillColor, withOpacity} from '../core/symbology';
import {TacticalGraphicHostility, TacticalGraphicStatus} from '../core/type';
import {crenellatedPath, encirclementToothSize, fortifiedRing, obstacleRing, ringIsClockwise, textWidth} from './decorations';
import {PLANNED_DASH_PX, hostilityOf, lineColorOf, scaleOf} from './paintFunctions';

/** A paint function, in the shape the registry stores. */
type AreaPaint = (feature: PaintFeature, context: PaintContext) => Paint[];

/**
 * The translucent diagonal hatch the restricted and limited-access areas are
 * filled with.
 *
 * A **symbology** fact rather than a rendering one — FM 1-02.2 draws these areas
 * hatched — so it is described here as parameters and realised by whichever
 * renderer is drawing. A canvas builds a `CanvasPattern`; MapLibre registers a
 * `fill-pattern` image. @see HatchSpec
 */
function hatch(color: string, sizePx: number, lineWidthPx: number): HatchSpec {
    return {kind: 'diagonal', color: withOpacity(color, 0.25), sizePx, lineWidthPx};
}

/** The dash a graphic takes when its status is `planned`, or nothing. */
function plannedDash(feature: PaintFeature): number[] | undefined {
    return feature.properties.status === TacticalGraphicStatus.planned ? PLANNED_DASH_PX : undefined;
}

/**
 * A feature's geometry as something strokeable — collections flattened to their
 * line work. Several area generators emit a collection of outline plus label
 * anchors, and only the outline is drawn.
 */
function strokeableGeometry(feature: PaintFeature): Paint['geometry'] {
    if (feature.geometry.type !== 'GeometryCollection') return feature.geometry;
    return {type: 'MultiLineString', coordinates: paintLineWork(feature.geometry)};
}

/**
 * The obstacle areas: belt, group and zone wear their teeth **outward**, the free
 * and restricted areas **inward**, and the restricted area alone carries a hatch.
 *
 * The geometry is the plain drawn ring — the crenellation is added here, in screen
 * pixels, so it holds its size at every zoom and shrinks against the shape rather
 * than against the resolution. @see obstacleRing for why "outward" is measured
 * from the ring's winding rather than taken from the drawing order.
 */
export function obstacleAreaPaint(options: {outward: boolean; hatched?: boolean}): AreaPaint {
    return (feature, context) => {
        if (feature.geometry.type !== 'Polygon') return [];
        const color = lineColorOf(feature);
        const toothed = feature.geometry.coordinates.map(ring => obstacleRing(ring, context.resolution, options.outward));

        return [{
            geometry: {type: 'Polygon', coordinates: toothed},
            stroke: {color, widthPx: LINE_WIDTH()},
            fill: options.hatched ? {color: withOpacity(color, 0.25), pattern: hatch(color, 8, 1)} : undefined,
        }];
    };
}

/**
 * The fortified area: square merlons standing outward off the drawn ring, in
 * screen pixels. Same reasoning and the same winding correction as the obstacle
 * teeth.
 */
export function fortifiedAreaPaint(): AreaPaint {
    return (feature, context) => {
        if (feature.geometry.type !== 'Polygon') return [];
        return [{
            geometry: {
                type: 'Polygon',
                coordinates: feature.geometry.coordinates.map(ring => fortifiedRing(ring, context.resolution)),
            },
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        }];
    };
}

/**
 * The limited-access family — limited access area, the three no-fire areas, and
 * the weapons-free zone. A hatched fill under an outline that dashes when planned.
 *
 * **The hatch is deliberately neutral, not the affiliation colour.** It reads as a
 * texture saying "you may not fire here" rather than as line work identifying a
 * side, so it is built from the unaffiliated default whatever the graphic's
 * hostility. The outline still carries the affiliation.
 */
export function limitedAccessAreaPaint(): AreaPaint {
    return feature => {
        const neutral = getColorByHostility(TacticalGraphicHostility.unknown);
        return [{
            geometry: fillableGeometry(feature),
            fill: {color: withOpacity(neutral, 0.25), pattern: hatch(neutral, 16, 2)},
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: plannedDash(feature)},
        }];
    };
}

/**
 * A feature's geometry as something that can be **filled**, closing open line work
 * into a polygon.
 *
 * `CircularArea` emits its outline as a `MultiLineString` — a ring with no
 * declared interior — so a hatch applied to it has nothing to fill and the circle
 * comes out empty. Closing it here rather than in a renderer is what keeps
 * OpenLayers and MapLibre identical: the OpenLayers holder used to do this
 * coercion itself, which meant the fix existed for one renderer only.
 *
 * Rings shorter than three points are left alone — there is no area to fill and a
 * degenerate polygon renders worse than a line.
 */
function fillableGeometry(feature: PaintFeature): Paint['geometry'] {
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') return geometry;

    const rings = geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : geometry.type === 'GeometryCollection'
            ? paintLineWork(geometry)
            : geometry.type === 'LineString'
                ? [geometry.coordinates]
                : [];

    const closed = rings.filter(ring => ring.length >= 3);
    return closed.length ? {type: 'Polygon', coordinates: closed} : strokeableGeometry(feature);
}

/**
 * Group or series of targets: the drawn ring, with a gap cut in its **topmost**
 * segment for the designation.
 *
 * "Topmost" is the segment with the highest midpoint northing — not the first, not
 * the longest — so the label lands at the top of the shape wherever the user
 * started clicking. The gap is sized to the rendered glyph plus 6 px and is only
 * cut when the segment is long enough to survive it; a short top edge keeps its
 * line and lets the label overhang, which reads better than a ring with a bite
 * out of one whole side.
 */
export function groupOrSeriesOfTargetsPaint(): AreaPaint {
    return (feature, context) => {
        if (feature.geometry.type !== 'Polygon') return [];
        const ring = feature.geometry.coordinates[0];
        if (!ring || ring.length < 2) return [];

        const stroke = {color: lineColorOf(feature), widthPx: LINE_WIDTH(), dashPx: plannedDash(feature)};

        let bestIdx = 0;
        let bestMidY = -Infinity;
        for (let i = 0; i < ring.length - 1; i++) {
            const midY = (ring[i][1] + ring[i + 1][1]) / 2;
            if (midY > bestMidY) {
                bestMidY = midY;
                bestIdx = i;
            }
        }

        const text = (feature.properties.label ?? '').trim();
        const scale = scaleOf(feature, context);
        const gapHalfMap = text ? (textWidth(context, text, fontStyle, scale) / 2 + 6) * context.resolution : 0;

        const paints: Paint[] = [];
        for (let i = 0; i < ring.length - 1; i++) {
            const a = ring[i];
            const b = ring[i + 1];

            if (i === bestIdx && gapHalfMap > 0) {
                const dx = b[0] - a[0];
                const dy = b[1] - a[1];
                const segLen = Math.hypot(dx, dy);
                if (segLen > 2 * gapHalfMap) {
                    const ux = dx / segLen;
                    const uy = dy / segLen;
                    const mx = (a[0] + b[0]) / 2;
                    const my = (a[1] + b[1]) / 2;
                    paints.push({
                        geometry: {type: 'LineString', coordinates: [a, [mx - ux * gapHalfMap, my - uy * gapHalfMap]]},
                        stroke,
                    });
                    paints.push({
                        geometry: {type: 'LineString', coordinates: [[mx + ux * gapHalfMap, my + uy * gapHalfMap], b]},
                        stroke,
                    });
                    continue;
                }
            }
            paints.push({geometry: {type: 'LineString', coordinates: [a, b]}, stroke});
        }
        return paints;
    };
}

/**
 * Encirclement: the drawn outline worn with outward teeth, plus an "ENY" amplifier
 * at each label anchor — the amplifiers **only when the graphic is hostile**.
 *
 * The one area graphic whose *form* changes with affiliation rather than only its
 * colour, which is why it cannot fall through to `areaOutlinePaint`.
 *
 * **The teeth are drawn here, in screen pixels, not baked by the generator** — the
 * same split the obstacle belt and the fortified area already use, and for the same
 * reason. A baked tooth is a ground distance fixed at the resolution the graphic was
 * drawn at, so it grew and shrank with the map while every other toothed graphic on
 * the same screen held its size, and it had no floor to fall through: zoomed out far
 * enough the outline became a band of sub-pixel noise instead of a line.
 * `encirclementToothSize` caps it against the ring's own on-screen size and drops it
 * below `DECORATION_MIN_PX`.
 *
 * Outward is taken from the ring's winding rather than from drawing order, so a ring
 * drawn anticlockwise does not come out with its teeth on the inside.
 *
 * The "ENY" stays in the label colour. Hostile line work goes red; hostile text
 * amplifiers do not — see the hostility colour rule in `ai/decisions.md`.
 */
export function encirclementPaint(): AreaPaint {
    return (feature, context) => {
        const paths = paintLineWork(feature.geometry);
        // One ring's worth of points, whether the outline arrived whole or already cut
        // into segments — both the winding and the tooth size belong to the ring, not
        // to whichever piece of it is being walked.
        const ring = paths.flat();
        const {heightMap, baseMap, gapMap} = encirclementToothSize(ring, context.resolution);
        const sideSign = ringIsClockwise(ring) ? 1 : -1;

        const paints: Paint[] = [{
            geometry: {
                type: 'MultiLineString',
                coordinates: paths.map(path => crenellatedPath(path, heightMap, baseMap, gapMap, sideSign)),
            },
            stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
        }];

        if (hostilityOf(feature) !== TacticalGraphicHostility.hostileFaker) return paints;

        for (const member of paintGeometryMembers(feature.geometry)) {
            if (member.type !== 'MultiPoint') continue;
            paints.push({
                geometry: member,
                text: {
                    text: 'ENY',
                    font: fontStyle,
                    fill: getLabelFillColor(),
                    scale: scaleOf(feature, context),
                    placement: 'point',
                },
            });
        }
        return paints;
    };
}

/**
 * The four circular areas that dash and hatch when planned: free fire, restrictive
 * fire, position area for artillery, and the circular airspace-coordination area.
 *
 * The hatch is the *hostility* colour rather than the line colour, so an unknown
 * or pending area still washes in its own tint — the same choice
 * {@link limitedAccessAreaPaint} makes, and the reason both take it from
 * `hostilityOf` rather than reusing the stroke.
 */
export function freeFireAreaCircularPaint(): AreaPaint {
    return feature => {
        const isPlanned = feature.properties.status === TacticalGraphicStatus.planned;
        const color = lineColorOf(feature);
        return [{
            geometry: strokeableGeometry(feature),
            fill: isPlanned
                ? {color: withOpacity(getColorByHostility(hostilityOf(feature)), 0.25), pattern: hatch(getColorByHostility(hostilityOf(feature)), 8, 1)}
                : undefined,
            stroke: {color, widthPx: LINE_WIDTH(), dashPx: isPlanned ? PLANNED_DASH_PX : undefined},
        }];
    };
}

/**
 * A bare outline in the affiliation's colour — **no planned dash**.
 *
 * What a holder that installs no style of its own gets, which is most of the
 * circular areas. Distinct from {@link areaOutlinePaint} precisely in the dash:
 * these graphics never took one, and adding it here would be a silent change to
 * thirteen symbols rather than a port.
 */
export function plainOutlinePaint(): AreaPaint {
    return feature => [{
        geometry: strokeableGeometry(feature),
        stroke: {color: lineColorOf(feature), widthPx: LINE_WIDTH()},
    }];
}
