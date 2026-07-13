import {Map, View} from 'ol';
import TileLayer from 'ol/layer/Tile';
import Feature, {FeatureLike} from 'ol/Feature';
import {Fill, Icon, Stroke, Style, Text} from 'ol/style';
import CircleStyle from 'ol/style/Circle';
import {Circle, Geometry, GeometryCollection, LineString, MultiLineString, MultiPoint, Point, Polygon} from 'ol/geom';
import {Coordinate} from 'ol/coordinate';
import {defaults, ScaleLine} from 'ol/control';
import {StyleFunction} from 'ol/style/Style';
import {geometryService} from '@zaes-code/tactical-graphics';
import {
    getLabel,
    RouteDirection,
    TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicName,
    TacticalGraphicStatus,
} from '@zaes-code/tactical-graphics';
import one_way_arrow from './assets/route_direction_one_way.svg';
import alternating_arrow from './assets/route_direction_alternating.svg';
import two_way_arrow from './assets/route_direction_two_way.svg';
import {GraphicLabels} from '../../utils/graphicLinkRegistry';
import {readGraphicLabels} from './graphicProperties';
import {svgToOpenLayersGeometry} from '../../utils/svgToGeoJson';
import {Position} from 'geojson';
import {BASE_FONT_SIZE_PX, getDefaultLabelSize, isDarkMode} from '../../settings';
import {OSM} from 'ol/source';
import {isEmpty} from '../../utils/isEmpty';

const canvas = document.createElement('canvas');
const textMeasureCtx = canvas.getContext('2d')!;
const centerCoordinates = [0, 0];
const TEXT_RESOLUTION_FALLBACK = 3000; // used as fallback when drawingResolution is not stored
export const fontStyle = `bold ${BASE_FONT_SIZE_PX}px sans-serif`;

/**
 * Default stroke width (in screen pixels) for every graphic's lines:
 * phase-lines, area outlines, arrows, and custom-rendered graphics all
 * use this width. Change this single constant to re-weight the whole
 * library.
 */
export const LINE_WIDTH = 4;

/** Text-halo stroke width — independent of LINE_WIDTH by design. */
const HALO_WIDTH = 4;

/** Default stroke/fill color for graphics with no specific hostility color. White in dark mode, black in light. */
export function getDefaultLineColor(): string {
    return isDarkMode() ? '#000000' : '#000000';
}

/** Text label fill color. */
export function getLabelFillColor(): string {
    return isDarkMode() ? '#000000' : '#000000';
}

/** Text label halo (outline) color — contrast against the map background. */
export function getLabelHaloColor(): string {
    // Use transparent halo for now.
    return isDarkMode() ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,1)';
    // return isDarkMode() ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0)';
}

/** Solid map-background fill for label backgrounds (blocks pattern fills behind text). */
export function getLabelBackgroundFill(): string {
    return isDarkMode() ? 'rgba(22, 27, 34, 0.90)' : 'rgba(255, 255, 255, 0.90)';
}

/* Halo used for the label background. */
const haloStroke = new Stroke({color: getLabelHaloColor(), width: HALO_WIDTH});

/**
 * Unified label scale for all graphics.
 * - Uses drawingResolution stored on the feature (set at creation time) to anchor the
 *   label size: at drawing zoom the text is exactly defaultLabelSize px; when zoomed
 *   out (higher resolution) the label shrinks proportionally.
 * - Falls back to a sqrt curve when drawingResolution is not available.
 */
export function featureLabelScale(feature: FeatureLike, resolution: number): number {
    const drawRes = feature.get('drawingResolution') as number | undefined;
    const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
    if (drawRes && drawRes > 0) {
        return sizeFactor * (drawRes / resolution);
    }
    return sizeFactor * Math.max(0.3, Math.sqrt(TEXT_RESOLUTION_FALLBACK / resolution));
}

/**
 * Label scale proportional to the graphic's perpendicular size on screen.
 * Falls back to `featureLabelScale` for features that do not stamp `graphicSize`.
 *
 * Formula: `scale = sizeFactor × K × (graphicSizePx / BASE_FONT_SIZE_PX)`.
 * - `graphicSizePx = graphicSize / resolution`, so the label grows with both
 *   user resize (graphicSize map units) and zoom-in (resolution shrinks).
 * - `K` keeps the rendered label well under the graphic's perpendicular extent.
 */
const GRAPHIC_LABEL_FRACTION = 0.5;
export function featureGraphicLabelScale(feature: FeatureLike, resolution: number): number {
    const graphicSize = feature.get('graphicSize') as number | undefined;
    if (graphicSize && graphicSize > 0) {
        const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        const graphicSizePx = graphicSize / resolution;
        return sizeFactor * GRAPHIC_LABEL_FRACTION * graphicSizePx / BASE_FONT_SIZE_PX;
    }
    return featureLabelScale(feature, resolution);
}

export const createMap = (target: HTMLElement) => {
    let controls = defaults({zoom: false}).extend([
        new ScaleLine({
            units: 'metric',
        }),
    ]);
    return new Map({
        controls: controls,
        target: target,
        layers: [
            new TileLayer({
                properties: {name: 'darkBaseMap'},
                source: new OSM({wrapX: false}),
                visible: true,
            }),
            new TileLayer({
                properties: {name: 'lightBaseMap'},
                source: new OSM({wrapX: false}),
                className: '-',
                visible: false,
            }),
        ],
        view: new View({
            center: centerCoordinates,
            zoom: 4,
            extent: [                // ← This is the key
                -20037508.34, -20037508.34,   // left, bottom  (approx. full world in Web Mercator)
                20037508.34, 20037508.34,    // right, top
            ],
        }),
    });
};

export const modifyStyle = (color: string) => {
    return new Style({
        fill: undefined,
        stroke: new Stroke({
            color: color,
            width: LINE_WIDTH,
            lineDash: [4, 4],
        }),
    });
};

function setOpacity(rgba: string, opacity: number): string {
    return rgba.replace(/rgba?\(([^)]+)\)/, (_, values) => {
        const parts = values.split(',').map((v: string) => v.trim());
        parts[3] = opacity.toString(); // replace or add alpha value
        return `rgba(${parts.join(', ')})`;
    });
}

// used as the underlying geometry for each tactical graphic. Users can update this with the Modify interaction.
export const createBaseFeature = () => {
    let feature = new Feature();
    feature.setStyle((feature) => {
        let isHidden = feature.get('hidden');

        if (isHidden) return new Style({});
        const hostility = feature.get('hostility');
        const color = hostility ? getColorByHostility(hostility) : getDefaultLineColor();
        return modifyStyle(setOpacity(color, .35));
    });

    feature.set('base', true);
    feature.set('hidden', true);
    return feature;
};

// used for adding markers to a tactical graphics to let a user know where they can drag the graphic to modify
export const createHandleFeature = () => {
    let feature = new Feature();

    feature.setStyle((feature) => {
        let isHidden = feature.get('hidden');

        if (isHidden) return new Style({});

        const hostility = feature.get('hostility');
        const color = hostility ? getColorByHostility(hostility) : 'rgba(255,0,0,1)';
        return new Style({
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({
                    color: setOpacity(color, .8),
                }),
            }),
        });
    });
    feature.set('handle', true);
    feature.set('hidden', true);

    return feature;
};

// used to adjust the width of graphics such as Movement graphics (adjusting the road size)
export const createOffsetHandleFeature = () => {
    let feature = createHandleFeature();
    feature.set('offsetHandler', true);
    return feature;
};

export const createFeature = () => {
    let feature = new Feature();

    feature.setStyle(() => new Style({
        fill: new Fill({
            color: 'rgba(0, 120, 255, 0.2)',
        }),
        stroke: new Stroke({
            color: getDefaultLineColor(),
            width: LINE_WIDTH,
        }),
        image: new CircleStyle({
            radius: 5,
            fill: new Fill({
                color: 'rgba(255, 0, 0, 0.8)',
            }),
        }),
    }));

    return feature;
};

const ACP_RADIUS_PX = 12; // 👈 match your rendered circle size
const ACP_DIAMETER_PX = ACP_RADIUS_PX * 0.95;
const PADDING = 4;

function getFittedScale(
    text: string,
    font: string,
    baseScale: number,
): number {
    const textWidthAt1 = getTextWidth(text, font, 1);
    const radiusPx = ACP_DIAMETER_PX * baseScale;
    const diameterPx = radiusPx * 2.5;
    const maxWidth = diameterPx - PADDING;
    const fitScale = maxWidth / textWidthAt1;
    return Math.min(baseScale, fitScale);
}

export function airCoordinatingCorridorStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => airCoordinatingCorridorStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function airCoordinatingCorridorStyleFromLabels(name: TacticalGraphicName, graphicLabel: GraphicLabels): StyleFunction {
    return (feature, resolution) => {
        const geometry = feature.getGeometry() as MultiPoint;
        const styles: Style[] = [];
        const coords = geometry.getCoordinates();
        const label = getFullLabel(name, graphicLabel.label ?? '');
        const baseScale = featureLabelScale(feature, resolution);

        // 🟡 Pull hostility color dynamically
        const color = feature.get('hostilityColor') || getDefaultLineColor();

        // ── Properties info block (above the graphic, upper-left) ──────────────
        const infoLines: string[] = [];
        const corridorName = graphicLabel.label?.trim();
        if (corridorName)               infoLines.push(`NAME:       ${corridorName}`);
        if (graphicLabel.width)         infoLines.push(`WIDTH:      ${graphicLabel.width}`);
        if (graphicLabel.minAltitude)   infoLines.push(`MIN ALT:    ${graphicLabel.minAltitude}`);
        if (graphicLabel.maxAltitude)   infoLines.push(`MAX ALT:    ${graphicLabel.maxAltitude}`);
        if (graphicLabel.startDate)     infoLines.push(`DTG START:  ${graphicLabel.startDate}`);
        if (graphicLabel.endDate)       infoLines.push(`DTG END:    ${graphicLabel.endDate}`);

        if (infoLines.length > 0) {
            // Anchor at the NW corner of the ACP bounding box (minX, maxY)
            let minX = Infinity, maxY = -Infinity;
            for (const [x, y] of coords) {
                if (x < minX) minX = x;
                if (y > maxY) maxY = y;
            }
            // Scale the pixel gap with baseScale so clearance stays proportional
            // to both the text size and the corridor circles at every zoom level.
            styles.push(new Style({
                geometry: new Point([minX, maxY]),
                text: new Text({
                    text: infoLines.join('\n'),
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    textAlign: 'left',
                    textBaseline: 'bottom',
                    offsetY: -60 * baseScale,
                    scale: baseScale,
                }),
            }));
        }

        for (let i = 0; i < coords.length - 1; i++) {

            const labelText = `ACP ${i + 1}`;
            const fittedScale = getFittedScale(labelText, fontStyle, baseScale);

            const [x0, y0] = coords[i];
            const [x1, y1] = coords[i + 1];
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            styles.push(new Style({
                geometry: new Point([(x0 + x1) / 2, (y0 + y1) / 2]),
                text: new Text({
                    text: label,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: featureLabelScale(feature, resolution),
                }),
            }));
            styles.push(
                new Style({
                    geometry: new Point(coords[i]),
                    stroke: new Stroke({
                        color,
                        width: LINE_WIDTH,
                    }),
                    text: new Text({
                        text: labelText,
                        font: fontStyle,
                        fill: new Fill({color}),
                        scale: fittedScale,
                        stroke: haloStroke,
                        textAlign: 'center',
                        textBaseline: 'middle',
                    }),
                }),
            );
        }
        // add the last node in the corridor
        const fittedScale = getFittedScale(`ACP ${coords.length}`, fontStyle, baseScale);
        styles.push(
            new Style({
                geometry: new Point(coords[coords.length - 1]),
                stroke: new Stroke({
                    color,
                    width: LINE_WIDTH,
                }),
                text: new Text({
                    text: `ACP ${coords.length}`,
                    font: fontStyle,
                    fill: new Fill({color}),
                    scale: fittedScale,
                    stroke: haloStroke,
                    textAlign: 'center',
                    textBaseline: 'middle',
                }),
            }),
        );
        return styles;
    };
}

export const airCorridorCircleStyleFunc = (feature: FeatureLike) => {
    const geometry = feature.getGeometry();
    const color = feature.get('hostilityColor') || getDefaultLineColor();
    const styles: Style[] = [];

    if (geometry instanceof GeometryCollection) {
        geometry.getGeometries().forEach(geom => {
            if (geom instanceof Circle || geom instanceof Polygon) {
                styles.push(
                    new Style({
                        geometry: geom,
                        stroke: new Stroke({color, width: LINE_WIDTH}),
                        fill: undefined,
                    }),
                );
            } else if (geom instanceof MultiLineString) {
                styles.push(
                    new Style({
                        geometry: geom,
                        stroke: new Stroke({
                            color: color,
                            width: LINE_WIDTH,
                        }),
                        fill: undefined,
                    }),
                );
            }
        });
    }
    return styles;
};

function createRotatedLabel(start: Coordinate, stop: Coordinate, labelPoint: Coordinate, resolution: number, label: string, scaleMultiplier = 1, feature?: FeatureLike): Style {
    const [x1, y1] = start;
    const [x2, y2] = stop;

    // Segment angle
    const dx = x2 - x1;
    const dy = y2 - y1;
    let rotation = -Math.atan2(dy, dx);

    // Keep text upright
    if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
        rotation += Math.PI;
    }

    const scale = feature
        ? featureLabelScale(feature, resolution) * scaleMultiplier
        : (getDefaultLabelSize() / BASE_FONT_SIZE_PX) * Math.max(0.3, Math.sqrt(TEXT_RESOLUTION_FALLBACK / resolution)) * scaleMultiplier;

    return new Style({
        geometry: new Point(labelPoint), // dummy point
        text: new Text({
            text: label,
            font: fontStyle,
            fill: new Fill({color: getLabelFillColor()}),
            rotation: rotation,
            textAlign: 'center',
            textBaseline: 'middle',
            scale,
            stroke: haloStroke,
        }),
    });
}

function createRotatedLabelAtMidpoint(start: Coordinate, stop: Coordinate, resolution: number, label: string, scaleMultiplier = 1, feature?: FeatureLike): Style {
    const [midX, midY] = geometryService.getMidpoint(start, stop);
    return createRotatedLabel(start, stop, [midX, midY], resolution, label, scaleMultiplier, feature);
}

export const phaseLineStyle = (feature: FeatureLike, resolution: number, labelText: string) => {
    let featureGeometry = feature.getGeometry();
    const coords = (featureGeometry as LineString).getCoordinates();
    if (coords.length < 2) return []; // need at least 2 pts

    const hostilityColor = feature.get('hostilityColor') || getDefaultLineColor();
    if (hostilityColor === getColorByHostility(TacticalGraphicHostility.hostileFaker)) {
        labelText = `ENY ${labelText}`;
    }

    /* ---------- end‑points & direction vectors ---------- */
    const start = coords[0];
    const startNext = coords[1];
    const end = coords[coords.length - 1];
    const endPrev = coords[coords.length - 2];

    function vecAngle(p: number[], q: number[]) {
        return Math.atan2(q[1] - p[1], q[0] - p[0]); // map‑space angle (CCW+)
    }

    const aStart = vecAngle(start, startNext);
    const aEnd = vecAngle(endPrev, end);

    /* ---------- convert to screen rotation (CW+) ---------- */
    function toScreen(angle: number) {
        let rot = -angle; // flip y‑axis
        // keep text upright
        if (rot > Math.PI / 2 || rot < -Math.PI / 2) rot += Math.PI;
        return rot;
    }

    const rotStart = toScreen(aStart);
    const rotEnd = toScreen(aEnd);

    /* ---------- stroke ---------- */
    const lineStroke = new Stroke({
        color: hostilityColor,
        width: LINE_WIDTH,
        lineCap: 'butt',
        lineJoin: 'round',
    });

    /* ---------- label builders ---------- */
    const scale = featureLabelScale(feature, resolution);
    const GAP_PX = 8;
    const textWidth = getTextWidth(labelText, fontStyle, scale);

    // Determine which screen-x side is "outside" each endpoint.
    // offsetX is in screen pixels and is NOT rotated with the text, so we must check
    // the actual x-component of each segment to avoid placing the label through the line
    // when the "keep upright" flip makes the rotation appear the same for both directions.
    const startOutsideRight = (start[0] - startNext[0]) >= 0;
    const endOutsideRight   = (end[0]   - endPrev[0])   >= 0;

    return [
        new Style({stroke: lineStroke}),

        // START LABEL — sits outside the start endpoint along the line direction
        new Style({
            geometry: new Point(start),
            text: new Text({
                text: labelText,
                font: fontStyle,
                rotation: rotStart,
                textAlign: 'left',
                textBaseline: 'middle',
                offsetX: startOutsideRight ? GAP_PX : -GAP_PX - textWidth,
                stroke: haloStroke,
                fill: new Fill({color: getLabelFillColor()}),
                scale: scale,
            }),
        }),

        // END LABEL — sits outside the end endpoint along the line direction
        new Style({
            geometry: new Point(end),
            text: new Text({
                text: labelText,
                font: fontStyle,
                rotation: rotEnd,
                rotateWithView: false,
                textAlign: 'right',
                textBaseline: 'middle',
                offsetX: endOutsideRight ? GAP_PX + textWidth : -GAP_PX,
                stroke: haloStroke,
                fill: new Fill({color: getLabelFillColor()}),
                scale: scale,
            }),
        }),
    ];
};

/**
 * Feature-reading wrapper over {@link phaseLineStyle}, which takes an
 * already-formatted label string. Every graphic routed through
 * `phaseLineStyle` shares this entry point.
 */
export function phaseLineStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (feature, resolution) =>
        phaseLineStyle(feature, resolution, getFullLabel(name, readGraphicLabels(feature).label ?? ''));
}

export function bridgeGraphicStyleFunc(): StyleFunction {
    return (f, resolution) => bridgeGraphicStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function bridgeGraphicStyleFromLabels(graphicLabels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();
        let styles: Style[] = [];
        const [x1, y1] = coords[0];
        const [x2, y2] = coords[1];

        const dx = x2 - x1;
        const dy = y2 - y1;
        let rotation = -Math.atan2(dy, dx);

        // Keep main label upright.
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }

        const labelScale = featureLabelScale(f, resolution);

        // Main label — at bridge midpoint (coords[0]), along the bridge axis.
        styles.push(new Style({
            geometry: new Point(coords[0]),
            text: new Text({
                text: graphicLabels.label ?? '',
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                textAlign: 'center',
                textBaseline: 'middle',
                rotation,
                scale: labelScale,
                stroke: haloStroke,
            }),
        }));

        // Date label — coords[1] is pre-placed by generateLabels beyond the bridge end
        // along the bridge axis.  Always render horizontal (rotation: 0).
        // Use directional textAlign so the text extends AWAY from the bridge rather
        // than being centered back over it.
        const dateText = getDateLabel(graphicLabels);
        if (dateText) {
            // Bridge is "more horizontal" when |dx| >= |dy|.
            // For horizontal bridges coords[1] is to the side of the end — align text
            // so it starts/ends at coords[1] and runs away from the bridge.
            // For vertical bridges coords[1] is above/below the end — center is fine
            // because the horizontal text doesn't extend back along the bridge axis.
            const dateTextAlign: CanvasTextAlign =
                Math.abs(dx) >= Math.abs(dy)
                    ? (dx > 0 ? 'left' : 'right')
                    : 'center';

            // push date label further away from bridge along its axis
            const len = Math.hypot(dx, dy);
            const ux = dx / len;
            const uy = dy / len;

            // distance in pixels → convert to map units
            const EXTRA_GAP_PX = 12; // 👈 increase this to move further away
            const extraGapMap = EXTRA_GAP_PX * resolution;

            const dateCoord: Coordinate = [
                coords[1][0] + ux * extraGapMap,
                coords[1][1] + uy * extraGapMap,
            ];

            styles.push(new Style({
                geometry: new Point(dateCoord),
                text: new Text({
                    text: dateText,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    textAlign: dateTextAlign,
                    textBaseline: 'middle',
                    rotation: 0,
                    scale: labelScale,
                    stroke: haloStroke,
                }),
            }));
        }

        return styles;
    };
}

