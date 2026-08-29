/**
 * # One symbol, described the same way by both engines
 *
 * Cover, guard and screen were pinned to the screen until 2026-08-29: every arm was
 * `SECURITY_OPERATION_HALF_EXTENT_PX` times the live resolution, the symbol held one size
 * at every zoom, and it refused a resize because its size was not a user input.
 *
 * They are drawn from two points now — point 1 at an arrowhead and point 2 at that arrow's
 * inner end, with the second arrow derived — so the size *is* the operator's, and what the
 * two halves have to agree about is the symbol they build from it rather than a figure they
 * both file. The old fault this file was written for is still the one worth guarding:
 * MapLibre computed the size inline while OpenLayers filed nothing, and `compare:engines`
 * read `radius 180000 vs 1320000` for weeks.
 *
 * **Not inert, which is the trap here.** Clearing a number instead of sharing it looked
 * right in a unit test — the adapter still returned a graphic — and collapsed the symbol to
 * 17 x 1 px in the running app, because the generator lays the arms out from it.
 */

import {
    SECURITY_OPERATION_HALF_EXTENT_PX,
    SECURITY_OPERATION_PX,
    TacticalGraphicName,
    securityOperationArm,
    securityOperationHalfExtent,
} from '@zaes/tactical-graphics';
import {Feature} from 'ol';
import {LineString} from 'ol/geom';
import {getController} from './openlayers/controllerRegistry';
import {buildTacticalGraphic} from './maplibre/maplibreAdapter';

const RES = 2_000;
const SECURITY_OPERATIONS = [TacticalGraphicName.Cover, TacticalGraphicName.Guard, TacticalGraphicName.Screen];

/** The drawn arm: point 1 at the arrowhead, point 2 at the inner end. */
const BASE: [number, number][] = [[0, 0], [0.4, 0]];

/**
 * The arm each engine ends up with, in its own frame.
 *
 * OpenLayers holds its base in projected metres and hands them straight to the generator;
 * MapLibre's adapter takes the same degrees and projects them. So the spans below are in
 * different units and only their ratio to the arm is comparable.
 */
const OL_ARM = 0.4;
const MLB_ARM = 0.4 * 111_319.49;

/** The span of the symbol OpenLayers builds, in projected units. */
const openlayersSpan = (name: TacticalGraphicName): number => {
    const handler = getController(name, RES) as unknown as {
        setBaseFeature?(base: Feature<LineString>): void;
        graphic: {setBaseFeature(base: Feature<LineString>): void};
        getFeatures(): Feature[];
    };
    const base = new Feature(new LineString(BASE));
    (handler.setBaseFeature ?? handler.graphic.setBaseFeature).call(handler.setBaseFeature ? handler : handler.graphic, base);

    const xs: number[] = [];
    for (const feature of handler.getFeatures()) {
        const geometry = feature.getGeometry();
        if (geometry?.getType() !== 'MultiLineString') continue;
        for (const line of (geometry as unknown as {getCoordinates(): number[][][]}).getCoordinates()) {
            xs.push(...line.map(([x]) => x));
        }
    }
    return xs.length ? Math.max(...xs) - Math.min(...xs) : NaN;
};

/** The span of the symbol MapLibre builds from the same base. */
const maplibreSpan = (name: TacticalGraphicName): number => {
    const built = buildTacticalGraphic(name, {type: 'LineString', coordinates: BASE}, {}, RES);
    const geometry = built?.graphic.geometry;
    if (!geometry || geometry.type !== 'MultiLineString') return NaN;
    const xs = geometry.coordinates.flat().map(([x]) => x);
    return Math.max(...xs) - Math.min(...xs);
};

describe('the size a security operation is drawn at', () => {
    it('is the arm the operator drew, plus the gap the symbol keeps', () => {
        // Inverses, and the gap is a fifth of an arm either side of the centre.
        expect(securityOperationHalfExtent(1000)).toBeCloseTo(1210, 6);
        expect(securityOperationArm(securityOperationHalfExtent(1000))).toBeCloseTo(1000, 6);
    });

    /**
     * **The constant follows the shape now.** It used to be
     * `labelPadding + labelGap + 2 x arrowLength` — 220 — while the arm the helper actually
     * built ran to `3 x arrowLength - arrowDepth`, 205: the number the badge described
     * itself with was fifteen pixels longer than the symbol it drew. It is derived from the
     * arm and the gap ratio, so the two cannot part company again.
     */
    it('states the reach the symbol is actually drawn to', () => {
        const arm = 3 * SECURITY_OPERATION_PX.arrowLength
            - SECURITY_OPERATION_PX.arrowDepth
            - SECURITY_OPERATION_PX.labelPadding
            - SECURITY_OPERATION_PX.labelGap;
        expect(SECURITY_OPERATION_HALF_EXTENT_PX).toBeCloseTo(securityOperationHalfExtent(arm), 6);
        expect(securityOperationArm(SECURITY_OPERATION_HALF_EXTENT_PX)).toBeCloseTo(arm, 6);
    });

    /**
     * Compared as a **ratio of the drawn arm**, not as a distance. The two halves hand the
     * generator a base in different frames — OpenLayers in projected metres off its own
     * map, MapLibre in degrees through its adapter — so the absolute numbers are not
     * comparable and were never the thing at issue. The shape is: two arms and the gap
     * between them, which is what both must build from the same two points.
     */
    it.each(SECURITY_OPERATIONS)('is built to the same proportions on both engines — %s', name => {
        const armSpan = (span: number, arm: number) => span / arm;
        const ol = armSpan(openlayersSpan(name), OL_ARM);
        const mlb = armSpan(maplibreSpan(name), MLB_ARM);
        expect(ol).toBeGreaterThan(0);
        expect(ol).toBeCloseTo(mlb, 3);
        // Two arms plus the gap, which is 0.21 of an arm either side of the centre.
        expect(ol).toBeCloseTo(2.42, 2);
    });

    it('grows with the arm rather than holding a screen size', () => {
        // Twice the arm is twice the symbol. A pinned symbol would return the same span.
        const short = maplibreSpan(TacticalGraphicName.Cover);
        const long = (() => {
            const built = buildTacticalGraphic(
                TacticalGraphicName.Cover, {type: 'LineString', coordinates: [[0, 0], [0.8, 0]]}, {}, RES);
            const xs = (built!.graphic.geometry as {coordinates: number[][][]}).coordinates.flat().map(([x]) => x);
            return Math.max(...xs) - Math.min(...xs);
        })();
        expect(long / short).toBeCloseTo(2, 1);
    });
});
