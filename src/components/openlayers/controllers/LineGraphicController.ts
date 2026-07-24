import {Feature} from 'ol';

import {Coordinate} from 'ol/coordinate';
import LineString from 'ol/geom/LineString';
import {DrawEvent} from 'ol/interaction/Draw';
import openlayersAdapter, {TacticalGraphic, TacticalGraphicHandler, TacticalGraphicShape} from "../openlayersAdapter";
import {Geometry} from 'ol/geom';
import {ObjectEvent} from 'ol/Object';
import {StyleFunction} from 'ol/style/Style';
import {GraphicLinkRegistry} from '../../../utils/graphicLinkRegistry';

export interface LineGraphic extends TacticalGraphic {
    base: Feature<LineString>;

    setSymbolId(symbolId: string): void;

    setOffset?(offset: number): void;

    offsetScale?: number;

    /**
     * Drop the handle on p0. Set by `LineGraphicController` for graphics fixed at
     * two vertices; see `visiblePathHandles`.
     */
    hidesStartHandle?: boolean;
}

/**
 * Two handles within a millimetre of each other are the same point. Coordinates
 * here are EPSG:3857 metres, and the only error to absorb is the generator's
 * 3857 → 4326 → 3857 round trip, which lands far inside that.
 */
const SAME_POINT_EPSILON_M = 1e-3;

/**
 * The path handles a one-segment graphic should actually show — every one except
 * the handle sitting on p0.
 *
 * A graphic fixed at two vertices *is* a single segment, so a handle on each end
 * is redundant: either one rotates and resizes the whole thing about the other.
 * p0 is additionally where most of these graphics stack their label or symbol,
 * so its dot lands underneath the text and reads as clutter rather than as
 * something grabbable.
 *
 * **Matches on position, not on index.** The obvious implementation — drop the
 * first path handle — is wrong, because generators do not agree on an order:
 * `Breach` and `Penetration` emit `[end, p0]`, and `Disrupt` emits three arrow
 * handles before its two endpoints. Only "is this handle at p0" is stable across
 * all of them, and it also leaves a generator's extra shape handles alone, which
 * dropping by index would eat.
 *
 * Safe because nothing indexes into a line graphic's handle set:
 * `toggleHandleFeatures` only flips `hidden` on the whole feature, and
 * `handleRotate` / `handleResize` / `handleTranslate` transform `graphic.base`
 * wholesale — `handleResize` anchored on `getCenter()`, which is base
 * `coords[0]` = p0 and stays the anchor whether or not it is drawn.
 *
 * Never returns an empty set: a generator whose handles all sit on p0 keeps
 * them, so the graphic cannot end up with nothing to grab.
 */
export function visiblePathHandles(coords: Coordinate[], startCoord: Coordinate | undefined, hidesStartHandle?: boolean): Coordinate[] {
    if (!hidesStartHandle || !startCoord) return coords;

    const kept = coords.filter(c => Math.hypot(c[0] - startCoord[0], c[1] - startCoord[1]) > SAME_POINT_EPSILON_M);
    return kept.length > 0 ? kept : coords;
}

/*
* Controller class for managing linestring-like graphics.
* maxPoints is used to control how many vertices are allowed to be drawn in openlayers.
* */
export class LineGraphicController implements TacticalGraphicHandler {
    graphic: LineGraphic;
    type: TacticalGraphicShape = 'LineString';
    geomHandleType: TacticalGraphicShape = 'LineString';
    drawStyleFunc?: StyleFunction | undefined;
    onPointerMove?: Function | undefined;
    symbolId: string = '';
    maxPoints: number | undefined;

    constructor(graphic: LineGraphic, maxPoints?: number) {
        this.graphic = graphic;
        this.maxPoints = maxPoints;

        // turn off modification because there should only be a fixed number of vertices.
        if (this.maxPoints) {
            this.graphic.base.set('base', false);
        }

        // Two vertices is one segment: show only the handle on the far end.
        if (this.maxPoints === 2) {
            this.graphic.hidesStartHandle = true;
        }

        const features = this.graphic?.getFeatures?.();
        if (!Array.isArray(features)) return;

        features.forEach((feature) => {
            GraphicLinkRegistry.register(feature, this.graphic, this.symbolId);
        })
    }

    getCenter() {
        return this.graphic.base.getGeometry()!.getCoordinates()[0];
    }

    getBaseGeometry(): number[] | number[][] | number[][][] {
        return this.graphic.base.getGeometry()!.getCoordinates();
    }

    getFeatures(): Feature<Geometry>[] {
        return this.graphic.getFeatures();
    }

    onResolutionChangeFunc(_e: ObjectEvent): void {
    }

    handleRotate(deltaAngle: number): void {
        let rotated = openlayersAdapter.rotateFeature(this.graphic.base, deltaAngle) as Feature<LineString>;
        this.graphic.setBaseFeature(rotated);
    }

    handleTranslate(deltaX: number, deltaY: number): void {
        let translated = openlayersAdapter.translateFeature(this.graphic.base, deltaX, deltaY) as Feature<LineString>;
        this.graphic.setBaseFeature(translated);
    }

    handleResize(deltaSize: number): void {
        let resized = openlayersAdapter.resizeFeature(this.graphic.base, deltaSize) as Feature<LineString>;
        this.graphic.setBaseFeature(resized);
    }

    setOffset(offset: number): void {
        this.graphic.setOffset?.(offset);
    }

    // Surfaced from the graphic so the manager can read it off the controller.
    get offsetScale(): number | undefined {
        return this.graphic.offsetScale;
    }

    areCoordsEqual(coord1: Coordinate, coord2: Coordinate): boolean {
        return coord1[0] === coord2[0] && coord1[1] === coord2[1];
    }

    onDrawStartFunc = (e: DrawEvent) => {
        let originalFeature = e.feature;

        let geometry = originalFeature.getGeometry();
        if (geometry === undefined || geometry.getType() !== 'LineString') return;

        geometry.on('change', () => {
            if (geometry === undefined || geometry.getType() !== 'LineString') return;
            let coords = (geometry as LineString).getCoordinates();
            if (coords.length < 2) return;

            // handle the case when a user just clicks without moving their mouse
            if (this.areCoordsEqual(coords[coords.length - 1], coords[coords.length - 2])) {
                coords.pop();
                (geometry as LineString).setCoordinates(coords);
            }
            this.graphic.setBaseFeature(originalFeature as Feature<LineString>);

        });
    };

    onDrawEndFunc = (_e: DrawEvent) => {
    };

    setBaseFeature(base: Feature<LineString>) {
        this.graphic.setBaseFeature(base);
    }

    getSymbolId(): string {
        return this.symbolId;
    }

    setSymbolId(symbolId: string): void {
        this.symbolId = symbolId;
        this.graphic.setSymbolId(symbolId);
    }
}