export function passageLaneGraphicStyle(): StyleFunction {
    return (f, resolution) => passageLaneGraphicStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function passageLaneGraphicStyleFromLabels(graphicLabels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates()[1];
        let styles: Style[] = [];
        const [x1, y1] = coords[0];
        const [x2, y2] = coords[1];

        // Segment angle
        const dx = x2 - x1;
        const dy = y2 - y1;
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }

        const spanPx = Math.sqrt(dx * dx + dy * dy) / resolution;
        const scale = (spanPx * 0.7) / 24;
        let labelCoord = offsetCoordinatesInLine(coords[0], coords[1], resolution);

        styles.push(new Style({
            geometry: new Point(labelCoord),
            text: new Text({
                text: getDateLabel(graphicLabels),
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                textAlign: 'center',
                textBaseline: 'middle',
                rotation: rotation + Math.PI / 2,
                scale,
                stroke: haloStroke,
            }),
        }));
        let hostility = f.get('hostility');
        const outlineStyle = new Style({
            geometry: geom,
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
        });
        styles.push(outlineStyle);
        return styles;
    };
}

/**
 * Graphic StyleFunction for the Infiltration line feature.
 * Recomputes the gap around the "IN" label on every render using the live
 * resolution, keeping the gap constant in screen pixels regardless of zoom.
 *
 * NOTE: OL geometry is in EPSG:3857 (projected metres), so gap math must use
 * plain Euclidean vectors — NOT turf/GeometryService geographic helpers.
 */
export function infiltrationGraphicStyleFunc(): StyleFunction {
    return (feature, resolution) => {
        const lineStroke = new Stroke({color: getDefaultLineColor(), width: LINE_WIDTH});
        const geom = feature.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates();
        if (!coords || coords.length < 2) return [];

        const lineCoords = coords[0];   // base line (EPSG:3857)
        const arrowCoords = coords[1];  // arrowhead [leftWing, tip, rightWing]

        // Label center is at 25% of the first segment (matches generateLabels logic).
        const [x0, y0] = lineCoords[0];
        const [x1, y1] = lineCoords[1];
        const lcx = x0 + (x1 - x0) * 0.25;
        const lcy = y0 + (y1 - y0) * 0.25;

        // Unit vector along the segment.
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return [];
        const ux = dx / len;
        const uy = dy / len;

        // Gap proportional to arrowhead wing-to-wing span + 5px fixed (like Penetration).
        const [awx0, awy0] = arrowCoords[0]; // leftWing
        const [awx1, awy1] = arrowCoords[2]; // rightWing
        const ww = Math.sqrt((awx1 - awx0) ** 2 + (awy1 - awy0) ** 2);
        const gapHalf = ww * 0.35 + 5 * resolution;
        const gapStart: Coordinate = [lcx - ux * gapHalf, lcy - uy * gapHalf];
        const gapEnd: Coordinate = [lcx + ux * gapHalf, lcy + uy * gapHalf];

        return [
            new Style({geometry: new LineString([lineCoords[0], gapStart]), stroke: lineStroke}),
            new Style({geometry: new LineString([gapEnd, ...lineCoords.slice(1)]), stroke: lineStroke}),
            new Style({geometry: new LineString(arrowCoords), stroke: lineStroke}),
        ];
    };
}

/**
 * Graphic StyleFunction for the Envelopment line feature.
 * Renders: straight part with zoom-invariant gap around "E" label, arc, open arrowhead.
 */
// MobileDefense: multi-line-string geometry where triangle rings (closed 4-point
// sub-arrays) are rendered as filled polygons and every other sub-array is a
// stroked line (arcs, arrow shaft, arrow head).
export function mobileDefenseGraphicStyleFunc(): StyleFunction {
    return (feature) => {
        const lineStroke = new Stroke({color: getDefaultLineColor(), width: LINE_WIDTH});
        const fill = new Fill({color: getDefaultLineColor()});
        const geom = feature.getGeometry() as MultiLineString;
        if (!geom) return [];
        const coords = geom.getCoordinates();
        const styles: Style[] = [];
        for (const ring of coords) {
            if (ring.length === 4
                && ring[0][0] === ring[ring.length - 1][0]
                && ring[0][1] === ring[ring.length - 1][1]) {
                styles.push(new Style({geometry: new Polygon([ring]), fill, stroke: lineStroke}));
            } else {
                styles.push(new Style({geometry: new LineString(ring), stroke: lineStroke}));
            }
        }
        return styles;
    };
}

export function envelopmentGraphicStyleFunc(): StyleFunction {
    return (feature, resolution) => {
        const lineStroke = new Stroke({color: getDefaultLineColor(), width: LINE_WIDTH});
        const geom = feature.getGeometry() as MultiLineString;
        if (!geom) return [];
        const coords = geom.getCoordinates();
        if (!coords || coords.length < 3) return [];

        const lineCoords = coords[0];  // straight part
        const arcCoords = coords[1];  // semicircular arc
        const arrowCoords = coords[2]; // open arrowhead

        // Gap around "E" label at 25% of first segment — same logic as Infiltration.
        const [x0, y0] = lineCoords[0];
        const [x1, y1] = lineCoords[1];
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);

        // Degenerate straight part (during drawing with only 2 base points) — render arc + arrow only.
        if (len === 0) {
            return [
                new Style({geometry: new LineString(arcCoords), stroke: lineStroke}),
                new Style({geometry: new LineString(arrowCoords), stroke: lineStroke}),
            ];
        }

        const lcx = x0 + (x1 - x0) * 0.25;
        const lcy = y0 + (y1 - y0) * 0.25;
        const ux = dx / len, uy = dy / len;
        // Gap proportional to arrowhead wing-to-wing span + 5px fixed (same as Infiltration).
        const [awx0, awy0] = arrowCoords[0]; // leftWing
        const [awx1, awy1] = arrowCoords[2]; // rightWing
        const ww = Math.sqrt((awx1 - awx0) ** 2 + (awy1 - awy0) ** 2);
        const gapHalf = ww * 0.35 + 5 * resolution;
        const gapStart: Coordinate = [lcx - ux * gapHalf, lcy - uy * gapHalf];
        const gapEnd: Coordinate = [lcx + ux * gapHalf, lcy + uy * gapHalf];

        return [
            new Style({geometry: new LineString([lineCoords[0], gapStart]), stroke: lineStroke}),
            new Style({geometry: new LineString([gapEnd, ...lineCoords.slice(1)]), stroke: lineStroke}),
            new Style({geometry: new LineString(arcCoords), stroke: lineStroke}),
            new Style({geometry: new LineString(arrowCoords), stroke: lineStroke}),
        ];
    };
}

/**
 * Render a label whose font size tracks the graphic's size in screen pixels.
 * coords[0]→coords[1] defines both the label position (midpoint) and the span
 * used to derive scale — so the label stays proportional at every zoom level.
 * Font is declared at 24px; scale = (spanPx * 0.7) / 24.
 */
function graphicProportionalLabel(c0: Coordinate, c1: Coordinate, resolution: number, text: string, textAlign: CanvasTextAlign = 'center'): Style {
    const [x0, y0] = c0;
    const [x1, y1] = c1;
    const dx = x1 - x0, dy = y1 - y0;
    const spanPx = Math.sqrt(dx * dx + dy * dy) / resolution;
    const scale = (spanPx * 0.7) / 24;
    let rotation = -Math.atan2(dy, dx);
    if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
    return new Style({
        geometry: new Point([(x0 + x1) / 2, (y0 + y1) / 2]),
        text: new Text({
            text,
            font: fontStyle,
            fill: new Fill({color: getLabelFillColor()}),
            rotation,
            textAlign,
            textBaseline: 'middle',
            scale,
        }),
    });
}

/**
 * Compute a label scale locked to a segment's screen-pixel span.
 * Mirrors graphicProportionalLabel: font declared at 24px, scale = (spanPx × 0.7) / 24.
 * As you zoom in the segment grows on screen → label grows with it.
 */
function segmentProportionalScale(dx: number, dy: number, resolution: number): number {
    const spanPx = Math.sqrt(dx * dx + dy * dy) / resolution;
    return (spanPx * 0.7) / 24;
}

/**
 * Create a single feature with a style function
 * that draws labels at each segment midpoint with rotation.
 */
export function movementGraphicPathStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => movementGraphicPathStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function movementGraphicPathStyleFromLabels(name: TacticalGraphicName, label: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        // Infiltration always shows "IN" near the tail — user label is ignored.
        if (name === TacticalGraphicName.Infiltration) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            return [new Style({
                geometry: new Point([(x0 + x1) / 2, (y0 + y1) / 2]),
                text: new Text({
                    text: 'IN',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // Envelopment always shows "E" near the tail — user label is ignored.
        if (name === TacticalGraphicName.Envelopment) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            return [new Style({
                geometry: new Point([(x0 + x1) / 2, (y0 + y1) / 2]),
                text: new Text({
                    text: 'E',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // MobileDefense always shows "MD" at the p0 vertex — horizontal regardless
        // of the graphic's rotation. User label is ignored.
        if (name === TacticalGraphicName.MobileDefense) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 1) return [];
            const [x0, y0] = coords[0];
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text: 'MD',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    rotation: 0,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // TurningMovement always shows "T" starting at the arrowhead base — user label is ignored.
        if (name === TacticalGraphicName.TurningMovement) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            //const spanPx = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) / resolution;
            //const scale = featureLabelScale(f, resolution);//(spanPx * 0.7) / 24;
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text: 'T',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    rotation,
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // FrontalAttack always shows "A" starting at the arrowhead base — user label is ignored.
        if (name === TacticalGraphicName.FrontalAttack) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            // const spanPx = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) / resolution;
            // const scale = (spanPx * 0.7) / 24;
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text: 'A',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    rotation,
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        // AviationAxisOfAdvance: name + DTG on one line at the start of the arrow.
        if (name === TacticalGraphicName.AviationAxisOfAdvance) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            const dx = x1 - x0, dy = y1 - y0;
            let rotation = -Math.atan2(dy, dx);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            const dateLabel = getDateLabel(label);
            const parts: string[] = [];
            if (label.label) parts.push(label.label);
            if (dateLabel) parts.push(dateLabel);
            const text = parts.join('     ') || '';
            if (!text) return [];
            const spanPx = Math.sqrt(dx * dx + dy * dy) / resolution;
            const scale = (spanPx * 0.7) / BASE_FONT_SIZE_PX;
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    rotation,
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale,
                }),
            })];
        }
        if (name === TacticalGraphicName.AttackHelicopterAxisOfAdvance) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 4) return [];
            const styles: Style[] = [];

            // coords[0..1]: text label span; coords[2]: twist center; coords[3]: direction point
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            const [cx, cy] = coords[2];
            const [dx3, dy3] = coords[3];

            // ── Text label (same as AviationAxisOfAdvance) ─────────────
            const tdx = x1 - x0, tdy = y1 - y0;
            let textRotation = -Math.atan2(tdy, tdx);
            if (textRotation > Math.PI / 2 || textRotation < -Math.PI / 2) textRotation += Math.PI;
            const dateLabel = getDateLabel(label);
            const parts: string[] = [];
            if (label.label) parts.push(label.label);
            if (dateLabel) parts.push(dateLabel);
            const text = parts.join('     ') || '';
            if (text) {
                const spanPx = Math.sqrt(tdx * tdx + tdy * tdy) / resolution;
                const textScale = (spanPx * 0.7) / BASE_FONT_SIZE_PX;
                styles.push(new Style({
                    geometry: new Point([x0, y0]),
                    text: new Text({
                        text,
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: haloStroke,
                        rotation: textRotation,
                        textAlign: 'left',
                        textBaseline: 'middle',
                        scale: textScale,
                    }),
                }));
            }

            // ── Attack helicopter symbol at twist point ────────────────
            // Arrow direction: from direction point (coords[3]) toward twist center (coords[2])
            const heading = Math.atan2(cy - dy3, cx - dx3);
            // Symbol half-size: use the text label span as reference (= arrow radius in map units)
            const s = Math.sqrt(tdx * tdx + tdy * tdy) * 0.5;

            const color = (f as Feature).get?.('hostilityColor') || getDefaultLineColor();
            const symbolStroke = new Stroke({ color, width: LINE_WIDTH });
            const symbolFill = new Fill({ color });

            // Helper: offset from center by angle and distance
            const off = (angle: number, dist: number): Coordinate =>
                [cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist];

            // Line parallel to arrowhead base (perpendicular to arrow heading),
            // with arrowhead pointing in whichever perpendicular direction is "up" on screen.
            // Pick the perpendicular that has a positive Y component (north = up in EPSG:3857).
            let perpAngle = heading + Math.PI / 2;
            if (Math.sin(perpAngle) < 0) perpAngle += Math.PI;

            const stalkHalf = s * 1.0;
            const lineTop = off(perpAngle, stalkHalf);
            const lineBottom = off(perpAngle + Math.PI, stalkHalf);
            const stalkLine = new LineString([lineBottom, lineTop]);
            styles.push(new Style({ geometry: stalkLine, stroke: symbolStroke }));

            // Small horizontal base at the bottom of the stalk (perpendicular to stalk = along heading)
            const baseHalfWidth = s * 0.3;
            const baseLeft: Coordinate = [
                lineBottom[0] + Math.cos(heading) * baseHalfWidth,
                lineBottom[1] + Math.sin(heading) * baseHalfWidth,
            ];
            const baseRight: Coordinate = [
                lineBottom[0] - Math.cos(heading) * baseHalfWidth,
                lineBottom[1] - Math.sin(heading) * baseHalfWidth,
            ];
            const baseLine = new LineString([baseLeft, baseRight]);
            styles.push(new Style({ geometry: baseLine, stroke: symbolStroke }));

            // Arrowhead (filled triangle) at top of the stalk
            const arrowLen = s * 0.4;
            const arrowHalfWidth = s * 0.2;
            const arrowTip = off(perpAngle, stalkHalf + arrowLen);
            // Arrowhead base wings are perpendicular to perpAngle (i.e. along the heading)
            const arrowLeft: Coordinate = [
                lineTop[0] + Math.cos(heading) * arrowHalfWidth,
                lineTop[1] + Math.sin(heading) * arrowHalfWidth,
            ];
            const arrowRight: Coordinate = [
                lineTop[0] - Math.cos(heading) * arrowHalfWidth,
                lineTop[1] - Math.sin(heading) * arrowHalfWidth,
            ];
            const arrowHead = new Polygon([[arrowTip, arrowLeft, arrowRight, arrowTip]]);
            styles.push(new Style({ geometry: arrowHead, fill: symbolFill, stroke: symbolStroke }));

            return styles;
        }
        // Main/Supporting axis of advance: single "name DTG" label on the
        // centerline, right-aligned just behind the arrowhead. Span (coords[0],
        // coords[1]) runs along the last base segment with coords[1] sitting at
        // the arrow tip anchor; we draw text anchored at coords[1] minus a
        // small clearance, extending backward, rotated with the line. Scale
        // tracks the arrow's radius span so text stays inside the channel.
        if (name === TacticalGraphicName.MainAxisOfAdvance ||
            name === TacticalGraphicName.MainAxisOfAdvanceFeint ||
            name === TacticalGraphicName.SupportingAxisOfAdvance ||
            name === TacticalGraphicName.InfiltrationLane) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [c0, c1] = coords;
            const dx = c1[0] - c0[0], dy = c1[1] - c0[1];
            const segLenMap = Math.hypot(dx, dy);
            if (segLenMap === 0) return [];
            const ux = dx / segLenMap, uy = dy / segLenMap;

            const dateLabel = getDateLabel(label);
            const parts: string[] = [];
            if (label.label) parts.push(label.label);
            if (dateLabel) parts.push(dateLabel);
            const text = parts.join('     ');
            if (!text) return [];

            const rotation = getRotation(c0, c1);
            const arrowGoesRight = c1[0] >= c0[0];
            // InfiltrationLane label sits centered on the middle of the
            // center-most segment; axis-of-advance labels sit right-aligned
            // just behind the arrowhead.
            const centerLabel = name === TacticalGraphicName.InfiltrationLane;
            const textAlign: CanvasTextAlign = centerLabel
                ? 'center'
                : (arrowGoesRight ? 'right' : 'left');

            const CLEARANCE_PX = 10;
            const clearanceMap = CLEARANCE_PX * resolution;
            const anchor: Coordinate = centerLabel
                ? [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2]
                : [c1[0] - ux * clearanceMap, c1[1] - uy * clearanceMap];

            const spanPx = segLenMap / resolution;
            const scale = (spanPx * 0.7) / BASE_FONT_SIZE_PX;

            return [new Style({
                geometry: new Point(anchor),
                text: new Text({
                    text,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    rotation,
                    textAlign,
                    textBaseline: 'middle',
                    scale,
                }),
            })];
        }
        // Counterattack: "CATK" left of segment midpoint, user name right — both on the
        // last body segment (before the arrowhead). Bypasses movementGraphicStyles.
        if (name === TacticalGraphicName.Counterattack) {
            const geom = f.getGeometry() as MultiPoint;
            if (!geom) return [];
            const coords = geom.getCoordinates();
            if (!coords || coords.length < 2) return [];
            const [x0, y0] = coords[0];
            const [x1, y1] = coords[1];
            let rotation = -Math.atan2(y1 - y0, x1 - x0);
            if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
            const catkText = label.label ? `CATK ${label.label}` : 'CATK';
            return [new Style({
                geometry: new Point([x0, y0]),
                text: new Text({
                    text: catkText,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    stroke: haloStroke,
                    rotation,
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale: featureLabelScale(f, resolution),
                }),
            })];
        }
        return movementGraphicStyles(label, f, resolution);
    };
}

function movementGraphicStyles(label: GraphicLabels, f: FeatureLike, resolution: number) {
    let primaryLabel = label.label ?? '';
    let dateLabel = getDateLabel(label);
    const geom = f.getGeometry() as MultiPoint;
    if (!geom) return [];
    const coords = geom.getCoordinates();
    if (!coords || coords.length < 2) return [];

    const styles: Style[] = [];
    styles.push(graphicProportionalLabel(coords[0], coords[1], resolution, primaryLabel));

    if (!!dateLabel) {
        // Shift one span-width along line direction for date label offset
        const [x0, y0] = coords[0];
        const [x1, y1] = coords[1];
        const dx = x1 - x0, dy = y1 - y0;
        const dc0: Coordinate = [x0 + dx, y0 + dy];
        const dc1: Coordinate = [x1 + dx, y1 + dy];
        styles.push(graphicProportionalLabel(dc0, dc1, resolution, dateLabel));
    }

    return styles;
}

export function clearStyleFunc(textLabel: string, t1: number = 0.6): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates();

        let midLine = coords[4];

        const styles: Style[] = [];
        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;

        const outlineSegments: Coordinate[][] = [];

        let midSegmentIndex = 4;

        for (let i = 0; i < coords.length; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push(coords[i]);
            }
        }

        // t1 is the fractional position along the mid line where the label
        // sits (0 = start, 1 = end). Defaults to 0.6 for Clear; Disrupt passes
        // 0.5 so the D label centers on the middle line.
        const p1 = midLine[0];
        const p2 = midLine[1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // 4) carve a central gap in that opening side
        const GAP_PX = 10; // px gap on each side of the dot
        const gapMap = GAP_PX * resolution; // map-unit gap
        const gapRatio = gapMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }
        // Normalize to [-π, π)
        if (rotation > Math.PI) rotation -= 2 * Math.PI;
        // 6) build styles for the echelon in the middle
        const textStyle = new Style({
            geometry: new Point(midGap),
            text: new Text({
                text: textLabel,
                font: 'bold 24px sans-serif',
                fill: new Fill({color: getLabelFillColor()}),
                rotation: rotation,
                textAlign: 'center',
                textBaseline: 'middle',
                scale: featureGraphicLabelScale(f, resolution),
                stroke: haloStroke,
            }),
        });
        styles.push(textStyle);

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
        });
        // Base layers
        styles.push(outlineStyle);
        return styles;
    };
}

