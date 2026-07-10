import {Coordinate} from "ol/coordinate";
import {MissionTaskGraphic} from "../controllers/MissionTaskController";
import {Feature} from "ol";
import {
    baseDefenseZoneLabelStyleFn,
    createFeature,
    createHandleFeature,
    featureLabelScale,
    fightingPositionStyleFunc,
    fontStyle,
    freeFireAreaCircularStyleFunc,
    getAreaLabelStylesFn,
    getMissionTaskStyleFn,
    getRatioLockedMissionTaskStyleFn,
    getTextWidth,
    limitedAccessAreaStyleFunc,
} from "../openlayerStyles";
import {LineString, MultiLineString, MultiPoint, Point, Polygon} from "ol/geom";
import openlayersAdapter from "../openlayersAdapter";

import {getLabel, TacticalGraphicName} from '@zaes/tactical-graphics';

// Mission-task graphics that lock to a 100px-diameter minimum and use the
// ratio-locked label style. Adding a name here gives it the block-family
// label treatment + min-size enforcement.
const RATIO_LOCKED_MISSION_TASKS: Set<TacticalGraphicName> = new Set([
    TacticalGraphicName.Contain,
    TacticalGraphicName.Control,
    TacticalGraphicName.Isolate,
]);
const RATIO_LOCKED_MIN_RADIUS_PX = 50;
import {GraphicLabels} from "../../../utils/graphicLinkRegistry";
import {Fill, Stroke, Style} from "ol/style";
import {getDefaultLineColor, LINE_WIDTH} from "../openlayerStyles";
import {writeGraphicProperties} from "../graphicProperties";

export class MissionTaskGraphicBase implements MissionTaskGraphic {
    center: Coordinate = [0, 0];
    base: Feature<Point> = new Feature<Point>(new Point([]));
    rotation: number = 0;
    size: number;
    symbolId: string = '';

    handles: Feature<MultiPoint> = <Feature<MultiPoint>>createHandleFeature();
    graphic: Feature = createFeature();
    label: Feature = new Feature();
    name: TacticalGraphicName;

