import {Feature, LineString, Point, Polygon, Position} from 'geojson';
import * as turf from './turf';
import geometryService from './GeometryService';

/**
 * Characterization ("golden master") tests, not correctness tests.
 *
 * GeometryService has no unit coverage of its own (per CLAUDE.md, it's normally
 * verified by eyeballing the demo app). Before splitting this ~2400-line class
 * into topic files, this suite pins down what every method currently returns
 * for a representative input — bugs and all. If a later refactor (a pure code
 * move, or a `this.foo()` → `foo()` conversion) changes any snapshot, that's a
 * real behavior change to investigate, not something this suite tries to judge
 * as right or wrong.
 *
 * Fixture coordinates match the repo's existing test convention (see
 * core/render.test.ts): a line roughly DC-to-Baltimore in EPSG:4326.
 */

const P0: Position = [-77.04, 38.89];
const P1: Position = [-76.95, 38.95];
const MID: Position = [-77.0, 38.92];
const CENTROID: Position = [-77.0, 38.9];

const SQUARE_RING: Position[] = [
    [-77.04, 38.89],
    [-76.95, 38.89],
    [-76.95, 38.95],
    [-77.04, 38.95],
    [-77.04, 38.89],
];

const lineFeature = (coords: Position[] = [P0, P1]): Feature<LineString> => turf.lineString(coords);
const pointFeature = (coord: Position = P0): Feature<Point> => turf.point(coord);
const polygonFeature = (ring: Position[] = SQUARE_RING): Feature<Polygon> => turf.polygon([ring]);
const rawPolygon = (ring: Position[] = SQUARE_RING): Polygon => ({type: 'Polygon', coordinates: [ring]});

describe('GeometryService — primitives', () => {
    it('rotate', () => {
        expect(geometryService.rotate(lineFeature(), 45, CENTROID)).toMatchSnapshot();
    });

    it('translate', () => {
        expect(geometryService.translate(lineFeature(), 500, 90)).toMatchSnapshot();
    });

    it('scale', () => {
        expect(geometryService.scale(lineFeature(), 1.5, CENTROID)).toMatchSnapshot();
    });

    it('getCenter — Point, LineString, Polygon', () => {
        expect(geometryService.getCenter(pointFeature())).toMatchSnapshot('point');
        expect(geometryService.getCenter(lineFeature())).toMatchSnapshot('linestring');
        expect(geometryService.getCenter(polygonFeature())).toMatchSnapshot('polygon');
    });

    it('createCircle', () => {
        expect(geometryService.createCircle(CENTROID, 300)).toMatchSnapshot();
    });

    it('toRadians', () => {
        expect(geometryService.toRadians(180)).toMatchSnapshot();
    });

    it('calculateLineAngle', () => {
        expect(geometryService.calculateLineAngle(P0, P1)).toMatchSnapshot();
    });

    it('translateCoordinates', () => {
        expect(geometryService.translateCoordinates(P0, 300, Math.PI / 4)).toMatchSnapshot();
    });

    it('getPerpendicularPoint', () => {
        expect(geometryService.getPerpendicularPoint(P1, P0, 200)).toMatchSnapshot();
    });

    it('unitVector', () => {
        expect(geometryService.unitVector(P0, P1)).toMatchSnapshot();
    });

    it('getCurveTangentAtEnd', () => {
        expect(geometryService.getCurveTangentAtEnd([P0, MID, P1])).toMatchSnapshot();
    });

    it('getExtendedPoint', () => {
        expect(geometryService.getExtendedPoint(P1, P0, 300)).toMatchSnapshot();
    });

    it('trimLineEnd', () => {
        expect(geometryService.trimLineEnd([P0, MID, P1], 500)).toMatchSnapshot();
    });

    it('getMidpoint', () => {
        expect(geometryService.getMidpoint(P0, P1)).toMatchSnapshot();
    });

    it('labelCoordsAtFraction', () => {
        expect(geometryService.labelCoordsAtFraction(P0, P1, 0.5, 100)).toMatchSnapshot();
    });

    it('project / unproject round-trip', () => {
        const projected = geometryService.project(P0);
        expect(projected).toMatchSnapshot('project');
        expect(geometryService.unproject(projected)).toMatchSnapshot('unproject');
    });

    it('computeParallelLineString', () => {
        expect(geometryService.computeParallelLineString([P0, MID, P1], 200)).toMatchSnapshot();
    });

    it('reflectAcrossYAxis', () => {
        expect(geometryService.reflectAcrossYAxis(lineFeature(), -77.0)).toMatchSnapshot();
    });

    it('getPolygonCenter', () => {
        expect(geometryService.getPolygonCenter(polygonFeature())).toMatchSnapshot();
    });

    it('computeOuterTangents', () => {
        expect(geometryService.computeOuterTangents(P0, P1, 300)).toMatchSnapshot();
    });

    it('offsetRingOutward — clockwise ring', () => {
        expect(geometryService.offsetRingOutward(SQUARE_RING, 200)).toMatchSnapshot();
    });

    it('offsetRingOutward — counter-clockwise ring', () => {
        expect(geometryService.offsetRingOutward([...SQUARE_RING].reverse(), 200)).toMatchSnapshot();
    });

    it('offsetRingOutward — no-op below three points or non-positive distance', () => {
        expect(geometryService.offsetRingOutward(SQUARE_RING, 0)).toEqual(SQUARE_RING);
        expect(geometryService.offsetRingOutward([P0, P1], 200)).toEqual([P0, P1]);
    });
});