function getRotation(start: Coordinate, end: Coordinate) {
    const dx = end[0] - start[0],
        dy = end[1] - start[1];
    let rotation = -Math.atan2(dy, dx);

    // Keep text upright
    if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
        rotation += Math.PI;
    }
    // Normalize to [-π, π)
    if (rotation > Math.PI) rotation -= 2 * Math.PI;
    return rotation;
}

/**
 * Offset `anchor` perpendicular to line `a→b`, always toward the "above" (north) side
 * regardless of which direction the line was drawn. Safe to call for both label-above
 * and label-below needs: use offsetBelow for the opposite side.
 */
function offsetAbove(anchor: Coordinate, a: Coordinate, b: Coordinate, resolution: number, offsetPx: number): Coordinate {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return anchor;
    // CCW perpendicular unit vector
    let nx = -dy / len;
    let ny = dx / len;
    // Normalize so the perpendicular always points "above" (north = positive y in EPSG:3857).
    // Without this, drawing right-to-left produces ny < 0 and labels appear below the line.
    if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
    const offsetMap = offsetPx * Math.abs(resolution);
    return [anchor[0] + nx * offsetMap, anchor[1] + ny * offsetMap];
}

/** Mirror of offsetAbove — offsets `anchor` to the "below" (south) side of line `a→b`. */
function offsetBelow(anchor: Coordinate, a: Coordinate, b: Coordinate, resolution: number, offsetPx: number): Coordinate {
    const [x, y] = offsetAbove(anchor, a, b, resolution, offsetPx);
    return [2 * anchor[0] - x, 2 * anchor[1] - y];
}

function offsetCoordinatesUp(start: Coordinate, next: Coordinate, resolution: number, offsetPx: number = 15): Coordinate {
    const dx = next[0] - start[0],
        dy = next[1] - start[1];

    // Offset in map units
    const offsetMap = offsetPx * resolution;
    // Perpendicular unit vector
    const len = Math.hypot(dx, dy);

    const nx = -dy / len;
    const ny = dx / len;
    // Clamp to small angles so vertical lines stay horizontal
    return [start[0] + nx * offsetMap, start[1] + ny * offsetMap];
}

function offsetCoordinatesInLine(start: Coordinate, next: Coordinate, resolution: number): Coordinate {
    const dx = next[0] - start[0];
    const dy = next[1] - start[1];

    const offsetPx = 15;
    const offsetMap = offsetPx * resolution;
    const len = Math.hypot(dx, dy);

    // Unit vector in the direction of the line
    const ux = dx / len;
    const uy = dy / len;

    // To find a point continuing past 'next':
    // return [next[0] + ux * offsetMap, next[1] + uy * offsetMap];

    // OR to find a point 'before' start:
    return [start[0] - ux * offsetMap, start[1] - uy * offsetMap];
}

function getDirectionIconSrc(direction: RouteDirection) {
    switch (direction) {
        case RouteDirection.ONE_WAY:
            return one_way_arrow;
        case RouteDirection.ALTERNATING:
            return alternating_arrow;
        case RouteDirection.TWO_WAY:
            return two_way_arrow;
        default:
            return '';
    }
}

function routeControlMeasureStyles(f: FeatureLike, resolution: number, label: string, direction: RouteDirection) {
    const geom = f.getGeometry() as MultiPoint;
    const coords = geom.getCoordinates();

    const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
    const styles: Style[] = [];

    const start = coords[0];
    const afterStart = coords[1];

    const end = coords[coords.length - 1];
    const beforeEnd = coords[coords.length - 2];

    let startLabelCoordinate = offsetCoordinatesUp(start, afterStart, 2 * resolution);
    let endLabelCoordinate = offsetCoordinatesUp(end, beforeEnd, -2 * resolution);
    let directionStart = offsetCoordinatesUp(start, afterStart, resolution);
    let directionEnd = offsetCoordinatesUp(end, beforeEnd, -resolution);

    let startRotation = getRotation(start, afterStart);
    let endRotation = getRotation(end, beforeEnd);

    let iconSrc = getDirectionIconSrc(direction);

    // left label
    styles.push(new Style(
        {
            geometry: new Point(startLabelCoordinate), // dummy point
            text: new Text({
                text: label,
                font: 'bold 24px sans-serif',
                fill: new Fill({color: getLabelFillColor()}),
                rotation: startRotation,
                textAlign: 'center',
                textBaseline: 'middle',
                scale: featureLabelScale(f, resolution),
                stroke: haloStroke,
            }),
        },
    ));
    styles.push(new Style(
        {
            geometry: new Point(directionStart), // dummy point

            image: new Icon({
                src: iconSrc,
                rotation: startRotation,
                scale: 1.2,
                color: '#000',
            }),
        },
    ));
    styles.push(new Style(
        {
            geometry: new Point(endLabelCoordinate),
            text: new Text({
                text: label,
                font: 'bold 24px sans-serif',
                fill: new Fill({color: getLabelFillColor()}),
                rotation: endRotation,
                textAlign: 'center',
                textBaseline: 'middle',
                scale: featureLabelScale(f, resolution),
                stroke: haloStroke,
            }),
        },
    ));
    // right label
    styles.push(new Style(
        {
            geometry: new Point(directionEnd),
            image: new Icon({
                src: iconSrc,
                rotation: endRotation,
                scale: 1.2,
                color: '#000',
            }),
        },
    ));
    // main line
    styles.push(new Style({
        geometry: geom,
        stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
    }));

    return styles;
}

export function routeControlMeasureStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => routeControlMeasureStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function routeControlMeasureStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    let label = getFullLabel(name, labels.label ?? '');
    let direction = labels.direction ?? RouteDirection.GENERAL;
    return (f, resolution) => {
        return direction === RouteDirection.GENERAL ?
            offensiveLineStyles(f, resolution, label) :
            routeControlMeasureStyles(f, resolution, label, direction);
    };
}

function getDefaultLineStyles(f: FeatureLike, resolution: number, identifierLabel: string, startDateLabel: string, endDateLabel: string) {
    const geom = f.getGeometry() as MultiPoint;
    const coords = geom.getCoordinates();

    const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
    const styles: Style[] = [];

    const start = coords[0];
    const afterStart = coords[1];

    const end = coords[coords.length - 1];
    const beforeEnd = coords[coords.length - 2];

    let startLabelCoordinate = offsetAbove(start, start, afterStart, resolution, 8);
    let startDateLabelCoordinate = offsetBelow(start, start, afterStart, resolution, 8);
    let endLabelCoordinate = offsetAbove(end, beforeEnd, end, resolution, 8);
    let endDateLabelCoordinate = offsetBelow(end, beforeEnd, end, resolution, 8);

    let startRotation = getRotation(start, afterStart);
    let endRotation = getRotation(end, beforeEnd);

    // After "keep upright" normalization, rotation is always ~0 for horizontal lines,
    // so textAlign refers to screen-left/right regardless of drawing direction.
    // Each endpoint is evaluated independently — the first and last segments can go
    // different directions (e.g. L-to-R overall but last segment turns back R-to-L).
    const startGoesRight = afterStart[0] >= start[0];
    const endGoesRight   = end[0] >= beforeEnd[0];
    const startAlign: CanvasTextAlign = startGoesRight ? 'left' : 'right';
    const endAlign: CanvasTextAlign   = endGoesRight   ? 'right' : 'left';
    const startScale = featureLabelScale(f, resolution);
    const endScale = featureLabelScale(f, resolution);

    styles.push(new Style(
        {
            geometry: new Point(startLabelCoordinate), // dummy point
            text: new Text({
                text: identifierLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: startRotation,
                textAlign: startAlign,
                textBaseline: 'bottom',
                scale: startScale,
                stroke: haloStroke,
            }),
        },
    ));
    styles.push(new Style(
        {
            geometry: new Point(endLabelCoordinate),
            text: new Text({
                text: identifierLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: endRotation,
                textAlign: endAlign,
                textBaseline: 'bottom',
                scale: endScale,
                stroke: haloStroke,
            }),
        },
    ));

    let dateLabel = (!isEmpty(startDateLabel) && !isEmpty(endDateLabel) ? `${startDateLabel} - ${endDateLabel}` : '');
    styles.push(new Style(
        {
            geometry: new Point(startDateLabelCoordinate), // dummy point
            text: new Text({
                text: dateLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: startRotation,
                textAlign: startAlign,
                textBaseline: 'top',
                scale: startScale,
                stroke: haloStroke,
            }),
        },
    ));
    styles.push(new Style(
        {
            geometry: new Point(endDateLabelCoordinate),
            text: new Text({
                text: dateLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: endRotation,
                textAlign: endAlign,
                textBaseline: 'top',
                scale: endScale,
                stroke: haloStroke,
            }),
        },
    ));
    const outlineStyle = new Style({
        geometry: geom,
        stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
    });
    styles.push(outlineStyle);

    return styles;
}

function offensiveLineStyles(f: FeatureLike, resolution: number, label: string) {
    const geom = f.getGeometry() as MultiPoint;
    const coords = geom.getCoordinates();

    const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
    const styles: Style[] = [];

    const start = coords[0];
    const afterStart = coords[1];

    const end = coords[coords.length - 1];
    const beforeEnd = coords[coords.length - 2];

    let startLabelCoordinate = offsetAbove(start, start, afterStart, resolution, 8);
    let endLabelCoordinate = offsetAbove(end, beforeEnd, end, resolution, 8);

    let startRotation = getRotation(start, afterStart);
    let endRotation = getRotation(end, beforeEnd);

    const startGoesRight = afterStart[0] >= start[0];
    const endGoesRight   = end[0] >= beforeEnd[0];
    const startAlign: CanvasTextAlign = startGoesRight ? 'left' : 'right';
    const endAlign: CanvasTextAlign   = endGoesRight   ? 'right' : 'left';

    const startScale = featureLabelScale(f, resolution);
    const endScale = featureLabelScale(f, resolution);

    styles.push(new Style(
        {
            geometry: new Point(startLabelCoordinate), // dummy point
            text: new Text({
                text: label,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: startRotation,
                textAlign: startAlign,
                textBaseline: 'bottom',
                scale: startScale,
                stroke: haloStroke,
            }),
        },
    ));
    styles.push(new Style(
        {
            geometry: new Point(endLabelCoordinate),
            text: new Text({
                text: label,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: endRotation,
                textAlign: endAlign,
                textBaseline: 'bottom',
                scale: endScale,
                stroke: haloStroke,
            }),
        },
    ));
    const outlineStyle = new Style({
        geometry: geom,
        stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
    });
    styles.push(outlineStyle);

    return styles;
}

export function defaultLineStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => defaultLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function defaultLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    let identifierLabel = getFullLabel(name, labels.label);
    let startDate = labels.startDate || '';
    let endDate = labels.endDate || '';

    return (f, resolution) => {
        const styles = getDefaultLineStyles(f, resolution, identifierLabel, startDate, endDate);
        if (labels.status && labels.status === TacticalGraphicStatus.planned) {
            // Override the line stroke to always be dashed
            styles.forEach(s => {
                const stroke = s.getStroke?.();
                if (stroke) stroke.setLineDash([12, 8]);
            });
        }
        return styles;
    };
}

/**
 * Linear target shape used by LinearTarget, LinearSmokeTarget, and
 * FinalProtectiveFire: a stretchable horizontal line with two perpendicular
 * end-caps (an "H" lying on its side). The name label sits above the center;
 * `belowLines` are stacked vertically below the center with single-line
 * spacing (LinearSmokeTarget passes ['SMOKE']; FPF passes ['FPF', secondId,
 * weapon]).
 *
 * Drawn from a 2-point base line; the two ends carry the perpendicular caps
 * and the user stretches the middle by dragging an endpoint.
 */
function buildLinearTargetStyles(
    f: FeatureLike,
    resolution: number,
    nameLabel: string,
    belowLines: string[],
    labels: GraphicLabels,
): Style[] {
    const geom = f.getGeometry() as LineString;
    if (!geom) return [];
    const coords = geom.getCoordinates();
    if (!coords || coords.length < 2) return [];

    const start = coords[0];
    const end = coords[coords.length - 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return [];

    const ux = dx / len;
    const uy = dy / len;
    // CCW perpendicular unit vector
    const px = -uy;
    const py = ux;

    const drawRes = (f.get('drawingResolution') as number | undefined) ?? resolution;
    const BAR_HALF_PX = 14;
    const barHalfMap = BAR_HALF_PX * drawRes;

    const startTop:    Coordinate = [start[0] + px * barHalfMap, start[1] + py * barHalfMap];
    const startBottom: Coordinate = [start[0] - px * barHalfMap, start[1] - py * barHalfMap];
    const endTop:      Coordinate = [end[0]   + px * barHalfMap, end[1]   + py * barHalfMap];
    const endBottom:   Coordinate = [end[0]   - px * barHalfMap, end[1]   - py * barHalfMap];

    const center: Coordinate = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

    const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
    const color = getColorByHostility(hostility);

    const styles: Style[] = [];

    styles.push(new Style({
        geometry: new MultiLineString([
            [start, end],
            [startTop, startBottom],
            [endTop, endBottom],
        ]),
        stroke: new Stroke({
            color,
            width: LINE_WIDTH,
            lineDash: dashStyle(labels),
        }),
    }));

    const rotation = getRotation(start, end);
    const labelScale = featureLabelScale(f, resolution);
    const LABEL_GAP_PX = 8;
    // textBaseline:'bottom' (used by the name label above) reserves descender
    // space below the baseline, so a name with no descenders floats farther
    // from the line than the anchor would suggest. The labels below use
    // textBaseline:'top' which sits right at the anchor with no equivalent
    // reserved space, so push the first below-line down by the same amount
    // to match the visual gap above the line. Scales with text scale.
    const DESCENDER_COMPENSATE_PX = 4;
    // Vertical spacing between stacked below-line labels (FPF / secondId /
    // weapon for FinalProtectiveFire). Drop this for tighter stacking, raise
    // it for more breathing room. Scales with text scale at render time.
    const LINE_HEIGHT_PX = 20;

    if (nameLabel) {
        const labelAnchor = offsetAbove(center, start, end, resolution, LABEL_GAP_PX);
        styles.push(new Style({
            geometry: new Point(labelAnchor),
            text: new Text({
                text: nameLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign: 'center',
                textBaseline: 'bottom',
                scale: labelScale,
                stroke: haloStroke,
            }),
        }));
    }

    for (let i = 0; i < belowLines.length; i++) {
        const text = belowLines[i];
        if (!text) continue;
        const offsetPx =
            LABEL_GAP_PX +
            DESCENDER_COMPENSATE_PX * labelScale +
            i * LINE_HEIGHT_PX * labelScale;
        const anchor = offsetBelow(center, start, end, resolution, offsetPx);
        styles.push(new Style({
            geometry: new Point(anchor),
            text: new Text({
                text,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign: 'center',
                textBaseline: 'top',
                scale: labelScale,
                stroke: haloStroke,
            }),
        }));
    }

    return styles;
}

export function linearTargetStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => linearTargetStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function linearTargetStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const nameLabel = getFullLabel(name, labels.label ?? '');
        return buildLinearTargetStyles(f, resolution, nameLabel, [], labels);
    };
}

export function linearSmokeTargetStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => linearSmokeTargetStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function linearSmokeTargetStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const nameLabel = getFullLabel(name, labels.label ?? '');
        return buildLinearTargetStyles(f, resolution, nameLabel, ['SMOKE'], labels);
    };
}

export function finalProtectiveFireStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => finalProtectiveFireStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function finalProtectiveFireStyleFromLabels(_name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const nameLabel = labels.label ?? '';
        const secondId = labels.secondId ?? '';
        const weapon = labels.weapon ?? '';
        const belowLines = ['FPF', secondId, weapon].filter(s => s.length > 0);
        return buildLinearTargetStyles(f, resolution, nameLabel, belowLines, labels);
    };
}

/** ProbableLineOfDeployment is always dashed (present and anticipated). */
export function probableLineOfDeploymentStyleFunc(): StyleFunction {
    return (f, resolution) => probableLineOfDeploymentStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function probableLineOfDeploymentStyleFromLabels(labels: GraphicLabels): StyleFunction {
    const identifierLabel = getFullLabel(TacticalGraphicName.ProbableLineOfDeployment, labels.label);
    return (f, resolution) => {
        const styles = getDefaultLineStyles(f, resolution, identifierLabel, '', '');
        // Override the line stroke to always be dashed
        styles.forEach(s => {
            const stroke = s.getStroke?.();
            if (stroke) stroke.setLineDash([12, 8]);
        });
        return styles;
    };
}

/** Line of Contact: two mirrored half-circle waves — red on top, black on bottom. */
export function lineOfContactStyleFunc(): StyleFunction {
    return (f, resolution) => lineOfContactStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function lineOfContactStyleFromLabels(labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        const lines = geom.getCoordinates();
        if (!lines || lines.length < 2) return [];

        const topCoords = lines[0];   // left/top wave (red)
        const bottomCoords = lines[1]; // right/bottom wave (black)

        // Anchor the LC labels on the centerline between the two offset waves.
        const bottomStart = bottomCoords[0];
        const bottomEnd = bottomCoords[bottomCoords.length - 1];
        const topStart = topCoords[0];
        const topEnd = topCoords[topCoords.length - 1];
        const start = [(topStart[0] + bottomStart[0]) / 2, (topStart[1] + bottomStart[1]) / 2];
        const end = [(topEnd[0] + bottomEnd[0]) / 2, (topEnd[1] + bottomEnd[1]) / 2];

        const startScale = featureLabelScale(f, resolution);
        const endScale = featureLabelScale(f, resolution);
        // Gap between label and graphic, scaled with label size.
        const labelPadPx = 10;

        // Rotate labels to follow the centerline's orientation (midpoint of
        // the two waves), not the wavy top wave itself.
        const startRotation = getRotation(start, end);
        const endRotation = getRotation(end, start);

        // getRotation flips rotation 180° to keep text upright, so when the
        // line is drawn right→left the anchor/offset need to swap to keep the
        // labels outside the graphic.
        const reversed = end[0] < start[0];
        const startAlign = reversed ? 'left' : 'right';
        const endAlign = reversed ? 'right' : 'left';
        const startOffsetSign = reversed ? 1 : -1;
        const endOffsetSign = reversed ? -1 : 1;

        return [
            // Red top wave
            new Style({
                geometry: new LineString(topCoords),
                stroke: new Stroke({color: 'red', width: LINE_WIDTH}),
            }),
            // Black bottom wave
            new Style({
                geometry: new LineString(bottomCoords),
                stroke: new Stroke({color: getDefaultLineColor(), width: LINE_WIDTH}),
            }),
            // "LC" label at start (left-aligned to the left of the line start)
            new Style({
                geometry: new Point(start),
                text: new Text({
                    text: 'LC',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: startRotation,
                    textAlign: startAlign,
                    textBaseline: 'middle',
                    scale: startScale,
                    offsetX: startOffsetSign * labelPadPx * startScale,
                    stroke: haloStroke,
                }),
            }),
            // "LC" label at end (right-aligned to the right of the line end)
            new Style({
                geometry: new Point(end),
                text: new Text({
                    text: 'LC',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: endRotation,
                    textAlign: endAlign,
                    textBaseline: 'middle',
                    scale: endScale,
                    offsetX: endOffsetSign * labelPadPx * endScale,
                    stroke: haloStroke,
                }),
            }),
        ];
    };
}

export function retroGradeTaskStyleFunc(label: string): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates();

        let baseLine = coords[0];

        const styles: Style[] = [];
        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;

        const outlineSegments: Coordinate[][] = [];

        let midSegmentIndex = 0;

        for (let i = 0; i < coords.length; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push(coords[i]);
            }
        }

        // Interpolate along that segment
        const t1 = .5;
        const p1 = baseLine[0];
        const p2 = baseLine[1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // 4) carve a central gap sized to fit the label at current scale
        const labelFont = 'bold 24px sans-serif';
        const labelScale = featureLabelScale(f, resolution);
        const labelWidthPx = getTextWidth(label, labelFont, labelScale);
        const GAP_PADDING_PX = 4;
        const halfGapPx = labelWidthPx / 2 + GAP_PADDING_PX;
        const gapMap = halfGapPx * resolution;
        const gapRatio = gapMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        // 6) build styles for the echelon in the middle
        const textStyle = new Style({
            geometry: new Point(midGap),
            text: new Text({
                text: label,
                font: labelFont,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: 0,
                textAlign: 'center',
                textBaseline: 'middle',
                scale: labelScale,
                stroke: haloStroke,
            }),
        });
        styles.push(textStyle);

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
        });
        // Base layers
        styles.push(outlineStyle);

        return styles;
    };
}

