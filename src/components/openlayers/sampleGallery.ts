/**
 * Draws one sample of every proven graphic, tiled across the map, by driving the
 * exact same generator path a hand-draw uses — so a sample renders identically
 * to a real graphic. This makes it a one-click visual regression sweep and a
 * live showcase.
 *
 * Each graphic's controller decides the base geometry it consumes:
 *   - LineGraphicController      → a LineString (2 pts, or `maxPoints`; multi → 3 = 2 segments)
 *   - PolygonGraphicController   → a Polygon (5-sided ring)
 *   - RectangularAreaGraphicController → a Polygon box (4 corners)
 *   - MissionTaskController      → a centre point + radius, via updateGeom()
 *   - SecurityOperationsController → a centre point, via setBaseFeature()
 *
 * A generator that throws (a genuinely broken graphic) is caught and reported,
 * not fatal — the rest of the sweep still renders.
 */
import {Feature} from 'ol';
import {LineString, Point, Polygon} from 'ol/geom';
import {Coordinate} from 'ol/coordinate';
import {Fill, Stroke, Style, Text} from 'ol/style';
import {TacticalGraphicName, getDisplayName} from '@zaes/tactical-graphics';

import {getController} from './controllerRegistry';
import {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {MissionTaskController} from './controllers/MissionTaskController';
import {SecurityOperationsController} from './controllers/SecurityOperationsController';
import {PolygonGraphicController, RectangularAreaGraphicController} from './controllers/PolygonGraphicController';
import {LineGraphicController} from './controllers/LineGraphicController';
import {PROVEN_GRAPHICS} from './provenGraphics';

/** EPSG:3857 metres of a single grid cell. Uniform, so the grid reads evenly. */
const CELL_METRES = 90_000;
/** Half-extent a sample occupies inside its cell (≈68% of the cell width). */
const HALF = CELL_METRES * 0.34;
/** Fraction of the viewport the whole grid should fill after framing. */
const FILL = 0.85;

export interface SampleSweepResult {
    drawn: number;
    failed: {name: TacticalGraphicName; error: string}[];
}

/** Removes every rendered graphic and its controllers. */
export function clearAllGraphics(manager: TacticalGraphicsManager): void {
    manager.renderingVectorSource.clear();
    manager.graphicControllers.length = 0;
}

/**
 * Clears the map, draws a sample of every proven graphic in a grid, and frames
 * the view around it. Returns which graphics rendered and which threw.
 */
export function drawProvenSamples(manager: TacticalGraphicsManager): SampleSweepResult {
    clearAllGraphics(manager);

    const source = manager.renderingVectorSource;
    const view = manager.map.getView();
    const [w, h] = manager.map.getSize() ?? [1600, 900];

    const n = PROVEN_GRAPHICS.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * w) / h)));
    const rows = Math.ceil(n / cols);
    const gridW = cols * CELL_METRES;
    const gridH = rows * CELL_METRES;

    // Frame the grid before drawing, so every handler is constructed at (and
    // stamps) the resolution the samples are actually viewed at — keeps label
    // scaling ≈ 1 instead of shrinking when we'd otherwise zoom out to fit.
    const resolution = Math.max(gridW / w, gridH / h) / FILL;
    view.setCenter([0, 0]);
    view.setResolution(resolution);

    const originX = -gridW / 2;
    const originY = gridH / 2;
    const failed: SampleSweepResult['failed'] = [];
    let drawn = 0;

    PROVEN_GRAPHICS.forEach((name, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = originX + (col + 0.5) * CELL_METRES;
        const cy = originY - (row + 0.5) * CELL_METRES;

        const handler = getController(name, resolution);
        const symbolId = crypto.randomUUID();
        handler.setSymbolId(symbolId);
        handler.getFeatures().forEach(f => {
            f.set('graphicName', name);
            f.set('symbolId', symbolId);
        });
        source.addFeatures(handler.getFeatures());

        try {
            if (handler instanceof MissionTaskController) {
                handler.graphic.updateGeom({size: HALF, center: [cx, cy], rotation: 0});
            } else if (handler instanceof SecurityOperationsController) {
                handler.setBaseFeature(pointFeature([cx, cy], symbolId, name));
            } else if (handler instanceof PolygonGraphicController) {
                const ring = handler instanceof RectangularAreaGraphicController
                    ? rectRing(cx, cy)
                    : pentagonRing(cx, cy);
                handler.setBaseFeature(polygonFeature(ring, symbolId, name));
            } else if (handler instanceof LineGraphicController) {
                const pts = handler.maxPoints ?? 3; // multi-segment → 3 points (2 segments)
                handler.setBaseFeature(lineFeature(lineCoords(cx, cy, pts), symbolId, name));
            } else {
                throw new Error('unclassified controller');
            }
            manager.graphicControllers.push(handler);
            source.addFeature(titleFeature([cx, cy + CELL_METRES * 0.42], getDisplayName(name)));
            drawn++;
        } catch (e) {
            // Roll back this graphic's partial features so a thrower leaves no debris.
            handler.getFeatures().forEach(f => {
                if (source.hasFeature(f)) source.removeFeature(f);
            });
            failed.push({name, error: e instanceof Error ? e.message : String(e)});
        }
    });

    if (failed.length) {
        // eslint-disable-next-line no-console
        console.warn(`[sample sweep] ${drawn} drawn, ${failed.length} failed:`,
            failed.map(f => `${f.name}: ${f.error}`));
    }
    return {drawn, failed};
}