describe('GeometryService — arcs, radials, circular', () => {
    it('createCircularArc', () => {
        expect(geometryService.createCircularArc(CENTROID, 0, 500, 0, 180)).toMatchSnapshot();
    });

    it('arcMidpoint', () => {
        expect(geometryService.arcMidpoint(CENTROID, 0, 500, 0, 90)).toMatchSnapshot();
    });

    it('generateRadialLineStrings', () => {
        expect(geometryService.generateRadialLineStrings(CENTROID, 0, 500, 0, 180, 300, 4)).toMatchSnapshot();
    });

    it('generateArcTrianglesWithGap — line segments', () => {
        expect(geometryService.generateArcTrianglesWithGap(CENTROID, 500, 0, 0, 180, 100, 3)).toMatchSnapshot();
    });

    it('generateArcTrianglesWithGap — closed polygons', () => {
        expect(geometryService.generateArcTrianglesWithGap(CENTROID, 500, 0, 0, 180, 100, 3, 15, true)).toMatchSnapshot();
    });

    it('computeIsoscelesApexPoint', () => {
        expect(geometryService.computeIsoscelesApexPoint(P0, P1, 200, CENTROID)).toMatchSnapshot();
    });
});

describe('GeometryService — arrowheads', () => {
    it('computeArrowheadPoints', () => {
        expect(geometryService.computeArrowheadPoints(P0, P1, 100, 45)).toMatchSnapshot();
    });

    it('computeArrowheadPointsProjected', () => {
        expect(geometryService.computeArrowheadPointsProjected([0, 0], [100, 50], 20, 45)).toMatchSnapshot();
    });

    it('createArrowHeadPolygon', () => {
        expect(geometryService.createArrowHeadPolygon(P1, geometryService.unitVector(P0, P1), 100)).toMatchSnapshot();
    });

    it('createMainAttackArrow', () => {
        const base = [P0, MID, P1];
        const left = [P0, [-76.98, 38.93] as Position];
        const right = [P0, [-76.97, 38.91] as Position];
        expect(geometryService.createMainAttackArrow(base, left, right, 150)).toMatchSnapshot();
    });

    it('createExtendedArrow', () => {
        const arrowCoords = geometryService.computeArrowheadPoints(P0, P1, 100, 45);
        expect(geometryService.createExtendedArrow(arrowCoords, 100, turf.bearing(P0, P1))).toMatchSnapshot();
    });

    it('createDirectionOfMainAttackArrow', () => {
        expect(geometryService.createDirectionOfMainAttackArrow([P0, MID, P1], 100)).toMatchSnapshot();
    });

    it('createDirectionOfFeintAttackArrow', () => {
        expect(geometryService.createDirectionOfFeintAttackArrow([P0, MID, P1], 100)).toMatchSnapshot();
    });

    it('getSearchArrowLine', () => {
        expect(geometryService.getSearchArrowLine(pointFeature([0, 0]), 50, 300, 100)).toMatchSnapshot();
    });

    it('getSearchAreaArrow', () => {
        expect(geometryService.getSearchAreaArrow(50, 300, 100, 80, 45)).toMatchSnapshot();
    });

    it('getCaneArrow — end east of start', () => {
        expect(geometryService.getCaneArrow(lineFeature([P0, P1]), 150, 100)).toMatchSnapshot();
    });

    it('getCaneArrow — end west of start', () => {
        expect(geometryService.getCaneArrow(lineFeature([P1, P0]), 150, 100)).toMatchSnapshot();
    });

    it('getCaneArrow — mirrored', () => {
        expect(geometryService.getCaneArrow(lineFeature([P0, P1]), 150, 100, true)).toMatchSnapshot();
    });

    it('getCaneArrow — single-point base (draw in progress) returns empty geometry', () => {
        // turf.lineString() itself rejects a 1-point array, so this bypasses the
        // helper and builds the in-progress-draw feature turf would refuse.
        const inProgress: Feature<LineString> = {type: 'Feature', geometry: {type: 'LineString', coordinates: [P0]}, properties: {}};
        expect(geometryService.getCaneArrow(inProgress, 150, 100)).toMatchSnapshot();
    });

    it('getBlockArrow', () => {
        expect(geometryService.getBlockArrow(lineFeature(), 150)).toMatchSnapshot();
    });
});