// ReliefInPlace: top line + curve + bottom line + arrowhead, with the "RIP"
// label carved into a gap on the top line near the non-arrow end.
export function reliefInPlaceStyleFunc(label: string): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        if (!geom) return [];
        const coords = geom.getCoordinates();
        if (coords.length < 4) return [];

        const topLine = coords[0];
        const curve = coords[1];
        const bottomLine = coords[2];
        const bottomArrow = coords[3];
        const topArrow = coords[4];

        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
        const stroke = new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH});

        const p1 = topLine[0];
        const p2 = topLine[1];
        const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) return [];

        const labelFont = 'bold 24px sans-serif';
        const labelScale = featureLabelScale(f, resolution);
        const textWidthPx = getTextWidth(label, labelFont, labelScale);
        const halfGapPx = textWidthPx / 2 + 4;
        const gapRatio = (halfGapPx * resolution) / segLen;
        const t = 0.2; // gap center at 20% along the top line (near p0)

        const gapA: Coordinate = [p1[0] + dx * (t - gapRatio), p1[1] + dy * (t - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t + gapRatio), p1[1] + dy * (t + gapRatio)];
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        let rotation = -Math.atan2(dy, dx);
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;

        return [
            new Style({geometry: new LineString([p1, gapA]), stroke}),
            new Style({geometry: new LineString([gapB, p2]), stroke}),
            new Style({geometry: new LineString(curve as Coordinate[]), stroke}),
            new Style({geometry: new LineString(bottomLine as Coordinate[]), stroke}),
            new Style({geometry: new LineString(bottomArrow as Coordinate[]), stroke}),
            ...(topArrow ? [new Style({geometry: new LineString(topArrow as Coordinate[]), stroke})] : []),
            new Style({
                geometry: new Point(midGap),
                text: new Text({
                    text: label,
                    font: labelFont,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: labelScale,
                    stroke: haloStroke,
                }),
            }),
        ];
    };
}

export function breachStyleFunc(label: string): StyleFunction {
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        const coords = geom.getCoordinates();

        let verticalLine = coords[coords.length - 1];

        const styles: Style[] = [];
        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;

        const outlineSegments: Coordinate[][] = [];

        let midSegmentIndex = coords.length - 1;

        for (let i = 0; i < coords.length; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push(coords[i]);
            }
        }

        // Interpolate along that segment
        const t1 = .5;
        const p1 = verticalLine[0];
        const p2 = verticalLine[1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // 4) carve a central gap in that opening side
        const GAP_PX = 10; // px gap on each side of the dot
        const gapMap = GAP_PX * resolution; // map-unit gap
        const gapRatio = gapMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        // 6) build styles for the echelon in the middle
        const textStyle = new Style({
            geometry: new Point(midGap),
            text: new Text({
                text: label,
                font: 'bold 24px sans-serif',
                fill: new Fill({color: getLabelFillColor()}),
                rotation: 0,
                textAlign: 'center',
                textBaseline: 'middle',
                scale: featureGraphicLabelScale(f, resolution),
                stroke: haloStroke,
            }),
        });
        styles.push(textStyle);

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
        });
        // Base layers
        styles.push(outlineStyle);

        return styles;
    };
}

export function blockStyleFunc(label: string): StyleFunction {
    return (f: FeatureLike, resolution: number) => {
        const geom = f.getGeometry();
        let coords;
        if (!geom) return;

        if (geom instanceof LineString) coords = geom.getCoordinates();
        else if (geom instanceof MultiLineString) coords = geom.getCoordinates()[0];
        else return;

        const styles: Style[] = [];
        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;

        const outlineSegments: Coordinate[][] = [];
        if (geom instanceof MultiLineString) {
            outlineSegments.push(...geom.getCoordinates().slice(1, geom.getCoordinates().length));
        }

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Compute the total baseline vector (start → end)
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        // Project each vertex onto that baseline to get cumulative "linear" distance
        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen; // scalar projection
        });

        // 4️⃣ Normalize to 0 → baseLen range
        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const normalizedProjections = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        // Find segment that crosses the projected midpoint (0.5)
        const half = 0.5;
        let midSegmentIndex = 0;
        for (let i = 0; i < normalizedProjections.length - 1; i++) {
            if (normalizedProjections[i] <= half && normalizedProjections[i + 1] >= half) {
                midSegmentIndex = i;
                break;
            }
        }

        for (let i = 0; i < coords.length - 1; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push([coords[i], coords[i + 1]]);
            }
        }

        // Interpolate along that segment
        const t1 =
            (half - normalizedProjections[midSegmentIndex]) /
            (normalizedProjections[midSegmentIndex + 1] - normalizedProjections[midSegmentIndex]);

        const p1 = coords[midSegmentIndex];
        const p2 = coords[midSegmentIndex + 1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // Gap: sized to fit the actually rendered label glyph plus 4px
        // padding per side. getTextWidth returns screen pixels at the
        // current OL text scale, so we convert to map units with
        // `* resolution` — this keeps the gap tight around the label
        // regardless of zoom or of how wide the graphic's front line is.
        // Measure with the same 24px font that the text style renders.
        const labelScale = featureGraphicLabelScale(f, resolution);
        const labelWidthPx = getTextWidth(label, 'bold 24px sans-serif', labelScale);
        const gapMap = (labelWidthPx / 2 + 4) * resolution;
        const gapRatio = gapMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }
        // Normalize to [-π, π)
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        // 6) build styles for the label in the middle.
        // Use the same 24px base font as breachStyleFunc/clearStyleFunc so the
        // ratio-locked block-family graphics render with matching label sizes.
        const textStyle = new Style({
            geometry: new Point(midGap),
            text: new Text({
                text: label,
                font: 'bold 24px sans-serif',
                fill: new Fill({color: getLabelFillColor()}),
                stroke: haloStroke,
                rotation: rotation,
                textAlign: 'center',
                textBaseline: 'middle',
                scale: labelScale,
            }),
        });
        styles.push(textStyle);

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
        });
        // Base layers
        styles.push(outlineStyle);

        return styles;
    };
}

/**
 * AttackByFire — backward "<" feathers at the start, shaft, and arrowhead at the end.
 * Geometry comes from `getAttackByFireSymbol` as a MultiLineString:
 *   [0] upper feather, [1] lower feather, [2] shaft, [3] arrowhead.
 * Renders the outline only — no label.
 */
export function attackByFireStyleFunc(): StyleFunction {
    return (f) => {
        const geom = f.getGeometry();
        if (!(geom instanceof MultiLineString)) return [];
        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
        return [new Style({
            geometry: geom,
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
        })];
    };
}

export function coordinatedFireLineStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => coordinatedFireLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function coordinatedFireLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const topLabel = getFullLabel(name, labels.label ?? '');
    const bottomLabel = getDateLabel(labels);
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();

        const styles: Style[] = [];

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Compute the total baseline vector (start → end)
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        // Project each vertex onto that baseline to get cumulative "linear" distance
        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen; // scalar projection
        });

        // 4️⃣ Normalize to 0 → baseLen range
        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const normalizedProjections = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        // Find segment that crosses the projected midpoint (0.5)
        const half = 0.5;
        let midSegmentIndex = 0;
        for (let i = 0; i < normalizedProjections.length - 1; i++) {
            if (normalizedProjections[i] <= half && normalizedProjections[i + 1] >= half) {
                midSegmentIndex = i;
                break;
            }
        }

        // Interpolate along that segment
        const t1 =
            (half - normalizedProjections[midSegmentIndex]) /
            (normalizedProjections[midSegmentIndex + 1] - normalizedProjections[midSegmentIndex]);

        const p1 = coords[midSegmentIndex];
        const p2 = coords[midSegmentIndex + 1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // 4) carve a gap: infiltration formula — half label width + 8px padding
        const cflScale = featureLabelScale(f, resolution);
        const cflGapMap = segLen * 0.35 + 8 * resolution;
        const gapRatio = cflGapMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }
        // Normalize to [-π, π)
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        // 8px perpendicular offset from line to nearest text edge
        const offsetMap = 8 * resolution;
        // Perpendicular unit vector — normalized to always point "above" (north),
        // so labels are correct regardless of drawing direction.
        const len = Math.hypot(dx, dy);
        let nx = -dy / len;
        let ny = dx / len;
        if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
        let topLabelCoordinate = [midGap[0] + nx * offsetMap, midGap[1] + ny * offsetMap];
        let bottomLabelCoordinate = [midGap[0] - nx * offsetMap, midGap[1] - ny * offsetMap];

        styles.push(new Style(
            {
                geometry: new Point(topLabelCoordinate), // dummy point
                text: new Text({
                    text: topLabel,
                    font: fontStyle,
                    //font: 'bold 20px sans-serif',
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'bottom',
                    scale: cflScale,
                    stroke: haloStroke,
                }),
            },
        ));
        styles.push(new Style(
            {
                geometry: new Point(bottomLabelCoordinate), // dummy point
                text: new Text({
                    text: bottomLabel,
                    font: fontStyle,
                    //font: 'bold 20px sans-serif',
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'top',
                    scale: cflScale,
                    stroke: haloStroke,
                }),
            },
        ));

        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
        const outlineStyle = new Style({
            geometry: geom,
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
        });
        styles.push(outlineStyle);
        if (labels.status && labels.status === TacticalGraphicStatus.planned) {
            // Override the line stroke to always be dashed
            styles.forEach(s => {
                const stroke = s.getStroke?.();
                if (stroke) stroke.setLineDash([12, 8]);
            });
        }

        return styles;
    };
}

export function engineerWorkLineStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => engineerWorkLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function engineerWorkLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const mainLabelText = getLabel(name);          // "EWL"
    const midTopText   = (!isEmpty(labels.label) ? labels.label : '') + (!isEmpty(labels.countryCode) ? ' ' + labels.countryCode : '');       // name / field T (optional)
    const midBotText   = (!isEmpty(labels.secondId) ? labels.secondId : '') + (!isEmpty(labels.secondCountryCode) ? ' ' + labels.secondCountryCode : ''); // country code / field AS (optional)

    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();
        if (coords.length < 2) return [];

        const styles: Style[] = [];
        const scale = featureLabelScale(f, resolution);

        // ── End labels ("EWL" on the line above each endpoint) ────────────
        const start     = coords[0];
        const startNext = coords[1];
        const end       = coords[coords.length - 1];
        const endPrev   = coords[coords.length - 2];

        const rotStart = getRotation(start, startNext);
        const rotEnd   = getRotation(endPrev, end);

        const startGoesRight = startNext[0] >= start[0];
        const endGoesRight   = end[0]       >= endPrev[0];

        styles.push(new Style({
            geometry: new Point(offsetAbove(start, start, startNext, resolution, 8)),
            text: new Text({
                text: mainLabelText,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: rotStart,
                textAlign: startGoesRight ? 'left' : 'right',
                textBaseline: 'bottom',
                scale,
                stroke: haloStroke,
            }),
        }));

        styles.push(new Style({
            geometry: new Point(offsetAbove(end, endPrev, end, resolution, 8)),
            text: new Text({
                text: mainLabelText,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation: rotEnd,
                textAlign: endGoesRight ? 'right' : 'left',
                textBaseline: 'bottom',
                scale,
                stroke: haloStroke,
            }),
        }));

        // ── Midpoint: find the projected centre of the line ────────────────
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen;
        });

        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const norm = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        let midIdx = 0;
        for (let i = 0; i < norm.length - 1; i++) {
            if (norm[i] <= 0.5 && norm[i + 1] >= 0.5) { midIdx = i; break; }
        }

        const p1 = coords[midIdx];
        const p2 = coords[midIdx + 1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);
        const t1 = (0.5 - norm[midIdx]) / (norm[midIdx + 1] - norm[midIdx]);
        const midPt: Coordinate = [p1[0] + dx * t1, p1[1] + dy * t1];

        let rotation = -Math.atan2(dy, dx);
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // Perpendicular unit vector always pointing "above" (north-ward)
        let nx = -dy / segLen;
        let ny =  dx / segLen;
        if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }

        const offsetMap = 8 * resolution;

        // ── Middle-top: name (field T) ─────────────────────────────────────
        if (midTopText) {
            styles.push(new Style({
                geometry: new Point([midPt[0] + nx * offsetMap, midPt[1] + ny * offsetMap]),
                text: new Text({
                    text: midTopText,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'bottom',
                    scale,
                    stroke: haloStroke,
                }),
            }));
        }

        // ── Middle-bottom: country code / identifier2 (field AS) ──────────
        if (midBotText) {
            styles.push(new Style({
                geometry: new Point([midPt[0] - nx * offsetMap, midPt[1] - ny * offsetMap]),
                text: new Text({
                    text: midBotText,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation,
                    textAlign: 'center',
                    textBaseline: 'top',
                    scale,
                    stroke: haloStroke,
                }),
            }));
        }

        // ── Line ──────────────────────────────────────────────────────────
        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
        styles.push(new Style({
            geometry: geom,
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
        }));
        if (labels.status && labels.status === TacticalGraphicStatus.planned) {
            // Override the line stroke to always be dashed
            styles.forEach(s => {
                const stroke = s.getStroke?.();
                if (stroke) stroke.setLineDash([12, 8]);
            });
        }
        return styles;
    };
}

export function obstacleLineStyle(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => obstacleLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function obstacleLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const label = getFullLabel(name, labels.label ?? '');
    return (f, resolution) => {
        const geom = f.getGeometry() as LineString;
        const coords = geom.getCoordinates();
        const styles: Style[] = [];

        if (coords.length < 2) return styles;

        const start = coords[0];
        const end = coords[coords.length - 1];

        // --- 1. Baseline vector (dominant direction)
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        if (baseLen === 0) return styles;

        const ux = baseDx / baseLen;
        const uy = baseDy / baseLen;

        // --- 2. Project all vertices onto baseline
        const projected = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return vx * ux + vy * uy;
        });

        const minP = Math.min(...projected);
        const maxP = Math.max(...projected);
        const target = (minP + maxP) / 2;

        // --- 3. Find segment containing the midpoint projection
        let segIdx = 0;
        for (let i = 0; i < projected.length - 1; i++) {
            if (
                (projected[i] <= target && projected[i + 1] >= target) ||
                (projected[i] >= target && projected[i + 1] <= target)
            ) {
                segIdx = i;
                break;
            }
        }
        const SMOOTH_WINDOW = 3;

        let dirX = 0;
        let dirY = 0;

        for (let i = -SMOOTH_WINDOW; i <= SMOOTH_WINDOW; i++) {
            const idx = segIdx + i;
            if (idx < 0 || idx >= coords.length - 1) continue;

            const a = coords[idx];
            const b = coords[idx + 1];

            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const len = Math.hypot(dx, dy);

            if (len > 0) {
                dirX += dx / len;
                dirY += dy / len;
            }
        }
        const p1 = coords[segIdx];
        const p2 = coords[segIdx + 1];
        const d1 = projected[segIdx];
        const d2 = projected[segIdx + 1];

        const t = d1 === d2 ? 0.5 : (target - d1) / (d2 - d1);

        // --- 4. True midpoint position on geometry
        const mid: Coordinate = [
            p1[0] + (p2[0] - p1[0]) * t,
            p1[1] + (p2[1] - p1[1]) * t,
        ];

        // --- 5. Rotation from baseline ONLY
        let rotation = -Math.atan2(dirY, dirX);
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // --- 7. Offset label perpendicular to baseline
        // Center at (half text height + 8px) so nearest text edge is always 8px from line
        const obsScale = featureLabelScale(f, resolution);
        const obsOffsetPx = 12 * obsScale + 8;
        const obsOffsetMap = obsOffsetPx * resolution;

        const nx = -uy;
        const ny = ux;

        const labelPoint: Coordinate = [
            mid[0] - nx * obsOffsetMap,
            mid[1] - ny * obsOffsetMap,
        ];


        styles.push(new Style(
            {
                geometry: new Point(labelPoint), // dummy point
                text: new Text({
                    text: label,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: obsScale,
                    stroke: haloStroke,
                }),
            },
        ));

        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
        const outlineStyle = new Style({
            geometry: geom,
            stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
        });
        styles.push(outlineStyle);

        return styles;
    };
}

function getPointAlongSegment(coord1: number[], coord2: number[], ratio: number) {
    return [
        coord1[0] + (coord2[0] - coord1[0]) * ratio,
        coord1[1] + (coord2[1] - coord1[1]) * ratio,
    ];
}

export function ferryCrossingStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => ferryCrossingStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function ferryCrossingStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        let color = f.get('hostilityColor') || getDefaultLineColor();
        return new Style({
            fill: new Fill({color: color}),
            stroke: new Stroke({
                color: color,
                width: LINE_WIDTH,
                lineDash: dashStyle(labels),
            }),
        });
    };
}

/**
 * TacticalFix — same fill/stroke treatment as `ferryCrossingStyleFunc`, plus
 * an "F" label rendered 15px past the line start in screen pixels, oriented
 * with the line and kept upright. Label scale tracks the user-drawn line
 * length so it grows/shrinks with the graphic and matches the block-family
 * label size at the 100px minimum.
 */
export function tacticalFixStyleFunc(): StyleFunction {
    return (f, resolution) => tacticalFixStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function tacticalFixStyleFromLabels(labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const styles: Style[] = [];
        const color = f.get('hostilityColor') || getDefaultLineColor();
        styles.push(new Style({
            fill: new Fill({color: color}),
            stroke: new Stroke({
                color: color,
                width: LINE_WIDTH,
                lineDash: dashStyle(labels),
            }),
        }));

        const geom = f.getGeometry();
        let lineCoords: Coordinate[] | undefined;
        if (geom instanceof GeometryCollection) {
            for (const sub of geom.getGeometries()) {
                if (sub instanceof LineString) {
                    lineCoords = sub.getCoordinates();
                    break;
                }
            }
        } else if (geom instanceof LineString) {
            lineCoords = geom.getCoordinates();
        }
        if (!lineCoords || lineCoords.length < 2) return styles;

        // Derive the F position straight from the geometry: the first segment
        // runs from the line start (lineCoords[0]) to the first triangle's
        // first vertex (lineCoords[1]). Anchoring at that segment's midpoint
        // keeps the label glued in place across zooms — it's no longer offset
        // by `25 × resolution`, which used to drift as zoom changed.
        const segStart = lineCoords[0];
        const segEnd = lineCoords[1];
        const labelAnchor: Coordinate = [
            (segStart[0] + segEnd[0]) / 2,
            (segStart[1] + segEnd[1]) / 2,
        ];

        // Rotation/scale come from the full line so the F is upright with the
        // graphic and its size tracks the user-drawn length.
        const start = lineCoords[0];
        const end = lineCoords[lineCoords.length - 1];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const len = Math.hypot(dx, dy);
        if (len === 0) return styles;

        let rotation = -Math.atan2(dy, dx);
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // Sized to render ~22.5px tall at the 145px min line length, matching
        // the block-family label size at minimum.
        const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        const lenPx = len / resolution;
        const K = 0.10;
        const scale = sizeFactor * K * lenPx / BASE_FONT_SIZE_PX;

        styles.push(new Style({
            geometry: new Point(labelAnchor),
            text: new Text({
                text: 'F',
                font: 'bold 24px sans-serif',
                fill: new Fill({color: getLabelFillColor()}),
                stroke: haloStroke,
                rotation,
                textAlign: 'center',
                textBaseline: 'middle',
                scale,
            }),
        }));

        return styles;
    };
}