    constructor(
        name: TacticalGraphicName,
        size: number,
        drawingResolution?: number,
    ) {
        this.size = size;
        this.name = name;
        if (drawingResolution !== undefined) {
            this.label.set('drawingResolution', drawingResolution);
            this.graphic.set('drawingResolution', drawingResolution);
        }
        if (name === TacticalGraphicName.AreaDefense) {
            this.graphic.setStyle((feature, resolution) => {
                let color = feature.get('hostilityColor') || getDefaultLineColor();
                return new Style({
                    fill: new Fill({color: color}),
                    stroke: new Stroke({
                        color: color,
                        width: LINE_WIDTH,
                    }),
                })
            })
        }
        if (name === TacticalGraphicName.FightingPosition) {
            this.graphic.setStyle(fightingPositionStyleFunc());
        }
        // MovementToContact: shift the zigzag "contact" side arrows outward
        // by 30px (zoom-invariant) so they don't touch the big arrow's
        // arrowhead edge. B→A (upperPath[1]→upperPath[0]) is the upper
        // edge — its CCW perpendicular points outward; I→A
        // (lowerPath[2]→lowerPath[3]) is the lower edge — its CW
        // perpendicular points outward.
        //   MultiLineString layout (see MovementToContact.generateGraphics):
        //     [0] upperPath, [1] lowerPath,
        //     [2] upper zigzag line, [3] upper zigzag arrowhead,
        //     [4] lower zigzag line, [5] lower zigzag arrowhead.
        // Pursuit: split the horizontal line around its midpoint so the "P"
        // label always has breathing room. Gap width is derived from the
        // actual rendered text width at the current zoom (zoom-invariant on
        // screen). Other sub-lines (arc, arrowhead, crossbar) render as-is.
        //   MultiLineString layout (see Pursuit.generateGraphics):
        //     [0] horizontal line, [1] semicircle arc,
        //     [2] arrowhead, [3] perpendicular crossbar.
        if (name === TacticalGraphicName.Pursuit) {
            this.graphic.setStyle((feature, resolution) => {
                const geom = feature.getGeometry() as MultiLineString;
                if (!geom) return [];
                const lines = geom.getCoordinates();
                const color = getDefaultLineColor();
                const stroke = new Stroke({color, width: LINE_WIDTH});

                const styles: Style[] = [];
                const horiz = lines[0];
                if (horiz && horiz.length === 2) {
                    const [a, b] = horiz;
                    const mid: Coordinate = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                    const dx = b[0] - a[0], dy = b[1] - a[1];
                    const len = Math.hypot(dx, dy);
                    const scale = featureLabelScale(feature, resolution);
                    // Measured width of 'P' (screen px) + 4px padding each side,
                    // then converted to map units by × resolution so the gap
                    // matches the rendered glyph at every zoom.
                    const pWidthPx = getTextWidth(getLabel(name), fontStyle, scale);
                    const gapHalf = (pWidthPx / 2 + 4) * resolution;
                    if (len > 2 * gapHalf) {
                        const ux = dx / len, uy = dy / len;
                        const gapA: Coordinate = [mid[0] - ux * gapHalf, mid[1] - uy * gapHalf];
                        const gapB: Coordinate = [mid[0] + ux * gapHalf, mid[1] + uy * gapHalf];
                        styles.push(new Style({geometry: new LineString([a, gapA]), stroke}));
                        styles.push(new Style({geometry: new LineString([gapB, b]), stroke}));
                    } else {
                        // Line is shorter than the label — don't split; render whole.
                        styles.push(new Style({geometry: new LineString(horiz), stroke}));
                    }
                }
                // Render the remaining sub-lines (arc, arrowhead, crossbar) as-is.
                for (let i = 1; i < lines.length; i++) {
                    styles.push(new Style({geometry: new LineString(lines[i]), stroke}));
                }
                return styles;
            });
        }
        if (name === TacticalGraphicName.MovementToContact) {
            this.graphic.setStyle((feature, resolution) => {
                const geom = feature.getGeometry() as MultiLineString;
                if (!geom) return [];
                const rawLines = geom.getCoordinates();
                const defaultColor = getDefaultLineColor();

                const GAP = 30 * resolution;
                const perpShift = (
                    edgeStart: number[],
                    edgeEnd: number[],
                    ccw: boolean,
                ): [number, number] => {
                    const dx = edgeEnd[0] - edgeStart[0];
                    const dy = edgeEnd[1] - edgeStart[1];
                    const len = Math.hypot(dx, dy);
                    if (len === 0) return [0, 0];
                    const sign = ccw ? 1 : -1;
                    return [sign * -dy / len * GAP, sign * dx / len * GAP];
                };
                const [uDx, uDy] = (rawLines[0]?.length >= 2)
                    ? perpShift(rawLines[0][1], rawLines[0][0], true)
                    : [0, 0];
                const [lDx, lDy] = (rawLines[1]?.length >= 4)
                    ? perpShift(rawLines[1][2], rawLines[1][3], false)
                    : [0, 0];
                const shift = (line: number[][], dx: number, dy: number): number[][] =>
                    line.map(pt => [pt[0] + dx, pt[1] + dy]);
                const lines = rawLines.map((line, i) => {
                    if (i === 2 || i === 3) return shift(line, uDx, uDy);
                    if (i === 4 || i === 5) return shift(line, lDx, lDy);
                    return line;
                });

                return lines.map((line) => new Style({
                    geometry: new LineString(line),
                    stroke: new Stroke({color: defaultColor, width: LINE_WIDTH}),
                }));
            });
        }
        this.label.setStyle((feature, resolution) => {
            return getMissionTaskStyleFn(getLabel(name))(feature, resolution);
        })
        // BaseDefenseZone uses a hardcoded "BDZ" label whose scale tracks
        // the circle's radius rather than the zoom-anchored
        // featureLabelScale. Override the default mission-task label style
        // for it; the radius is stamped on the label feature in
        // updateGeometry as `graphicSize`.
        if (name === TacticalGraphicName.BaseDefenseZone) {
            this.label.setStyle(baseDefenseZoneLabelStyleFn());
        }
        // Contain and Control share the ratio-locked block-family treatment:
        // 24px base font, label scales with the circle, and a 100px-diameter
        // minimum size enforced in updateGeom so the graphic is recognisable
        // from the first click.
        if (RATIO_LOCKED_MISSION_TASKS.has(name)) {
            this.label.setStyle((feature, resolution) =>
                getRatioLockedMissionTaskStyleFn(getLabel(name))(feature, resolution)
            );
        }
    }