describe('GeometryService — waves, bends, S-curves, dashes, zigzag', () => {
    it('lineStringToWave', () => {
        expect(geometryService.lineStringToWave(lineFeature([P0, MID, P1]), 500, 100, 8)).toMatchSnapshot();
    });

    it('createSemicircle', () => {
        expect(geometryService.createSemicircle(P0, P1, turf.bearing(P0, P1), 100, 8)).toMatchSnapshot();
    });

    it('bendLine', () => {
        expect(geometryService.bendLine([P0, P1], 5, 40, 8)).toMatchSnapshot();
    });

    it('bendLineThroughApex', () => {
        expect(geometryService.bendLineThroughApex([P0, P1], MID, 8)).toMatchSnapshot();
    });

    it('createSCurve', () => {
        expect(geometryService.createSCurve(P0, P1, MID, 4)).toMatchSnapshot();
    });

    it('generateZigZag', () => {
        expect(geometryService.generateZigZag([P0, P1], 60, 5, 4)).toMatchSnapshot();
    });

    it('lineStringToDashes', () => {
        expect(geometryService.lineStringToDashes([P0, MID, P1], [20, 10])).toMatchSnapshot();
    });

    it('lineStringToDashes — clamps an absurdly fine pattern on a long line', () => {
        const farAway: Position = [-70.0, 42.0]; // ~750km from P0, at [10, 10] meter dashes: 75,000+ naive dashes
        const result = geometryService.lineStringToDashes([P0, farAway], [10, 10]);
        expect(result.geometry.coordinates.length).toBeLessThanOrEqual(250);
        expect(result).toMatchSnapshot();
    });

    it('simpleLineToCrowbar', () => {
        expect(geometryService.simpleLineToCrowbar([P0, P1], 100, 'right')).toMatchSnapshot();
    });

    it('passageLineGraphic', () => {
        expect(geometryService.passageLineGraphic([P0, P1], 100)).toMatchSnapshot();
    });

    it('getBridgeLabelPoints', () => {
        expect(geometryService.getBridgeLabelPoints([P0, P1], 200)).toMatchSnapshot();
    });
});