export function defaultStyleFunc(): StyleFunction {
    return (f, resolution) => {
        let color = f.get('hostilityColor') || getDefaultLineColor();
        return new Style({
            fill: new Fill({color: color}),
            stroke: new Stroke({
                color: color,
                width: LINE_WIDTH,
            }),
        });
    };
}

/**
 * BaseDefenseZone label: hardcoded "BDZ" centered on the circle, scaled so
 * the text grows/shrinks with the circle. The circle's radius (in metres)
 * is read from `feature.get('graphicSize')` — `MissionTaskGraphicBase`
 * stamps it on the label feature each time the geometry updates.
 *
 * Scale formula: `radiusPx / SCALE_DIVISOR`. With divisor 30, a 60 px
 * radius circle gets a scale of ≈ 2.0 → "BDZ" renders ~48 px tall, which
 * fits comfortably inside the circle. Lower the divisor for a larger
 * label, raise it for a smaller one.
 */
export function baseDefenseZoneLabelStyleFn(): StyleFunction {
    return (feature, resolution) => {
        const geom = feature.getGeometry() as Point;
        const size = feature.get('graphicSize') as number | undefined;
        const radiusPx = size && size > 0 ? size / resolution : 0;
        const SCALE_DIVISOR = 45;
        const scale = Math.max(0.1, radiusPx / SCALE_DIVISOR);
        return [new Style({
            geometry: geom,
            text: new Text({
                text: 'BDZ',
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                textAlign: 'center',
                textBaseline: 'middle',
                scale,
                stroke: haloStroke,
            }),
        })];
    };
}

/**
 * FightingPosition: stroke-only render of the 3-sided rectangle (left, top,
 * right walls — open at the bottom). The graphic feature's geometry is a
 * LineString of 4 points produced by `FightingPosition.generateGraphics`,
 * so a single Stroke is enough — no fill, no per-point label.
 */
export function fightingPositionStyleFunc(): StyleFunction {
    return (f) => {
        const color = f.get('hostilityColor') || getDefaultLineColor();
        return new Style({
            stroke: new Stroke({color, width: LINE_WIDTH}),
        });
    };
}

/**
 * FortifiedLine: a continuous baseline plus rectangular teeth (merlons)
 * bumping up from it. Geometry is a MultiLineString — sub-line [0] is the
 * baseline, sub-lines [1..N] are each tooth as 4 points (leftBase, leftTop,
 * rightTop, rightBase). All sub-lines share one stroke; the name label
 * (when set) sits below the baseline midpoint so the teeth above don't
 * overlap it.
 */
export function fortifiedLineStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => fortifiedLineStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function fortifiedLineStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const label = getFullLabel(name, labels.label ?? '');
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiLineString;
        if (!geom) return [];
        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
        const color = getColorByHostility(hostility);
        const styles: Style[] = [];

        styles.push(new Style({
            geometry: geom,
            stroke: new Stroke({
                color,
                width: LINE_WIDTH,
                lineDash: dashStyle(labels),
            }),
        }));

        if (!label) return styles;

        // Sub-lines are interleaved gap/tooth/gap/.../gap. The user-drawn
        // baseline endpoints are the very first point of the first sub-line
        // and the very last point of the last sub-line — those are always
        // gap pieces (the layout starts and ends with a gap).
        const lines = geom.getCoordinates();
        if (!lines.length) return styles;
        const firstLine = lines[0];
        const lastLine = lines[lines.length - 1];
        if (firstLine.length < 1 || lastLine.length < 1) return styles;
        const start = firstLine[0];
        const end = lastLine[lastLine.length - 1];
        // Treat the start→end span as the baseline for label projection. For
        // multi-segment user lines this is an approximation, but the user's
        // drawn line is contiguous so the midpoint sits close to the
        // visual center.
        const baseline = [start, end];
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);
        if (baseLen === 0) return styles;
        const ux = baseDx / baseLen;
        const uy = baseDy / baseLen;

        const projected = baseline.map(([x, y]) => (x - start[0]) * ux + (y - start[1]) * uy);
        const target = (Math.min(...projected) + Math.max(...projected)) / 2;
        let segIdx = 0;
        for (let i = 0; i < projected.length - 1; i++) {
            if ((projected[i] <= target && projected[i + 1] >= target) ||
                (projected[i] >= target && projected[i + 1] <= target)) {
                segIdx = i;
                break;
            }
        }
        const a = baseline[segIdx];
        const b = baseline[segIdx + 1];
        const da = projected[segIdx];
        const db = projected[segIdx + 1];
        const t = da === db ? 0.5 : (target - da) / (db - da);
        const mid: Coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

        // Label below the line (teeth bump up) — same 8 px gap rule as the
        // other line styles, with bottom-anchored text so the gap is
        // constant regardless of label scale.
        const scale = featureLabelScale(f, resolution);
        const labelAnchor = offsetBelow(mid, a, b, resolution, 8);
        const rotation = getRotation(a, b);

        styles.push(new Style({
            geometry: new Point(labelAnchor),
            text: new Text({
                text: label,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign: 'center',
                textBaseline: 'top',
                scale,
                stroke: haloStroke,
            }),
        }));

        return styles;
    };
}

/**
 * Unified style function for all four direction-arrow graphics:
 * DirectionOfMainAttack, DirectionOfSupportingAttack, DirectionOfMainAttackFeint,
 * AviationDirectionOfAttack.
 *
 * Layout rules:
 *  - Base line uses `dashStyle(labels)` so it goes dashed when planned /
 *    suspected, per the shared hash convention. Arrowheads stay solid.
 *  - Name label sits on the line, rotated with the line, right-aligned so its
 *    right edge stops just before the arrowhead (never invades it).
 *  - DTG (dtg1 - dtg2) sits below the line at 20 px * labelScale clearance,
 *    direction-safe via `offsetBelow` and `textBaseline:'top'`.
 *  - DirectionOfSupportingAttack: if hostility is hostile, prepend a separate
 *    "ENY" label one gap to the left of the name.
 */
export function directionArrowStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => directionArrowStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function directionArrowStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const color = f.get('hostilityColor') || getDefaultLineColor();
        const geom = f.getGeometry() as MultiLineString;
        const allCoords = geom.getCoordinates();
        const baseCoords = allCoords[0];
        const arrowCoords = allCoords[1];
        const styles: Style[] = [];

        // Base line (dashes when planned).
        styles.push(new Style({
            geometry: new LineString(baseCoords),
            stroke: new Stroke({
                color,
                width: LINE_WIDTH,
                lineDash: dashStyle(labels),
            }),
        }));

        // Arrowhead + any extra shapes (feint dashes, main-attack polygon, etc.), solid.
        if (allCoords.length > 1) {
            styles.push(new Style({
                geometry: new MultiLineString(allCoords.slice(1)),
                stroke: new Stroke({color, width: LINE_WIDTH}),
            }));
        }

        // Fill the Aviation-direction-of-attack bow-tie triangles (closed rings
        // appended at indices 2 and 3 by AviationDirectionOfAttack.generateGraphics).
        if (name === TacticalGraphicName.AviationDirectionOfAttack && allCoords.length >= 4) {
            styles.push(new Style({
                geometry: new Polygon([allCoords[2]]),
                fill: new Fill({color}),
            }));
            styles.push(new Style({
                geometry: new Polygon([allCoords[3]]),
                fill: new Fill({color}),
            }));
        }

        if (baseCoords.length >= 2 && arrowCoords && arrowCoords.length >= 3) {
            addDirectionArrowLabels(name, labels, baseCoords, arrowCoords, styles, resolution, f);
        }

        return styles;
    };
}

/**
 * Draws the name / optional ENY prefix / DTG labels for a direction arrow.
 * Anchor is set just behind the arrowhead wing base so text never invades the
 * arrowhead. Text extends backward along the line via `textAlign` chosen per
 * local screen direction, keeping the labels away from the tip for both
 * left-to-right and right-to-left draws.
 */
function addDirectionArrowLabels(
    name: TacticalGraphicName,
    labels: GraphicLabels,
    baseCoords: Position[],
    arrowCoords: Position[],
    styles: Style[],
    resolution: number,
    feature: FeatureLike,
): void {
    const p1 = baseCoords[baseCoords.length - 2];
    const p2 = baseCoords[baseCoords.length - 1];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const lineLen = Math.hypot(dx, dy);
    if (lineLen === 0) return;
    const ux = dx / lineLen;
    const uy = dy / lineLen;

    // Midpoint of the arrowhead's wing base (computeArrowheadPoints → [lw, tip, rw]).
    const leftWing = arrowCoords[0];
    const rightWing = arrowCoords[2];
    const midWingBase: Coordinate = [
        (leftWing[0] + rightWing[0]) / 2,
        (leftWing[1] + rightWing[1]) / 2,
    ];

    // Anchor = short fixed clearance behind the wing base along the line.
    const CLEARANCE_PX = 10;
    const clearanceMap = CLEARANCE_PX * resolution;
    const anchor: Coordinate = [
        midWingBase[0] - ux * clearanceMap,
        midWingBase[1] - uy * clearanceMap,
    ];

    const rotation = getRotation(p1, p2);
    const labelScale = featureLabelScale(feature, resolution);
    // The arrowhead is at p2; text must extend away from it in screen space.
    const arrowGoesRight = p2[0] >= p1[0];
    const textAlign: CanvasTextAlign = arrowGoesRight ? 'right' : 'left';

    const nameText = getFullLabel(name, labels.label ?? '');
    const dateText = getDateLabel(labels);
    const isHostile = labels.hostility === TacticalGraphicHostility.hostileFaker;
    const showEny = name === TacticalGraphicName.DirectionOfSupportingAttack && isHostile;

    if (nameText) {
        styles.push(new Style({
            geometry: new Point(anchor),
            text: new Text({
                text: nameText,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign,
                textBaseline: 'middle',
                scale: labelScale,
                stroke: haloStroke,
            }),
        }));
    }

    if (showEny) {
        const nameWidthPx = nameText ? getTextWidth(nameText, fontStyle, labelScale) : 0;
        const ENY_GAP_PX = 36;
        const enyBackMap = (nameWidthPx + ENY_GAP_PX) * resolution;
        const enyAnchor: Coordinate = [
            anchor[0] - ux * enyBackMap,
            anchor[1] - uy * enyBackMap,
        ];
        styles.push(new Style({
            geometry: new Point(enyAnchor),
            text: new Text({
                text: 'ENY',
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign,
                textBaseline: 'middle',
                scale: labelScale,
                stroke: haloStroke,
            }),
        }));
    }

    if (dateText) {
        const DTG_OFFSET_PX = 20;
        const dtgAnchor = offsetBelow(anchor, p1, p2, resolution, DTG_OFFSET_PX * labelScale);
        styles.push(new Style({
            geometry: new Point(dtgAnchor),
            text: new Text({
                text: dateText,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                rotation,
                textAlign,
                textBaseline: 'top',
                scale: labelScale,
                stroke: haloStroke,
            }),
        }));
    }
}

export function forwardLineOfOwnTroopsStyleFunc(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => forwardLineOfOwnTroopsStyleFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function forwardLineOfOwnTroopsStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        let color = f.get('hostilityColor') || getDefaultLineColor();
        return [new Style({
            stroke: new Stroke({
                color: color,
                width: LINE_WIDTH,
                lineDash: dashStyle(labels),
            }),
        })];
    };
}

export function fieldOfFireStyleFunc(): StyleFunction {
    return (f, resolution) => fieldOfFireStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function fieldOfFireStyleFromLabels(labels: GraphicLabels): StyleFunction {
    return (f, resolution) => {
        const color = f.get('hostilityColor') || getDefaultLineColor();
        const styles: Style[] = [];

        // Thin stroke for the whole MultiLineString (V legs + both arrowheads).
        styles.push(new Style({
            stroke: new Stroke({color, width: LINE_WIDTH}),
        }));

        const coords0 = (f.getGeometry() as MultiLineString).getCoordinates()[0];

        // Black filled "rectangle" on the center of the LEFT leg (P0→P1).
        // Rendered as a thick butt-cap stroke so the ends are square.
        if (coords0.length >= 2) {
            const startPoint = getPointAlongSegment(coords0[0], coords0[1], 0.2);
            const endPoint = getPointAlongSegment(coords0[0], coords0[1], 0.7);
            styles.push(new Style({
                geometry: new LineString([startPoint, endPoint]),
                stroke: new Stroke({
                    color: 'black',
                    width: 12,
                    lineCap: 'butt',
                }),
            }));
        }

        // Boxed label at the vertex (middle point of a 3-point V).
        if (coords0.length >= 3) {
            const vertex = coords0[1];
            const labelText = labels?.label ?? '';
            if (labelText) {
                styles.push(new Style({
                    geometry: new Point(vertex),
                    text: new Text({
                        text: labelText,
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        padding: [3, 5, 3, 5],
                        textAlign: 'center',
                        textBaseline: 'top',
                        offsetY: 8,
                        scale: featureLabelScale(f, resolution),
                    }),
                }));
            }
        }

        return styles;
    };
}

export function munitionFlightPathStyleFunc(): StyleFunction {
    return (f, resolution) => munitionFlightPathStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function munitionFlightPathStyleFromLabels(labels: GraphicLabels): StyleFunction {
    let dateLabel = getDateLabel(labels);
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();

        const styles: Style[] = [];
        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;

        const outlineSegments: Coordinate[][] = [];

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Compute the total baseline vector (start → end)
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        // Project each vertex onto that baseline to get cumulative "linear" distance
        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen; // scalar projection
        });

        // 4️⃣ Normalize to 0 → baseLen range
        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const normalizedProjections = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        // Find segment that crosses the projected midpoint (0.5)
        const half = 0.5;
        let midSegmentIndex = 0;
        for (let i = 0; i < normalizedProjections.length - 1; i++) {
            if (normalizedProjections[i] <= half && normalizedProjections[i + 1] >= half) {
                midSegmentIndex = i;
                break;
            }
        }

        for (let i = 0; i < coords.length - 1; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push([coords[i], coords[i + 1]]);
            }
        }

        // Interpolate along that segment
        const t1 =
            (half - normalizedProjections[midSegmentIndex]) /
            (normalizedProjections[midSegmentIndex + 1] - normalizedProjections[midSegmentIndex]);

        const p1 = coords[midSegmentIndex];
        const p2 = coords[midSegmentIndex + 1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // Carve a gap sized to fit the "MFP" label at the current scale (half
        // text width + 4px padding per side), not a fixed fraction of the segment.
        const mfpFont = fontStyle;
        const mfpScale = featureLabelScale(f, resolution);
        const mfpTextWidthPx = getTextWidth('MFP', mfpFont, mfpScale);
        const mfpHalfGapPx = mfpTextWidthPx / 2 + 4;
        const gapRatio = (mfpHalfGapPx * resolution) / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
        }
        // Normalize to [-π, π)
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        styles.push(new Style(
            {
                geometry: new Point(midGap), // dummy point
                text: new Text({
                    text: 'MFP',
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: mfpScale,
                    stroke: haloStroke,
                }),
            },
        ));

        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({
                color: getColorByHostility(hostility),
                width: LINE_WIDTH,
            }),
        });

        const afterStart = coords[1];
        // Date label: center offset = half text height + 8px so nearest edge is 8px from line
        const dateOffsetPx = 12 * mfpScale + 8;
        let startDateLabelCoordinate = offsetCoordinatesUp(start, afterStart, -resolution, dateOffsetPx);
        let startRotation = getRotation(start, afterStart);
        styles.push(new Style(
            {
                geometry: new Point(startDateLabelCoordinate), // anchored at the line's start
                text: new Text({
                    text: dateLabel,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: startRotation,
                    // Left-align so the DTG text begins exactly at the line's start,
                    // matching the visual convention for MunitionFlightPath.
                    textAlign: 'left',
                    textBaseline: 'middle',
                    scale: mfpScale,
                    stroke: haloStroke,
                }),
            },
        ));
        // Base layers
        styles.push(outlineStyle);
        return styles;
    };
}

const dashStyle = (labels: GraphicLabels) => {
    return (labels.status === TacticalGraphicStatus.planned ||
        (labels.hostility === TacticalGraphicHostility.hostileFaker
            && labels.confidence === TacticalGraphicConfidence.suspected
        )
    ) ? [12, 8] : undefined;
};

/**
 * Create a single feature with a style function
 * that draws labels at each segment midpoint with rotation.
 */
export function boundariesStyleFunc(): StyleFunction {
    return (f, resolution) => boundariesStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function boundariesStyleFromLabels(labels: GraphicLabels): StyleFunction {
    const topLabel = formatFullLabel(labels.label, labels.countryCode ?? '');
    const botLabel = formatFullLabel(labels.secondId ?? '', labels.secondCountryCode ?? '');
    return (f, resolution) => {
        const geom = f.getGeometry() as MultiPoint;
        const coords = geom.getCoordinates();

        const styles: Style[] = [];
        const hostility = f.get('hostility') || TacticalGraphicHostility.unknown;
        const echelon = f.get('echelon') || TacticalGraphicEchelon.unknown;

        const outlineSegments: Coordinate[][] = [];

        const start = coords[0];
        const end = coords[coords.length - 1];

        // Compute the total baseline vector (start → end)
        const baseDx = end[0] - start[0];
        const baseDy = end[1] - start[1];
        const baseLen = Math.hypot(baseDx, baseDy);

        // Project each vertex onto that baseline to get cumulative "linear" distance
        const projectedDistances = coords.map(([x, y]) => {
            const vx = x - start[0];
            const vy = y - start[1];
            return (vx * baseDx + vy * baseDy) / baseLen; // scalar projection
        });

        // 4️⃣ Normalize to 0 → baseLen range
        const minProj = Math.min(...projectedDistances);
        const maxProj = Math.max(...projectedDistances);
        const normalizedProjections = projectedDistances.map(d => (d - minProj) / (maxProj - minProj));

        // Find segment that crosses the projected midpoint (0.5)
        const half = 0.5;
        let midSegmentIndex = 0;
        for (let i = 0; i < normalizedProjections.length - 1; i++) {
            if (normalizedProjections[i] <= half && normalizedProjections[i + 1] >= half) {
                midSegmentIndex = i;
                break;
            }
        }

        for (let i = 0; i < coords.length - 1; i++) {
            if (i !== midSegmentIndex) {
                outlineSegments.push([coords[i], coords[i + 1]]);
            }
        }

        // Interpolate along that segment
        const t1 =
            (half - normalizedProjections[midSegmentIndex]) /
            (normalizedProjections[midSegmentIndex + 1] - normalizedProjections[midSegmentIndex]);

        const p1 = coords[midSegmentIndex];
        const p2 = coords[midSegmentIndex + 1];

        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        // 4) carve a central gap — match StrongPoint approach:
        //    10% of the segment on each side of center + 10px scaled pixel padding
        const echelonScale = featureLabelScale(f, resolution);
        const GAP_PX = 10;
        const gapHalfMap = 0.1 * segLen + GAP_PX * echelonScale * resolution;
        const gapRatio = gapHalfMap / segLen;

        const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
        const gapB: Coordinate = [p1[0] + dx * (t1 + gapRatio), p1[1] + dy * (t1 + gapRatio)];
        let rotation = -Math.atan2(dy, dx);

        // Keep text upright. Track the flip so the perpendicular direction
        // stays consistent with the corrected reading direction.
        let perpSign = 1;
        if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
            rotation += Math.PI;
            perpSign = -1;
        }
        // Normalize to [-π, π)
        if (rotation > Math.PI) rotation -= 2 * Math.PI;

        // keep the two side pieces of that segment
        outlineSegments.push([p1, gapA], [gapB, p2]);

        // 5) compute the center of the gap for the dot
        const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

        // Offset label so its near edge clears the echelon with a proportional gap.
        // All three components scale together with labelScale so the layout stays
        // visually identical at every zoom level:
        //   anchor_px = (half_font_height + echelon_perp_extent + gap) * labelScale
        // With textBaseline:'middle', the near text edge is half_font_height px
        // closer to the line than the anchor, leaving `gap` px between it and the
        // echelon edge.
        // const GAP_PX = 8;
        const labelScale = featureLabelScale(f, resolution);
        const echelonPerpBasePx = getEchelonPerpExtentPx(echelon);
        const anchorMap = (BASE_FONT_SIZE_PX / 2 + echelonPerpBasePx + GAP_PX) * labelScale * resolution;
        // Perpendicular unit vector, negated when rotation was flipped to keep
        // top/bottom labels on the correct sides regardless of segment direction.
        const len = Math.hypot(dx, dy);

        const nx = perpSign * (-dy / len);
        const ny = perpSign * (dx / len);
        const topLabelCoordinate = [midGap[0] + nx * anchorMap, midGap[1] + ny * anchorMap];
        const bottomLabelCoordinate = [midGap[0] - nx * anchorMap, midGap[1] - ny * anchorMap];

        styles.push(new Style(
            {
                geometry: new Point(topLabelCoordinate),
                text: new Text({
                    text: topLabel,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: labelScale,
                    stroke: haloStroke,
                }),
            },
        ));
        styles.push(new Style(
            {
                geometry: new Point(bottomLabelCoordinate),
                text: new Text({
                    text: botLabel,
                    font: fontStyle,
                    fill: new Fill({color: getLabelFillColor()}),
                    rotation: rotation,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    scale: labelScale,
                    stroke: haloStroke,
                }),
            },
        ));
        // 6) build styles for the echelon in the middle
        const echelonStyles = createEchelonStyles(midGap, dx, dy, resolution, echelon, getColorByHostility(TacticalGraphicHostility.unknown), echelonScale);
        styles.push(...echelonStyles);


        const outlineStyle = new Style({
            geometry: new MultiLineString(outlineSegments),
            stroke: new Stroke({
                color: getColorByHostility(hostility),
                width: LINE_WIDTH,
                lineDash: dashStyle(labels),
            }),
        });
        // Base layers
        styles.push(outlineStyle);

        return styles;
    };
}