    updateGeometry = () => {
        let tacticalGraphic = openlayersAdapter.getTacticalGraphic(
            this.name,
            this.base,
            {size: this.size, rotation: this.rotation}
        );
        if (!tacticalGraphic) return;

        const {graphic, handles, labels} = tacticalGraphic;

        this.graphic.setGeometry(graphic);
        this.handles.setGeometry(handles as MultiPoint);
        this.label.setGeometry(labels);

        // Stamp the current radius on the label feature so size-tracking
        // label styles (e.g. baseDefenseZoneLabelStyleFn) can scale text to
        // the circle without poking at the graphic feature.
        this.label.set('graphicSize', this.size);

        // Store the graphic's bounding box on the label feature so edge-anchored
        // label styles (e.g. PositionAreaArtillery's four PAA labels) can compute
        // positions without inspecting the graphic feature directly.
        const graphicGeom = this.graphic.getGeometry();
        if (graphicGeom) {
            const [minX, minY, maxX, maxY] = graphicGeom.getExtent();
            this.label.set('polygonMinX', minX);
            this.label.set('polygonMinY', minY);
            this.label.set('polygonMaxX', maxX);
            this.label.set('polygonMaxY', maxY);
        }
    };

    getFeatures(): Feature[] {
        return [this.graphic, this.label, this.handles];
    }

    updateGeom({size, center, rotation}: { size?: number, center?: Coordinate, rotation?: number }): void {
        this.rotation = rotation || this.rotation;
        let newSize = size || this.size;
        if (RATIO_LOCKED_MISSION_TASKS.has(this.name)) {
            const drawingRes = this.label.get('drawingResolution') as number | undefined;
            if (drawingRes && drawingRes > 0) {
                const minSize = RATIO_LOCKED_MIN_RADIUS_PX * drawingRes;
                if (newSize < minSize) newSize = minSize;
            }
        }
        this.size = newSize;
        this.center = center || this.center;
        this.base.getGeometry()!.setCoordinates(this.center);
        this.updateGeometry();
    }

    setSymbolId(symbolId: string) {
        this.symbolId = symbolId;
        this.graphic.set('symbolId', this.symbolId);
        this.label.set('symbolId', this.symbolId);
    }

    setBaseFeature(base: Feature<Point>) {
        this.base = base;
    }
}

export class CircularAreaGraphicBase extends MissionTaskGraphicBase {
    graphicLabels: GraphicLabels = {label: ''};

    constructor(
        name: TacticalGraphicName,
        size: number,
        drawingResolution?: number,
    ) {
        super(name, size, drawingResolution);

        // Amplifiers come off the feature, so this needs no closure.
        this.label.setStyle(getAreaLabelStylesFn(name));

        if (
            name === TacticalGraphicName.FreeFireAreaCircular ||
            name === TacticalGraphicName.RestrictiveFireAreaCircular ||
            name === TacticalGraphicName.PositionAreaArtilleryCircular ||
            name === TacticalGraphicName.AirSpaceCoordinationAreaCircular
        ) {
            this.graphic.setStyle(freeFireAreaCircularStyleFunc());
        }
        // NoFireAreaCircular gets the always-hatched LimitedAccessArea fill.
        // CircularArea generates the outline as a MultiLineString (no interior),
        // so the style is forced onto a Polygon built from the ring so the hatch
        // pattern actually fills the circle.
        if (name === TacticalGraphicName.NoFireAreaCircular) {
            this.graphic.setStyle((feature, resolution) => {
                const style = limitedAccessAreaStyleFunc(feature, resolution);
                const geom = feature.getGeometry();
                if (geom instanceof MultiLineString) {
                    const rings = geom.getCoordinates();
                    if (rings.length > 0) style.setGeometry(new Polygon(rings));
                }
                return style;
            });
        }

        writeGraphicProperties([this.graphic, this.label, this.handles], name, this.graphicLabels);
    }

    setLabel = (labels: GraphicLabels) => {
        this.graphicLabels = labels;
        // Stamping fires a `change` event on each feature, which re-renders them.
        writeGraphicProperties(this.getFeatures(), this.name, labels);
    };


}