describe('GeometryService — toothed/crenellated shapes', () => {
    it('generatePolygonTriangles — clockwise ring', () => {
        expect(geometryService.generatePolygonTriangles([SQUARE_RING], 300, 150, 100)).toMatchSnapshot();
    });

    it('generatePolygonTriangles — counter-clockwise ring', () => {
        // Reversing the ring also reverses which vertex the greedy spacing walk
        // starts from, so an off-by-one triangle count between windings is
        // expected — this snapshot exists to catch the winding *direction* fix
        // regressing, not to assert an exact count match against the clockwise case.
        expect(geometryService.generatePolygonTriangles([[...SQUARE_RING].reverse()], 300, 150, 100, true)).toMatchSnapshot();
    });

    it('generateMultiLineStringTriangles', () => {
        const multi = [
            [SQUARE_RING[0], SQUARE_RING[1]],
            [SQUARE_RING[2], SQUARE_RING[3]],
        ];
        expect(geometryService.generateMultiLineStringTriangles(multi, 300, 150, 100)).toMatchSnapshot();
    });

    it('generateFixGraphic', () => {
        expect(geometryService.generateFixGraphic([P0, P1], 200, 100, 50)).toMatchSnapshot();
    });

    it('fortifiedAreaGraphic', () => {
        expect(geometryService.fortifiedAreaGraphic(rawPolygon(), 300, 200, 100)).toMatchSnapshot();
    });

    it('generateCrenellatedLineGraphic', () => {
        expect(geometryService.generateCrenellatedLineGraphic([P0, MID, P1], 300, 200, 100)).toMatchSnapshot();
    });
});

describe('GeometryService — labels', () => {
    it('generateLabelGaps', () => {
        expect(
            geometryService.generateLabelGaps(rawPolygon(), {rotationRad: 0, gapSize: 500}),
        ).toMatchSnapshot();
    });
});

describe('GeometryService — mission-task block graphics', () => {
    const base3 = [P0, MID, P1];

    it('getFirePositionBracket', () => {
        expect(geometryService.getFirePositionBracket(P0, turf.bearing(P0, P1), 50)).toMatchSnapshot();
    });

    it('getAttackByFireSymbol', () => {
        expect(geometryService.getAttackByFireSymbol([P0, P1], 50)).toMatchSnapshot();
    });

    it('getSupportByFireSymbol', () => {
        expect(geometryService.getSupportByFireSymbol([P0, P1], 50)).toMatchSnapshot();
    });

    it('getBreachArrow', () => {
        expect(geometryService.getBreachArrow(base3, 100, 30, -30)).toMatchSnapshot();
    });

    it('getBypassArrow', () => {
        expect(geometryService.getBypassArrow(base3, 100)).toMatchSnapshot();
    });

    it('getClearGraphic — default overhang', () => {
        expect(geometryService.getClearGraphic(base3, 100)).toMatchSnapshot();
    });

    it('getClearGraphic — explicit halfHeight', () => {
        expect(geometryService.getClearGraphic(base3, 100, 250)).toMatchSnapshot();
    });

    it('getPenetrationArrowGraphic', () => {
        expect(geometryService.getPenetrationArrowGraphic(base3, 100)).toMatchSnapshot();
    });

    it('getExploitationArrowGraphic', () => {
        expect(geometryService.getExploitationArrowGraphic(base3, 100)).toMatchSnapshot();
    });

    it('getDisruptGraphic', () => {
        expect(geometryService.getDisruptGraphic([P0, P1], 100)).toMatchSnapshot();
    });
});