export function getFullLabel(graphicName: TacticalGraphicName, customName: string): string {
    const prefix = getLabel(graphicName);
    return formatFullLabel(prefix, customName);
}

export function formatFullLabel(prefix: string, name: string): string {
    return prefix ? `${prefix} ${name}`.trim() : name;

}

export function getDateLabel(graphicLabels: GraphicLabels): string {
    let start = graphicLabels.startDate;
    let end = graphicLabels.endDate;
    const hasStart = !!start && start.trim() !== '';
    const hasEnd = !!end && end.trim() !== '';

    if (hasStart && hasEnd) {
        return `${start} - ${end}`;
    }

    if (hasStart) return start!;
    if (hasEnd) return end!;

    return '';
}

export function getAreaLabelStylesFn(name: TacticalGraphicName): StyleFunction {
    return (f, resolution) => getAreaLabelStylesFromLabels(name, readGraphicLabels(f))(f, resolution);
}

function getAreaLabelStylesFromLabels(name: TacticalGraphicName, labels: GraphicLabels): StyleFunction {
    const fullLabel = getFullLabel(name, labels.label ?? '');
    const dateLabel = getDateLabel(labels);
    switch (name) {
        case TacticalGraphicName.HighDensityAirspaceControlZone:
        case TacticalGraphicName.RestrictedOperationsZone:
        case TacticalGraphicName.AirToAirRefuelingRestrictedOperationsZone:
        case TacticalGraphicName.UnmannedAircraftRestrictedOperationsZone:
        case TacticalGraphicName.WeaponEngagementZone:
        case TacticalGraphicName.JointEngagementZone:
        case TacticalGraphicName.MissileEngagementZone:
        case TacticalGraphicName.LowAltitudeMissileEngagementZone:
        case TacticalGraphicName.HighAltitudeMissileEngagementZone:
        case TacticalGraphicName.ShortRangeAirDefenseEngagementZone:
            return airCoordinatingAreaStyleFunc(getLabel(name), labels, false);
        case TacticalGraphicName.WeaponsFreeZone:
            return airCoordinatingAreaStyleFunc(getLabel(name), labels, true);
        case TacticalGraphicName.AirSpaceCoordinationAreaRectangular:
        case TacticalGraphicName.AirSpaceCoordinationAreaIrregular:
        case TacticalGraphicName.AirSpaceCoordinationAreaCircular:
            labels.eff = dateLabel;
            return airspaceCoordinationAreaStyle(fullLabel, labels);
        case TacticalGraphicName.Airfield:
            return getAirfieldStyle(fullLabel, dateLabel);
        case TacticalGraphicName.NoFireAreaRectangular:
        case TacticalGraphicName.NoFireAreaCircular:
        case TacticalGraphicName.NoFireAreaIrregular:
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                const scale = featureLabelScale(feature, resolution);
                const lines: string[] = [];
                if (fullLabel?.trim()) lines.push(fullLabel.trim());
                if (dateLabel?.trim()) lines.push(dateLabel.trim());
                if (lines.length === 0) return [];
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: haloStroke,
                        padding: [4, 8, 4, 8],
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        case TacticalGraphicName.PositionAreaArtilleryCircular:
        case TacticalGraphicName.PositionAreaArtilleryIrregular:
        case TacticalGraphicName.PositionAreaArtilleryRectangular:
            // PAA shows four "PAA" labels anchored at the top, bottom, left, and
            // right of the geometry's bounding box (stored on the label feature
            // by the base classes).
            return (feature: FeatureLike, resolution: number) => {
                const minX = feature.get('polygonMinX') as number | undefined;
                const minY = feature.get('polygonMinY') as number | undefined;
                const maxX = feature.get('polygonMaxX') as number | undefined;
                const maxY = feature.get('polygonMaxY') as number | undefined;
                if (minX === undefined || minY === undefined || maxX === undefined || maxY === undefined) return [];
                const scale = featureLabelScale(feature, resolution);
                const cx = (minX + maxX) / 2;
                const cy = (minY + maxY) / 2;
                const positions: Array<[number, number]> = [
                    [cx, maxY], // top edge midpoint
                    [cx, minY], // bottom edge midpoint
                    [minX, cy], // left edge midpoint
                    [maxX, cy], // right edge midpoint
                ];
                const styles: Style[] = positions.map(pos => new Style({
                    geometry: new Point(pos),
                    text: new Text({
                        text: 'PAA',
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: haloStroke,
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                }));

                // Name + DTG label centered on the label feature's anchor point
                // (matches FreeFireArea's treatment).
                const anchorPoint = feature.getGeometry() as Point;
                const lines: string[] = [];
                if (fullLabel?.trim()) lines.push(fullLabel.trim());
                if (dateLabel?.trim()) lines.push(dateLabel.trim());
                if (anchorPoint && lines.length > 0) {
                    styles.push(new Style({
                        geometry: anchorPoint,
                        text: new Text({
                            text: lines.join('\n'),
                            font: fontStyle,
                            fill: new Fill({color: getLabelFillColor()}),
                            stroke: haloStroke,
                            textAlign: 'center',
                            textBaseline: 'middle',
                            scale,
                        }),
                    }));
                }

                return styles;
            };
        case TacticalGraphicName.FireSupportAreaIrregular:
            // FSA Irregular: stack "FSA" / name / DTG1 / DTG2 in a single Text
            // centered at the polygon centroid. Using "\n" instead of separate
            // styles keeps the line spacing tied to the font, so the lines
            // don't drift apart and overlap when the user zooms in (the
            // default getAreaLabelStyles uses a fixed 18px offsetY which
            // collides with text growing past 18px at high zoom).
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                if (!anchorPoint) return [];
                const scale = featureLabelScale(feature, resolution);
                const lines = [
                    fullLabel.trim(),
                    (labels.startDate ?? '').trim(),
                    (labels.endDate ?? '').trim(),
                ].filter(s => s && s.length > 0);
                if (lines.length === 0) return [];
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: haloStroke,
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        case TacticalGraphicName.FireSupportAreaRectangular:
        case TacticalGraphicName.FireSupportAreaCircular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneRectangular:
        case TacticalGraphicName.ArtilleryTargetIntelligenceZoneCircular:
        case TacticalGraphicName.CriticalFriendlyZoneIrregular:
        case TacticalGraphicName.CriticalFriendlyZoneRectangular:
        case TacticalGraphicName.CriticalFriendlyZoneCircular:
        case TacticalGraphicName.CensorZoneIrregular:
        case TacticalGraphicName.CensorZoneRectangular:
        case TacticalGraphicName.CensorZoneCircular:
        case TacticalGraphicName.CallForFireZoneIrregular:
        case TacticalGraphicName.CallForFireZoneRectangular:
        case TacticalGraphicName.CallForFireZoneCircular:
        case TacticalGraphicName.DeadSpaceAreaIrregular:
        case TacticalGraphicName.DeadSpaceAreaRectangular:
        case TacticalGraphicName.DeadSpaceAreaCircular:
        case TacticalGraphicName.BlueKillBoxIrregular:
        case TacticalGraphicName.BlueKillBoxRectangular:
        case TacticalGraphicName.BlueKillBoxCircular:
        case TacticalGraphicName.PurpleKillBoxIrregular:
        case TacticalGraphicName.PurpleKillBoxRectangular:
        case TacticalGraphicName.PurpleKillBoxCircular:
            // FSA Rect / Circle (and ATI ZONE / CF ZONE / CENSOR ZONE / CFF
            // ZONE / DA / BKB / PKB irregular, rect & circle variants — same
            // layout, the prefix shown comes from getLabel(name)): "<PREFIX>"
            // and name on separate lines, centered inside the shape. The two
            // DTGs (W / W1) stack outside on the top-left of its bounding box,
            // to the left of the left edge, top-aligned with the top edge.
            // For the circle the bounding box is the imaginary square hugging
            // the circle; for an irregular polygon it is the geometry's axis-
            // aligned extent (stored on the label feature by AreaGraphicBase).
            return (feature: FeatureLike, resolution: number) => {
                const styles: Style[] = [];
                const scale = featureLabelScale(feature, resolution);

                const anchorPoint = feature.getGeometry() as Point;
                const prefix = getLabel(name);
                const nameLines = [prefix, (labels.label ?? '').trim()].filter(s => s && s.length > 0);
                if (anchorPoint && nameLines.length > 0) {
                    styles.push(new Style({
                        geometry: anchorPoint,
                        text: new Text({
                            text: nameLines.join('\n'),
                            font: fontStyle,
                            fill: new Fill({color: getLabelFillColor()}),
                            stroke: haloStroke,
                            textAlign: 'center',
                            textBaseline: 'middle',
                            scale,
                        }),
                    }));
                }

                const dtg1 = (labels.startDate ?? '').trim();
                const dtg2 = (labels.endDate ?? '').trim();
                let dtgAnchor: Coordinate | undefined;
                const isIrregularZone =
                    name === TacticalGraphicName.ArtilleryTargetIntelligenceZoneIrregular ||
                    name === TacticalGraphicName.CriticalFriendlyZoneIrregular ||
                    name === TacticalGraphicName.CensorZoneIrregular ||
                    name === TacticalGraphicName.CallForFireZoneIrregular ||
                    name === TacticalGraphicName.DeadSpaceAreaIrregular ||
                    name === TacticalGraphicName.BlueKillBoxIrregular ||
                    name === TacticalGraphicName.PurpleKillBoxIrregular;
                if (isIrregularZone) {
                    // Irregular zones: anchor on the actual upper-leftmost
                    // vertex of the polygon. Using the bounding-box corner
                    // (polygonMinX / polygonMaxY) is misleading for irregular
                    // shapes — that point can sit far away from the geometry.
                    // "Upper-left vertex" = smallest X; ties broken by largest Y.
                    const ring = feature.get('polygonRing') as Coordinate[] | undefined;
                    if (ring && ring.length > 0) {
                        let best = ring[0];
                        for (let i = 1; i < ring.length; i++) {
                            const v = ring[i];
                            if (v[0] < best[0] || (v[0] === best[0] && v[1] > best[1])) {
                                best = v;
                            }
                        }
                        dtgAnchor = best;
                    }
                } else {
                    // FSA / rect / circle: bounding-box corner is the right
                    // anchor (a rectangle's top-left is a vertex, and a circle
                    // has no vertices — the imaginary square hugging it works).
                    const minX = feature.get('polygonMinX') as number | undefined;
                    const maxY = feature.get('polygonMaxY') as number | undefined;
                    if (minX !== undefined && maxY !== undefined) {
                        dtgAnchor = [minX, maxY];
                    }
                }
                if (dtgAnchor && (dtg1 || dtg2)) {
                    const dtgText = [dtg1, dtg2].filter(s => s.length > 0).join('-\n');
                    styles.push(new Style({
                        geometry: new Point(dtgAnchor),
                        text: new Text({
                            text: dtgText,
                            font: fontStyle,
                            fill: new Fill({color: getLabelFillColor()}),
                            stroke: haloStroke,
                            textAlign: 'right',
                            textBaseline: 'top',
                            offsetX: -10,
                            scale,
                        }),
                    }));
                }
                return styles;
            };
        case TacticalGraphicName.GroupOrSeriesOfTargets:
            // Group/Series of Targets: name label sits ON the polygon's
            // northern-most segment, centered along it and rotated to follow
            // the segment direction. AreaGraphicBase parks the labels feature
            // at that segment's midpoint, so feature.getGeometry() is already
            // the anchor and labelSegmentA/B give the rotation axis.
            return (feature: FeatureLike, resolution: number) => {
                const a = feature.get('labelSegmentA') as Coordinate | undefined;
                const b = feature.get('labelSegmentB') as Coordinate | undefined;
                const point = feature.getGeometry() as Point;
                if (!a || !b || !point || !fullLabel?.trim()) return [];
                return [new Style({
                    geometry: point,
                    text: new Text({
                        text: fullLabel.trim(),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: haloStroke,
                        textAlign: 'center',
                        textBaseline: 'middle',
                        rotation: getRotation(a, b),
                        scale: featureLabelScale(feature, resolution),
                    }),
                })];
            };
        case TacticalGraphicName.SmokeObscurant:
            // Smoke obscurant labels: name / SMOKE / DTG1- / DTG2 stacked at the
            // polygon centroid in a single Text so the line spacing tracks the
            // font scale at every zoom. Present and Planned share the label
            // layout — Planned just renders the outline dashed (handled in
            // getStyle).
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                if (!anchorPoint) return [];
                const scale = featureLabelScale(feature, resolution);
                const userName = (labels.label ?? '').trim();
                const dtg1 = (labels.startDate ?? '').trim();
                const dtg2 = (labels.endDate ?? '').trim();
                const lines: string[] = [];
                if (userName) lines.push(userName);
                lines.push('SMOKE');
                if (dtg1) lines.push(dtg2 ? `${dtg1}-` : dtg1);
                if (dtg2) lines.push(dtg2);
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: haloStroke,
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        case TacticalGraphicName.FreeFireAreaCircular:
        case TacticalGraphicName.FreeFireAreaIrregular:
        case TacticalGraphicName.FreeFireAreaRectangular:
        case TacticalGraphicName.RestrictiveFireAreaCircular:
        case TacticalGraphicName.RestrictiveFireAreaIrregular:
        case TacticalGraphicName.RestrictiveFireAreaRectangular:
            // All FireSupportCoordination polygon labels share the opaque-white
            // halo treatment (matches LimitedAccessArea), and both lines render
            // in a single Text via "\n" so their spacing scales with the font
            // instead of drifting at different zoom levels. This only affects
            // label rendering — hatch fill still applies to NoFireArea only.
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                const scale = featureLabelScale(feature, resolution);
                const lines: string[] = [];
                if (fullLabel?.trim()) lines.push(fullLabel.trim());
                if (dateLabel?.trim()) lines.push(dateLabel.trim());
                if (lines.length === 0) return [];
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: haloStroke,
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        case TacticalGraphicName.LimitedAccessArea:
            return (feature: FeatureLike, resolution: number) => {
                const anchorPoint = feature.getGeometry() as Point;
                const scale = featureLabelScale(feature, resolution);
                const lines: string[] = [];
                if (fullLabel?.trim()) lines.push(fullLabel.trim());
                if (dateLabel?.trim()) lines.push(dateLabel.trim());
                if (lines.length === 0) return [];
                return [new Style({
                    geometry: anchorPoint,
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill: new Fill({color: getLabelFillColor()}),
                        stroke: haloStroke,
                        padding: [4, 8, 4, 8],
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                })];
            };
        default:
            return getAreaLabelFn(fullLabel, dateLabel);
    }
}

export function getAirfieldStyle(fullLabel: string, dateLabel: string): StyleFunction {
    return (f, res) => {
        let styles = getAreaLabelStyles(f, res, fullLabel, dateLabel, 0, 36);
        const svg = `M -200000 0 L 200000 0 M -200000 -120000 L 200000 120000`;
        let {geometry} = svgToOpenLayersGeometry(svg, (f.getGeometry() as Point).getCoordinates());
        styles.push(new Style({
            geometry: geometry,
            stroke: new Stroke({
                color: getDefaultLineColor(),
                width: LINE_WIDTH,
            }),
        }));

        return styles;
    };
}

export function getAreaLabelStyles(feature: FeatureLike, resolution: number, textLabel: string, dateLabel: string, rotation: number, offsetY: number = 0) {
    const geom = feature.getGeometry() as Point;
    let styles = [];

    styles.push(new Style({
        geometry: geom,
        text: new Text({
            rotation: rotation,
            text: textLabel,
            font: fontStyle,
            offsetY: offsetY,
            fill: new Fill({color: getLabelFillColor()}),
            scale: featureLabelScale(feature, resolution),
            stroke: haloStroke,
        }),
    }));

    styles.push(new Style({
        geometry: geom,
        text: new Text({
            rotation: rotation,
            text: dateLabel,
            font: fontStyle,
            fill: new Fill({color: getLabelFillColor()}),
            scale: featureLabelScale(feature, resolution),
            offsetY: 18 + offsetY,
            stroke: haloStroke,
        }),
    }));
    return styles;
}

export function getAreaLabelFn(textLabel: string, dateLabel: string, rotation: number = 0): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        return getAreaLabelStyles(feature, resolution, textLabel, dateLabel, rotation);
    };
}

/**
 * Generates an array of OpenLayers Style objects to position and format
 * the complex text labels on a polygon feature.
 * * The function uses multiple ol/style/Text objects with calculated pixel
 * offsets to create the multi-line, multi-column layout shown in the diagram.
 * Text is omitted if the corresponding value is not provided in the data.
 *
 * @param identifier
 * @param {GraphicLabels} labels The parameterized label values (A, T, X, X1, W, W1).
 * @returns {StyleFunction} An array of OpenLayers Style objects for the labels.
 */