// ── geometry synthesis ──────────────────────────────────────────────────────

/** Line vertices centred in a cell: 2 points → 1 segment; 3+ → a shallow 2-segment V. */
function lineCoords(cx: number, cy: number, pts: number): Coordinate[] {
    if (pts <= 2) return [[cx - HALF, cy], [cx + HALF, cy]];
    return [
        [cx - HALF, cy + HALF * 0.2],
        [cx, cy - HALF * 0.2],
        [cx + HALF, cy + HALF * 0.2],
    ];
}

/** Closed 5-sided ring (point-up pentagon) inscribed in the cell. */
function pentagonRing(cx: number, cy: number): Coordinate[] {
    const ring: Coordinate[] = [];
    for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
        ring.push([cx + HALF * Math.cos(a), cy + HALF * Math.sin(a)]);
    }
    ring.push(ring[0]);
    return ring;
}

/** Closed rectangle ring (4 corners) inscribed in the cell. */
function rectRing(cx: number, cy: number): Coordinate[] {
    const hy = HALF * 0.68;
    return [
        [cx - HALF, cy - hy],
        [cx + HALF, cy - hy],
        [cx + HALF, cy + hy],
        [cx - HALF, cy + hy],
        [cx - HALF, cy - hy],
    ];
}

// ── feature builders ────────────────────────────────────────────────────────

function stamp<T extends Feature>(f: T, symbolId: string, name: TacticalGraphicName): T {
    f.set('symbolId', symbolId);
    f.set('graphicName', name);
    return f;
}

const lineFeature = (coords: Coordinate[], id: string, name: TacticalGraphicName) =>
    stamp(new Feature(new LineString(coords)), id, name);

const polygonFeature = (ring: Coordinate[], id: string, name: TacticalGraphicName) =>
    stamp(new Feature(new Polygon([ring])), id, name);

const pointFeature = (coord: Coordinate, id: string, name: TacticalGraphicName) =>
    stamp(new Feature(new Point(coord)), id, name);

/** A non-interactive caption above each sample so you can tell which is which. */
function titleFeature(coord: Coordinate, text: string): Feature {
    const f = new Feature(new Point(coord));
    f.set('sampleTitle', true);
    f.setStyle(new Style({
        text: new Text({
            text,
            font: '11px sans-serif',
            fill: new Fill({color: '#555'}),
            stroke: new Stroke({color: 'rgba(255,255,255,0.85)', width: 3}),
            overflow: true,
        }),
    }));
    return f;
}