export function airspaceCoordinationAreaStyle(
    identifier: string,
    labels: GraphicLabels,
): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        const anchorPoint = feature.getGeometry() as Point;

        // ── Build text block ──────────────────────────────────────────────────
        const nameLines: string[] = [];
        if (identifier?.trim())    nameLines.push(identifier.trim());
        if (labels.secondId?.trim()) nameLines.push(labels.secondId.trim());

        const altLines: string[] = [];
        if (labels.minAltitude) altLines.push(`${'MIN ALT:'.padEnd(11)}${labels.minAltitude}`);
        if (labels.maxAltitude) altLines.push(`${'MAX ALT:'.padEnd(11)}${labels.maxAltitude}`);
        if (labels.grid)        altLines.push(`${'GRID:'.padEnd(11)}${labels.grid}`);
        if (labels.eff)         altLines.push(`${'EFF'.padEnd(11)}${labels.eff}`);

        const allLines = (nameLines.length > 0 && altLines.length > 0)
            ? [...nameLines, '', ...altLines]
            : [...nameLines, ...altLines];

        if (allLines.length === 0) return [];

        // ── Measure widest line at scale = 1 ─────────────────────────────────
        textMeasureCtx.font = fontStyle;
        const maxLineWidth = Math.max(...allLines.map(l => l ? textMeasureCtx.measureText(l).width : 0));

        // ── Fit-to-polygon scale cap ──────────────────────────────────────────
        // Use the shorter bounding-box dimension so the block stays inside the
        // polygon at every zoom level. Falls back to featureLabelScale alone when
        // the extent hasn't been stored yet (e.g. first render).
        const extW = feature.get('polygonExtentWidth')  as number | undefined;
        const extH = feature.get('polygonExtentHeight') as number | undefined;
        let fitScale = Infinity;
        if (extW && extH && maxLineWidth > 0) {
            const availablePx = Math.min(extW, extH) / resolution * 0.80;
            fitScale = availablePx / maxLineWidth;
        }
        const scale = Math.min(featureLabelScale(feature, resolution), fitScale);

        // ── Center the left-aligned block at the interior point ───────────────
        const offsetX = -(maxLineWidth * scale) / 2;

        return [new Style({
            geometry: anchorPoint,
            text: new Text({
                text: allLines.join('\n'),
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                stroke: haloStroke,
                textAlign: 'left',
                textBaseline: 'middle',
                offsetX,
                scale,
            }),
        })];
    };
}


export function getMissionTaskStyleFn(textLabel: string, rotation: number = 0): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        const geom = feature.getGeometry() as Point;
        let styles = [];

        styles.push(new Style({
            geometry: geom,
            text: new Text({
                rotation: rotation,
                text: textLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                scale: featureLabelScale(feature, resolution),
                stroke: haloStroke,
            }),
        }));

        return styles;

    };
}

/**
 * Mission-task label rendered with the same 24px base font as the
 * ratio-locked block-family graphics. Scale tracks the circle radius
 * (`graphicSize`) so the label grows with the graphic, tuned so a
 * 50px-radius circle (the 100px-diameter floor) renders the label at
 * ~22.5px tall — matching the block-family label size at their minimum.
 */
export function getRatioLockedMissionTaskStyleFn(textLabel: string): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        const geom = feature.getGeometry() as Point;
        const radius = feature.get('graphicSize') as number | undefined;
        const sizeFactor = getDefaultLabelSize() / BASE_FONT_SIZE_PX;
        let scale: number;
        if (radius && radius > 0) {
            const radiusPx = radius / resolution;
            const K = 0.3;
            scale = sizeFactor * K * radiusPx / BASE_FONT_SIZE_PX;
        } else {
            scale = featureLabelScale(feature, resolution);
        }
        return [new Style({
            geometry: geom,
            text: new Text({
                text: textLabel,
                font: 'bold 24px sans-serif',
                fill: new Fill({color: getLabelFillColor()}),
                scale,
                stroke: haloStroke,
                textAlign: 'center',
                textBaseline: 'middle',
            }),
        })];
    };
}

/**
 * Label-style function for the doctrinal weapon/sensor range fans.
 *
 * MultiPoint vertex layout, written by `RangeFan.generateLabels` and
 * mirrored on the OL feature by `RangeFanGraphicBase.updateGeometry`:
 *   circular: [center, band1Mid, band2Mid, ...]
 *   sector:   [center, band1Mid, band1LeftAz, band1RightAz,
 *                       band2Mid, band2LeftAz, band2RightAz, ...]
 * The bands array stamped on the label feature carries the resolved
 * azimuth values for each sector band so this fn doesn't need to re-run
 * the resolver.
 */
export function getRangeFanLabelStyleFn(
    name: TacticalGraphicName,
): StyleFunction {
    return (feature: FeatureLike, resolution: number) => {
        const geom = feature.getGeometry();
        if (!(geom instanceof MultiPoint)) return [];
        const coords = geom.getCoordinates();
        if (coords.length < 2) return [];

        const bands = feature.get('rangeFanBands') as
            | Array<{
                  range: number;
                  label?: string;
                  altitude?: string;
                  /** Resolved absolute compass bearings — written by
                   * RangeFanGraphicBase / RangeFan.generateLabels for the
                   * style fn to print. The raw user-facing fields on each
                   * band are deflections from the global center. */
                  resolvedLeftAz?: number;
                  resolvedRightAz?: number;
              }>
            | undefined;
        if (!bands || bands.length === 0) return [];

        const shape = feature.get('rangeFanShape') as 'circular' | 'sector' | undefined;
        const isSector = shape === 'sector' && name === TacticalGraphicName.WeaponSensorRangeFanSector;
        // Sector packs three vertices per band (mid + leftAz + rightAz);
        // circular packs one (mid only).
        const stride = isSector ? 3 : 1;

        const scale = featureLabelScale(feature, resolution);
        const fill = new Fill({color: getLabelFillColor()});
        const styles: Style[] = [];

        // Per-band labels. Layout per shape:
        //   circular — user label (if any), then "MIN RG <km>",
        //              then "ALT <altitude>" if entered.
        //   sector   — user label (if any), then "RG <km>",
        //              then "ALT <altitude>" if entered, plus per-band
        //              azimuth labels at the arc edges.
        // The auto range line renders even when no name is typed. Range
        // values are stored in kilometers.
        for (let i = 0; i < bands.length; i++) {
            const midIdx = 1 + i * stride;
            if (midIdx >= coords.length) break;
            const band = bands[i];
            const lines: string[] = [];
            const labelText = band.label?.trim();
            if (labelText) lines.push(labelText);
            if (shape === 'circular') {
                lines.push(`MIN RG ${formatKm(band.range)}`);
            } else if (isSector) {
                lines.push(`RG ${formatKm(band.range)}`);
            }
            const altText = band.altitude?.trim();
            if (altText) lines.push(`ALT ${altText}`);
            if (lines.length > 0) {
                styles.push(new Style({
                    geometry: new Point(coords[midIdx]),
                    text: new Text({
                        text: lines.join('\n'),
                        font: fontStyle,
                        fill,
                        stroke: haloStroke,
                        textAlign: 'center',
                        textBaseline: 'middle',
                        scale,
                    }),
                }));
            }

            // Sector: per-band azimuth text at vertices (3i+2) and (3i+3).
            // Format matches FM 1-02.2 examples ("315", "030").
            if (isSector) {
                const leftIdx = midIdx + 1;
                const rightIdx = midIdx + 2;
                if (leftIdx < coords.length && band.resolvedLeftAz !== undefined) {
                    styles.push(new Style({
                        geometry: new Point(coords[leftIdx]),
                        text: new Text({
                            text: formatAzimuth(band.resolvedLeftAz),
                            font: fontStyle,
                            fill,
                            stroke: haloStroke,
                            textAlign: 'center',
                            textBaseline: 'middle',
                            scale,
                        }),
                    }));
                }
                if (rightIdx < coords.length && band.resolvedRightAz !== undefined) {
                    styles.push(new Style({
                        geometry: new Point(coords[rightIdx]),
                        text: new Text({
                            text: formatAzimuth(band.resolvedRightAz),
                            font: fontStyle,
                            fill,
                            stroke: haloStroke,
                            textAlign: 'center',
                            textBaseline: 'middle',
                            scale,
                        }),
                    }));
                }
            }
        }

        return styles;
    };
}

function formatAzimuth(deg: number): string {
    let n = Math.round(deg) % 360;
    if (n < 0) n += 360;
    return String(n).padStart(3, '0');
}

/** Range bands are stored in km; print them dropping a trailing .0. */
function formatKm(km: number): string {
    if (!Number.isFinite(km)) return '0';
    return Number.isInteger(km) ? String(km) : km.toFixed(1);
}

function getOffset(distance: number, rotation: number): [number, number] {
    const offsetX = Math.cos(rotation) * distance;
    const offsetY = Math.sin(rotation) * distance;
    return [offsetX, offsetY];
}

export function getSecurityOperationLabelStyle(textLabel: string, rotation: number = 0, position: 'left' | 'right' = 'left'): StyleFunction {
    return (feature, resolution) => {
        const orientation = position === 'left' ? 1 : -1;

        const [offsetX, offsetY] = getOffset(0.5 * orientation, rotation);
        return new Style({
            text: new Text({
                rotation: rotation,
                text: textLabel,
                font: fontStyle,
                fill: new Fill({color: getLabelFillColor()}),
                textBaseline: 'middle',
                scale: featureLabelScale(feature, resolution),
                offsetX,
                offsetY,
                stroke: haloStroke,
            }),
        });
    };
}

export const createFeatureWithDashedLines = () => {
    let feature = new Feature();

    const style = new Style({
        stroke: new Stroke({
            color: getDefaultLineColor(),
            width: LINE_WIDTH,
            lineDash: [4, 4],
        }),
    });

    feature.setStyle(style);
    return feature;
};

function generateCrossTiesForPolygon(polygon: Polygon | MultiLineString, resolution: number, color: string) {
    const styles: any[] = [];
    const tieSpacing = 10 * resolution; // Distance between ties
    const tieLength = 10 * resolution; // Half-length of each cross tie

    const rings = polygon.getCoordinates(); // [ [ [x, y], ... ], [hole1], [hole2], ... ]

    rings.forEach((ring: Coordinate[]) => {
        let totalDistance = 0;
        let lastTieDistance = 0;

        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = ring[i];
            const p2 = ring[i + 1];

            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (segmentLength === 0) continue;

            const segmentStart = totalDistance;
            const segmentEnd = totalDistance + segmentLength;

            while (lastTieDistance + tieSpacing <= segmentEnd) {
                const nextTieDistance = lastTieDistance + tieSpacing;

                if (nextTieDistance >= segmentStart) {
                    const t = (nextTieDistance - segmentStart) / segmentLength;
                    const x = p1[0] + t * dx;
                    const y = p1[1] + t * dy;

                    const perpX = -dy / segmentLength;
                    const perpY = dx / segmentLength;

                    const tieStart = [x, y];
                    const tieEnd = [x + perpX * tieLength, y + perpY * tieLength];

                    styles.push(
                        new Style({
                            geometry: new LineString([tieStart, tieEnd]),
                            stroke: new Stroke({
                                color: color,
                                width: LINE_WIDTH,
                            }),
                        }),
                    );
                }

                lastTieDistance = nextTieDistance;
            }

            totalDistance = segmentEnd;
        }
    });

    return styles;
}

// Define a type for the common computed results
interface GraphicGeometryData {
    /** The segments of the polygon outline, excluding the gap. */
    outlineSegments: Coordinate[][];
    /** The center point of the gap, where the echelon symbol will be placed. */
    midGap: Coordinate;
    /** The delta X component of the segment used for the gap. */
    dx: number;
    /** The delta Y component of the segment used for the gap. */
    dy: number;
    /** The length of the segment used for the gap. */
    segLen: number;
}

/**
 * Common logic to process the polygon geometry, find the open segment,
 * carve a gap, and prepare data for style generation.
 * @param geom The OpenLayers Polygon geometry.
 * @param rotation The rotation angle (0=east, π/2=north).
 * @param resolution The current map resolution (map units per pixel).
 * @returns An object containing the computed geometry data, or null if invalid.
 */
function getGraphicGeometryData(
    geom: Geometry,
    rotation: number,
    resolution: number,
): GraphicGeometryData | null {
    if (geom.getType() !== 'Polygon') {
        return null;
    }

    const unitRot: Coordinate = [Math.cos(rotation), Math.sin(rotation)];

    // 1) get the outer ring
    const ring: Coordinate[] = (geom as Polygon).getCoordinates()[0];
    if (ring.length < 2) {
        return null;
    }

    // 2) pick the segment whose outward normal best aligns with rotation
    let openIndex = 0;
    let bestDot = -Infinity;
    for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        const dx = x2 - x1,
            dy = y2 - y1;
        const segLen = Math.hypot(dx, dy);
        if (segLen === 0) continue;

        // polygon is CCW → outward normal = [-dy, dx]
        const nx = -dy / segLen;
        const ny = dx / segLen;
        const dot = nx * unitRot[0] + ny * unitRot[1];
        if (dot > bestDot) {
            bestDot = dot;
            openIndex = i;
        }
    }

    // endpoints of that opening segment
    const p1 = ring[openIndex];
    const p2 = ring[openIndex + 1];
    const dx = p2[0] - p1[0],
        dy = p2[1] - p1[1];
    const segLen = Math.hypot(dx, dy);

    // 3) outline all other edges
    const outlineSegments: Coordinate[][] = [];
    for (let i = 0; i < ring.length - 1; i++) {
        if (i !== openIndex) {
            outlineSegments.push([ring[i], ring[i + 1]]);
        }
    }

    // 4) carve a central gap in that opening side
    const GAP_PX = 10; // px gap on each side of the dot
    const gapMap = GAP_PX * resolution; // map-unit gap
    const gapRatio = gapMap / segLen;
    // t1 and t2 define the original fraction along the segment for the gap center
    const t1 = 0.4,
        t2 = 0.6;

    // Calculate gap endpoints adjusted by the map-unit gap
    const gapA: Coordinate = [p1[0] + dx * (t1 - gapRatio), p1[1] + dy * (t1 - gapRatio)];
    const gapB: Coordinate = [p1[0] + dx * (t2 + gapRatio), p1[1] + dy * (t2 + gapRatio)];

    // keep the two side pieces of that segment
    outlineSegments.push([p1, gapA], [gapB, p2]);

    // 5) compute the center of the gap for the dot
    const midGap: Coordinate = [(gapA[0] + gapB[0]) / 2, (gapA[1] + gapB[1]) / 2];

    return {
        outlineSegments,
        midGap,
        dx,
        dy,
        segLen,
    };
}

// Complete style function for OpenLayers
function railroadStyleFunction(feature: FeatureLike, resolution: number) {
    const geometry = feature.getGeometry();
    // Default to π/2 so the echelon sits on the southernmost segment.
    // The normal formula in getGraphicGeometryData is the inward normal, so the
    // target direction is inverted: pointing north (π/2) selects the south-facing edge.
    // ?? (not ||) ensures an explicit rotation of 0 (east) is still respected.
    const rotation: number = feature.get('rotation') ?? Math.PI / 2;

    const geoData = getGraphicGeometryData(geometry as Geometry, rotation, resolution);
    if (!geoData) {
        return [];
    }

    const styles = [];
    const {outlineSegments, midGap, dx, dy} = geoData;
    // 0 = east, π/2 = north, etc.
    const hostility = feature.get('hostility') || TacticalGraphicHostility.unknown;
    const echelon = feature.get('echelon') || TacticalGraphicEchelon.squad;

    // 6) build styles
    const outlineStyle = new Style({
        geometry: new MultiLineString(outlineSegments),
        stroke: new Stroke({color: getColorByHostility(hostility), width: LINE_WIDTH}),
    });
    // Base layers
    styles.push(outlineStyle);
    const echelonStyles = createEchelonStyles(midGap, dx, dy, resolution, echelon, getColorByHostility(hostility), featureLabelScale(feature, resolution));
    styles.push(...echelonStyles);
    const crossTies = generateCrossTiesForPolygon(new MultiLineString(outlineSegments), resolution, getColorByHostility(hostility));
    styles.push(...crossTies);

    return styles;
}

/** Returns the echelon symbol's half-extent perpendicular to the segment, in screen pixels (unscaled). */
function getEchelonPerpExtentPx(echelon: TacticalGraphicEchelon): number {
    const dotRadiusPx = 5;
    const lineHalfPx = 10;
    switch (echelon) {
        case TacticalGraphicEchelon.squad:
        case TacticalGraphicEchelon.section:
        case TacticalGraphicEchelon.platoonDetachment:
            return dotRadiusPx;
        case TacticalGraphicEchelon.companyBatteryTroop:
        case TacticalGraphicEchelon.battalionSquadron:
        case TacticalGraphicEchelon.regimentGroup:
        case TacticalGraphicEchelon.brigade:
            return lineHalfPx;
        default:
            return dotRadiusPx;
    }
}

/** Returns the echelon symbol's half-extent along the segment, in screen pixels. */
function getEchelonHalfExtentPx(echelon: TacticalGraphicEchelon): number {
    const dotRadiusPx = 5;
    const spacingPx = 12;
    const lineHalfPx = 10;
    switch (echelon) {
        case TacticalGraphicEchelon.squad:
            return dotRadiusPx;
        case TacticalGraphicEchelon.section:
        case TacticalGraphicEchelon.platoonDetachment:
            return spacingPx + dotRadiusPx;
        case TacticalGraphicEchelon.companyBatteryTroop:
            return 0;
        case TacticalGraphicEchelon.battalionSquadron:
        case TacticalGraphicEchelon.regimentGroup:
            return spacingPx;
        case TacticalGraphicEchelon.brigade:
            return lineHalfPx * Math.cos(Math.PI / 4);
        default:
            return dotRadiusPx;
    }
}

function createEchelonStyles(mid: Coordinate, dx: number, dy: number, resolution: number, echelon: TacticalGraphicEchelon, color: string, echelonScale: number = 1): Style[] {
    const segLen = Math.hypot(dx, dy);
    if (!segLen) return [];

    // unit tangent (along segment) & normal (perp to segment)
    const ux = dx / segLen;
    const uy = dy / segLen;
    const nx = -uy;
    const ny = ux;

    // common sizes — scaled so the echelon grows with zoom like the labels
    const dotRadius = 5 * echelonScale;           // px (CircleStyle radius is in px)
    const spacingPx = 12 * echelonScale;
    const lineHalfPx = 10 * echelonScale;

    // convert to map units
    const spacing = spacingPx * resolution;
    const lineHalf = lineHalfPx * resolution;

    const fillStyle = new Fill({color});
    const strokeStyle = new Stroke({color, width: LINE_WIDTH});

    const styles: Style[] = [];

    switch (echelon) {
        // single dot
        case TacticalGraphicEchelon.squad:
            styles.push(
                new Style({
                    geometry: new Point(mid),
                    image: new CircleStyle({radius: dotRadius, fill: fillStyle}),
                }),
            );
            break;

        // two dots along the segment
        case TacticalGraphicEchelon.section:
            [-1, 1].forEach(i => {
                const x = mid[0] + ux * spacing * i;
                const y = mid[1] + uy * spacing * i;
                styles.push(
                    new Style({
                        geometry: new Point([x, y]),
                        image: new CircleStyle({radius: dotRadius, fill: fillStyle}),
                    }),
                );
            });
            break;

        // three dots (-, center, +)
        case TacticalGraphicEchelon.platoonDetachment:
            [-1, 0, 1].forEach(i => {
                const x = mid[0] + ux * spacing * i;
                const y = mid[1] + uy * spacing * i;
                styles.push(
                    new Style({
                        geometry: new Point([x, y]),
                        image: new CircleStyle({radius: dotRadius, fill: fillStyle}),
                    }),
                );
            });
            break;

        // single perpendicular line
        case TacticalGraphicEchelon.companyBatteryTroop:
            styles.push(
                new Style({
                    geometry: new LineString([
                        [mid[0] - nx * lineHalf, mid[1] - ny * lineHalf],
                        [mid[0] + nx * lineHalf, mid[1] + ny * lineHalf],
                    ]),
                    stroke: strokeStyle,
                }),
            );
            break;

        // two parallel perpendicular lines
        case TacticalGraphicEchelon.battalionSquadron:
            [-1, 1].forEach(i => {
                // offset along segment, then draw perp line
                const cx = mid[0] + ux * spacing * i;
                const cy = mid[1] + uy * spacing * i;
                styles.push(
                    new Style({
                        geometry: new LineString([
                            [cx - nx * lineHalf, cy - ny * lineHalf],
                            [cx + nx * lineHalf, cy + ny * lineHalf],
                        ]),
                        stroke: strokeStyle,
                    }),
                );
            });
            break;

        // three parallel perpendicular lines
        case TacticalGraphicEchelon.regimentGroup:
            [-1, 0, 1].forEach(i => {
                const cx = mid[0] + ux * spacing * i;
                const cy = mid[1] + uy * spacing * i;
                styles.push(
                    new Style({
                        geometry: new LineString([
                            [cx - nx * lineHalf, cy - ny * lineHalf],
                            [cx + nx * lineHalf, cy + ny * lineHalf],
                        ]),
                        stroke: strokeStyle,
                    }),
                );
            });
            break;

        // X shape: two crossing lines (segment & its normal)
        case TacticalGraphicEchelon.brigade: {
            const angle = Math.PI / 4; // 45°
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // rotate tangent by +45°
            const vx1 = ux * cos - uy * sin;
            const vy1 = ux * sin + uy * cos;
            // rotate tangent by -45°
            const vx2 = ux * cos + uy * sin;
            const vy2 = -ux * sin + uy * cos;

            styles.push(
                new Style({
                    geometry: new LineString([
                        [mid[0] - vx1 * lineHalf, mid[1] - vy1 * lineHalf],
                        [mid[0] + vx1 * lineHalf, mid[1] + vy1 * lineHalf],
                    ]),
                    stroke: strokeStyle,
                }),
            );
            styles.push(
                new Style({
                    geometry: new LineString([
                        [mid[0] - vx2 * lineHalf, mid[1] - vy2 * lineHalf],
                        [mid[0] + vx2 * lineHalf, mid[1] + vy2 * lineHalf],
                    ]),
                    stroke: strokeStyle,
                }),
            );
            break;
        }

        default:
            // fallback to single dot
            styles.push(
                new Style({
                    geometry: new Point(mid),
                    image: new CircleStyle({radius: dotRadius, fill: fillStyle}),
                }),
            );
    }

    return styles;
}

export function battlePositionStyleFunction(labels: GraphicLabels, feature: FeatureLike, resolution: number): Style[] {
    const geometry = feature.getGeometry();
    // Default to π/2 so the echelon sits on the southernmost segment.
    // getGraphicGeometryData uses the inward normal, so pointing north (π/2) selects the south-facing edge.
    const rotation: number = feature.get('rotation') ?? Math.PI / 2;
    const geoData = getGraphicGeometryData(geometry as Geometry, rotation, resolution);
    if (!geoData) {
        return [];
    }

    const hostility = feature.get('hostility') || TacticalGraphicHostility.unknown;
    const echelon = feature.get('echelon') || TacticalGraphicEchelon.squad;
    const {outlineSegments, midGap, dx, dy} = geoData;

    const isPlanned = labels.status === TacticalGraphicStatus.planned;

    // 6) build styles
    const outlineStyle = new Style({
        geometry: new MultiLineString(outlineSegments),
        stroke: new Stroke({
            color: getColorByHostility(hostility),
            width: LINE_WIDTH,
            lineDash: isPlanned ? [12, 8] : undefined
        }),
    });

    const echelonStyles = createEchelonStyles(midGap, dx, dy, resolution, echelon, getColorByHostility(hostility), featureLabelScale(feature, resolution));

    return [outlineStyle, ...echelonStyles];
}

export const getColorByHostility = (hostility: TacticalGraphicHostility): string => {
    switch (hostility) {
        case TacticalGraphicHostility.friend:
        case TacticalGraphicHostility.assumedFriend:
            return 'rgba(0, 0, 255, 1)';
        case TacticalGraphicHostility.hostileFaker:
            return 'rgba(255, 0, 0, 1)';
        case TacticalGraphicHostility.neutral:
            return 'rgba(0, 128, 0, 1)';
        case TacticalGraphicHostility.pending:
        case TacticalGraphicHostility.suspectJoker:
            return 'rgba(255, 255, 0, 1)';
        case TacticalGraphicHostility.unknown:
        default:
            return getDefaultLineColor();
    }
};

function withOpacity(color: string, alpha: number): string {
    // rgb()/rgba()
    const rgb = color.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/,
    );
    if (rgb) {
        const [, r, g, b] = rgb;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // #rgb / #rgba / #rrggbb / #rrggbbaa — the default line color is hex, so
    // hatch/fill helpers that tint it must handle this form too.
    const hex = color.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
        let h = hex[1];
        if (h.length <= 4) h = h.split('').map(c => c + c).join(''); // #rgb(a) → #rrggbb(aa)
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    console.warn('Unrecognized color for withOpacity:', color);
    return color;
}

export function createDiagonalHatchPattern(
    hostility: TacticalGraphicHostility,
    size: number = 8,
    lineWidth: number = 1,
): CanvasPattern {

    let hostilityColor = getColorByHostility(hostility);
    let color = withOpacity(hostilityColor, .25);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();

    return ctx.createPattern(canvas, 'repeat')!;
}

export function obstacleRestrictedZoneStyle(feature: FeatureLike, resolution: number) {
    let hostility = feature.get('hostility');
    const hatchPattern = createDiagonalHatchPattern(
        hostility,
        8,
        1,
    );

    return new Style({
        fill: new Fill({
            color: hatchPattern,
        }),
        stroke: new Stroke({
            color: getColorByHostility(hostility),
            width: LINE_WIDTH,
        }),
    });
}

// FreeFireAreaCircular: present = solid stroke with no fill; planned = dashed
// stroke with diagonal hatch fill. Mirrors the polygon FFA rendering so all
// three FFA variants read the same when their status is set.
export function freeFireAreaCircularStyleFunc(): StyleFunction {
    return (f, resolution) => freeFireAreaCircularStyleFromLabels(readGraphicLabels(f))(f, resolution);
}

function freeFireAreaCircularStyleFromLabels(labels: GraphicLabels): StyleFunction {
    return (feature) => {
        const color = feature.get('hostilityColor') || getDefaultLineColor();
        const hostility = feature.get('hostility') || TacticalGraphicHostility.unknown;
        const isPlanned = labels.status === TacticalGraphicStatus.planned;
        const hatchPattern = isPlanned ? createDiagonalHatchPattern(hostility, 8, 1) : undefined;

        return new Style({
            fill: hatchPattern ? new Fill({color: hatchPattern}) : undefined,
            stroke: new Stroke({
                color,
                width: LINE_WIDTH,
                lineDash: isPlanned ? [12, 8] : undefined,
            }),
        });
    };
}

export function groupOrSeriesOfTargetsGraphicStyle(
    labels: GraphicLabels,
    feature: FeatureLike,
    resolution: number,
): Style[] {
    const geom = feature.getGeometry();
    if (!(geom instanceof Polygon)) return [];
    const ring = geom.getCoordinates()[0];
    if (!ring || ring.length < 2) return [];

    const color = feature.get('hostilityColor') || getDefaultLineColor();
    const isPlanned = labels.status === TacticalGraphicStatus.planned;
    const stroke = new Stroke({
        color,
        width: LINE_WIDTH,
        lineDash: isPlanned ? [12, 8] : undefined,
    });

    let bestIdx = 0;
    let bestMidY = -Infinity;
    for (let i = 0; i < ring.length - 1; i++) {
        const midY = (ring[i][1] + ring[i + 1][1]) / 2;
        if (midY > bestMidY) {
            bestMidY = midY;
            bestIdx = i;
        }
    }

    const styles: Style[] = [];
    const labelText = (labels.label ?? '').trim();
    const scale = featureLabelScale(feature, resolution);
    const labelWidthPx = labelText ? getTextWidth(labelText, fontStyle, scale) : 0;
    const gapHalfMap = labelText ? (labelWidthPx / 2 + 6) * resolution : 0;

    for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        if (i === bestIdx && gapHalfMap > 0) {
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const segLen = Math.hypot(dx, dy);
            if (segLen > 2 * gapHalfMap) {
                const ux = dx / segLen, uy = dy / segLen;
                const mx = (a[0] + b[0]) / 2;
                const my = (a[1] + b[1]) / 2;
                const gapStart: Coordinate = [mx - ux * gapHalfMap, my - uy * gapHalfMap];
                const gapEnd: Coordinate = [mx + ux * gapHalfMap, my + uy * gapHalfMap];
                styles.push(new Style({geometry: new LineString([a, gapStart]), stroke}));
                styles.push(new Style({geometry: new LineString([gapEnd, b]), stroke}));
                continue;
            }
        }
        styles.push(new Style({geometry: new LineString([a, b]), stroke}));
    }
    return styles;
}

export function limitedAccessAreaStyleFunc(feature: FeatureLike, resolution: number): Style {
    return limitedAccessAreaStyleFromLabels(readGraphicLabels(feature), feature, resolution);
}

function limitedAccessAreaStyleFromLabels(labels: GraphicLabels, feature: FeatureLike, resolution: number): Style {
    const color = feature.get('hostilityColor') || getDefaultLineColor();
    const isPlanned = labels.status === TacticalGraphicStatus.planned;

    const pattern = createDiagonalHatchPattern(
        TacticalGraphicHostility.unknown,
        16,
        2                    // hatch thickness
    );

    return new Style({
        fill: new Fill({
            color: pattern ?? 'rgba(0,0,0,0)',
        }),
        stroke: new Stroke({
            color,
            width: LINE_WIDTH,
            lineDash: isPlanned ? [12, 8] : undefined,
        }),
    });
}

export function getStyle(name: TacticalGraphicName, feature: FeatureLike, resolution: number) {
    return getStyleFromLabels(name, readGraphicLabels(feature), feature, resolution);
}

function getStyleFromLabels(name: TacticalGraphicName, labels: GraphicLabels, feature: FeatureLike, resolution: number) {
    if (name === TacticalGraphicName.StrongPoint) return railroadStyleFunction(feature, resolution);
    if (name === TacticalGraphicName.BattlePosition) return battlePositionStyleFunction(labels, feature, resolution);
    if (name === TacticalGraphicName.UnexplodedExplosiveOrdnanceArea) return unexplodedExplosiveOrdenanceStyle(feature, resolution);
    if (name === TacticalGraphicName.Encirclement) return encirclementGraphicStyle(feature, resolution);
    if (name === TacticalGraphicName.ObstacleRestrictedArea) return obstacleRestrictedZoneStyle(feature, resolution);
    if (name === TacticalGraphicName.LimitedAccessArea) return limitedAccessAreaStyleFromLabels(labels, feature, resolution);
    if (
        name === TacticalGraphicName.NoFireAreaCircular ||
        name === TacticalGraphicName.NoFireAreaIrregular ||
        name === TacticalGraphicName.NoFireAreaRectangular ||
        name === TacticalGraphicName.WeaponsFreeZone
    ) return limitedAccessAreaStyleFromLabels(labels, feature, resolution);
    if (name === TacticalGraphicName.GroupOrSeriesOfTargets) {
        return groupOrSeriesOfTargetsGraphicStyle(labels, feature, resolution);
    }
    // ✅ Pull hostility-based color if available
    let color = feature.get('hostilityColor') || getDefaultLineColor();

    const isPlanned = labels.status === TacticalGraphicStatus.planned;

    return new Style({
        stroke: new Stroke({
            color: color,
            width: LINE_WIDTH,
            lineDash: isPlanned ? [12, 8] : undefined,
        }),
    });
}

export function encirclementGraphicStyle(feature: FeatureLike, resolution: number): Style[] | Style {
    let hostility = feature.get('hostility');
    let geom = feature.getGeometry();
    let styles = [
        new Style({
            stroke: new Stroke({
                color: getColorByHostility(hostility),
                width: LINE_WIDTH,
            }),
        }),
    ];

    if (!geom || !(geom instanceof GeometryCollection)) {
        return styles;
    }

    let geometries = geom.getGeometries();

    geometries.forEach((geom) => {
        if (!(geom instanceof MultiPoint)) return;

        if (hostility === TacticalGraphicHostility.hostileFaker) {
            styles.push(
                new Style({
                        geometry: new MultiPoint(geom.getCoordinates()),
                        text: new Text({
                            text: 'ENY',
                            font: fontStyle,
                            fill: new Fill({color: getColorByHostility(TacticalGraphicHostility.unknown)}),
                            placement: 'point',
                            scale: featureLabelScale(feature, resolution),
                        }),
                    },
                ));
        }

    });

    return styles;

}

// --- CONFIGURATION CONSTANTS ---
const GAP_WIDTH_PX = 40; // The desired width (in screen pixels) for each text gap

/**
 * Generates an array of OpenLayers styles for a polygon feature
 * with two text-labeled gaps along the most outward-facing segment.
 *
 * @param {import('ol/Feature').default} feature The feature to style.
 * @param {number} resolution The current map resolution.
 * @param {number[]} rotation The unit vector [dx, dy] representing the 'outward' direction.
 * @param {(hostility: string) => string} getColorByHostility Function to get color.
 * @returns {Style[]} An array of Style objects.
 */
function unexplodedExplosiveOrdenanceStyle(feature: FeatureLike, resolution: number) {
// 1) Get the main ring coordinates
    const geometry = feature.getGeometry() as Polygon;
    const ring = geometry.getCoordinates()[0];

    if (ring.length < 3) return [];

    let rotation = feature.get('rotation') || 0;

    const unitRot = [Math.cos(rotation), Math.sin(rotation)];
    const color = getColorByHostility(feature.get('hostility'));
    const gapMapUnits = GAP_WIDTH_PX * resolution;

    // --- NEW LOGIC: FINDING OPPOSITE SEGMENTS ---
    let maxProjection = -Infinity;
    let minProjection = Infinity;
    let maxIndex = -1;
    let minIndex = -1;

    // 2) Iterate over all segments to find the ones defining the extent along the rotation axis
    for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];

        // Midpoint of the segment
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        // Projection of the midpoint onto the rotation axis
        // This tells us how far "out" this segment is along the rotation vector
        const projection = midX * unitRot[0] + midY * unitRot[1];

        if (projection > maxProjection) {
            maxProjection = projection;
            maxIndex = i;
        }
        if (projection < minProjection) {
            minProjection = projection;
            minIndex = i;
        }
    }

    // Ensure we found two distinct segments
    if (maxIndex === minIndex || maxIndex === -1 || minIndex === -1) {
        // Fallback to a closed outline if opposite segments couldn't be found
        return [new Style({stroke: new Stroke({color: color, width: LINE_WIDTH})})];
    }

    const segmentsToGap = [maxIndex, minIndex];
    const styles = [];
    const outlineSegments = [];

    // 3) Process each segment (maxIndex and minIndex) to create the gap and label
    for (let i = 0; i < ring.length - 1; i++) {
        const p1 = ring[i];
        const p2 = ring[i + 1];
        const dx = p2[0] - p1[0],
            dy = p2[1] - p1[1];
        const segLen = Math.hypot(dx, dy);

        if (segmentsToGap.includes(i)) {
            // This is one of the two segments where we need a gap and a label

            // Gap placement calculation (centered gap)
            if (segLen < gapMapUnits) {
                // Segment is too short, just add the full segment to the outline
                outlineSegments.push([p1, p2]);
                continue;
            }

            // Calculate the fraction (t-value) for the start and end of the gap
            const centerT = 0.5; // Center of the segment
            const halfGapRatio = (gapMapUnits / 2) / segLen;

            const tStart = centerT - halfGapRatio;
            const tEnd = centerT + halfGapRatio;

            const tCenter = centerT; // Label is exactly at the midpoint

            // Calculate the coordinates for the break points and the label
            const breakPoint = (t: number) => [p1[0] + dx * t, p1[1] + dy * t];

            const gapStart = breakPoint(tStart);
            const gapEnd = breakPoint(tEnd);
            const labelCoord = breakPoint(tCenter);

            // Add the two line pieces around the gap
            outlineSegments.push(
                [p1, gapStart], // Piece before the gap
                [gapEnd, p2],    // Piece after the gap
            );

            // Create the label style
            const labelStyle = new Style({
                geometry: new Point(labelCoord),
                text: new Text({
                    text: 'UXO',
                    font: fontStyle,
                    fill: new Fill({color: color}),
                    stroke: haloStroke,
                    placement: 'point',
                    scale: featureLabelScale(feature, resolution),
                }),
            });
            styles.push(labelStyle);

        } else {
            // This is a normal perimeter segment, just add it to the outline
            outlineSegments.push([p1, p2]);
        }
    }

    // 4) Create the final perimeter style
    const outlineStyle = new Style({
        geometry: new MultiLineString(outlineSegments),
        stroke: new Stroke({color: color, width: LINE_WIDTH}),
    });
    styles.push(outlineStyle);

    return styles;
}



/**
 * Renders all text labels for an airspace coordination area as a single
 * multiline Text style anchored at the polygon's interior point.
 *
 * Using one Text object (with \n separators) lets OL manage line spacing
 * automatically, so the block scales correctly at every zoom level.
 * Fixed per-line offsetY values were removed because they only worked at
 * one scale; the blank separator between the name block and the alt/time
 * block is achieved with an empty string line.
 */
export function createAirCoordinatingAreaLabelStyle(
    feature: FeatureLike,
    identifier: string,
    labels: GraphicLabels,
    resolution: number,
    hasHatchPattern: boolean
): Style[] {
    const anchorPoint = feature.getGeometry() as Point;
    const scale = featureLabelScale(feature, resolution);

    // ── Name / identifier block ───────────────────────────────────────────────
    const nameLines: string[] = [];
    if (identifier?.trim()) nameLines.push(identifier.trim());
    if (labels.label?.trim()) nameLines.push(labels.label.trim());

    // ── Alt / time block — pad label to 11 chars for rough column alignment ───
    const altLines: string[] = [];
    if (labels.minAltitude) altLines.push(`${'MIN ALT:'.padEnd(11)}${labels.minAltitude}`);
    if (labels.maxAltitude) altLines.push(`${'MAX ALT:'.padEnd(11)}${labels.maxAltitude}`);
    if (labels.startDate)   altLines.push(`${'TIME FROM:'.padEnd(11)}${labels.startDate}`);
    if (labels.endDate)     altLines.push(`${'TIME TO:'.padEnd(11)}${labels.endDate}`);

    // Blank separator line between the two blocks (per MIL-STD-2525E layout)
    const allLines = (nameLines.length > 0 && altLines.length > 0)
        ? [...nameLines, '', ...altLines]
        : [...nameLines, ...altLines];

    if (allLines.length === 0) return [];

    // Measure the widest line so we can shift the left-aligned block to center it.
    // offsetX moves the anchor to the left edge of the block; the block then
    // extends rightward by maxLineWidth*scale, keeping it centered overall.
    textMeasureCtx.font = fontStyle;
    const maxLineWidth = Math.max(...allLines.map(l => l ? textMeasureCtx.measureText(l).width : 0));
    const offsetX = -(maxLineWidth * scale) / 2;

    return [new Style({
        geometry: anchorPoint,
        text: new Text({
            text: allLines.join('\n'),
            font: fontStyle,
            fill: new Fill({color: getLabelFillColor()}),
            stroke: haloStroke,
            padding: hasHatchPattern ? [4, 8, 4, 8] : undefined,
            textAlign: 'left',
            textBaseline: 'middle',
            offsetX,
            scale,
        }),
    })];
}

// Full style function that can be assigned to a layer or feature
export function airCoordinatingAreaStyleFunc(identifier: string, labels: GraphicLabels, hasHatchPattern: boolean): StyleFunction {
    return (feature, resolution) => {
        // Fallback Polygon Style (optional, but good practice)
        const isPlanned = labels.status === TacticalGraphicStatus.planned;
        const polygonStyle = new Style({
            fill: new Fill({
                color: 'rgba(255, 100, 100, 0.4)',
            }),
            stroke: new Stroke({
                color: 'rgb(255, 50, 50)',
                width: LINE_WIDTH,
                lineDash: isPlanned ? [12, 8] : undefined,
            }),
        });

        // Generate label styles
        const labelStyles = createAirCoordinatingAreaLabelStyle(feature, identifier, labels, resolution, hasHatchPattern);

        // Return the base polygon style and all the generated label styles
        return [polygonStyle, ...labelStyles];
    };
}

export function getTextWidth(text: string, font: string, scale: number): number {
    textMeasureCtx.font = font; // e.g. "bold 12px sans-serif"
    const metrics = textMeasureCtx.measureText(text);
    return metrics.width * scale;
}