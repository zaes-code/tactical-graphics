import {Feature} from 'geojson';
import {
    isTacticalGraphicFeature,
    listTacticalGraphicNames,
    readTacticalGraphicProperties,
    renderTacticalGraphic,
    TacticalGraphicError,
    toFeatureCollection,
} from './render';
import {TacticalGraphicHostility, TacticalGraphicName} from './type';
import {booleanPointInPolygon, point, polygon} from '@turf/turf';

const axisFeature = (): Feature => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: [[-77.04, 38.89], [-76.95, 38.95]]},
    properties: {
        tacticalGraphic: {
            name: TacticalGraphicName.MainAxisOfAdvance,
            label: '1-508 IN',
            hostility: TacticalGraphicHostility.friend,
            radius: 300,
        },
    },
});

const secureFeature = (): Feature => ({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
    properties: {tacticalGraphic: {name: TacticalGraphicName.Secure, size: 1000, rotation: 0}},
});

describe('registry', () => {
    it('registers graphics', () => {
        expect(listTacticalGraphicNames().length).toBeGreaterThan(150);
    });
});

describe('readTacticalGraphicProperties', () => {
    it('reads the config off a feature', () => {
        expect(readTacticalGraphicProperties(axisFeature())?.label).toBe('1-508 IN');
    });

    it('returns undefined when absent', () => {
        const bare: Feature = {type: 'Feature', geometry: {type: 'Point', coordinates: [0, 0]}, properties: {}};
        expect(readTacticalGraphicProperties(bare)).toBeUndefined();
        expect(isTacticalGraphicFeature(bare)).toBe(false);
    });
});

describe('renderTacticalGraphic', () => {
    it('renders a line graphic to GeoJSON', () => {
        const {graphic, labels, handles} = renderTacticalGraphic(axisFeature());
        expect(graphic.geometry.type).toBe('MultiLineString');
        expect(labels.geometry.type).toBe('MultiPoint');
        expect(handles.geometry.type).toBe('MultiPoint');
    });

    it('renders a point graphic, handles ordered [edge, center]', () => {
        const {graphic, handles} = renderTacticalGraphic(secureFeature());
        expect(graphic.geometry).toBeDefined();
        expect((handles.geometry as any).coordinates).toHaveLength(2);
    });

    it('carries properties.tacticalGraphic onto every output feature', () => {
        const {graphic, labels, handles} = renderTacticalGraphic(axisFeature());
        for (const f of [graphic, labels, handles]) {
            expect((f.properties as any).tacticalGraphic.label).toBe('1-508 IN');
        }
    });

    it('stamps a role on each output feature', () => {
        const {graphic, labels, handles} = renderTacticalGraphic(axisFeature());
        expect((graphic.properties as any).role).toBe('graphic');
        expect((labels.properties as any).role).toBe('label');
        expect((handles.properties as any).role).toBe('handle');
    });

    it('lets overrides beat feature properties', () => {
        const small = renderTacticalGraphic(axisFeature(), {radius: 50} as any);
        const big = renderTacticalGraphic(axisFeature(), {radius: 5000} as any);
        const head = (r: any) => JSON.stringify(r.graphic.geometry.coordinates[0][0]);
        expect(head(small)).not.toEqual(head(big));
    });

    it('does not mutate the input feature geometry', () => {
        const input = axisFeature();
        const before = JSON.stringify(input.geometry);
        renderTacticalGraphic(input);
        expect(JSON.stringify(input.geometry)).toBe(before);
    });
});

describe('renderTacticalGraphic errors', () => {
    it('explains a missing config', () => {
        const bare: Feature = {type: 'Feature', geometry: {type: 'Point', coordinates: [0, 0]}, properties: {}};
        expect(() => renderTacticalGraphic(bare)).toThrow(TacticalGraphicError);
        expect(() => renderTacticalGraphic(bare)).toThrow(/properties\.tacticalGraphic/);
    });

    it('explains an unknown graphic name', () => {
        const bad = {...axisFeature(), properties: {tacticalGraphic: {name: 'NotARealGraphic'}}} as Feature;
        expect(() => renderTacticalGraphic(bad)).toThrow(/Unknown tactical graphic "NotARealGraphic"/);
    });

    it('explains a geometry-type mismatch', () => {
        const bad = {...secureFeature(), geometry: {type: 'LineString', coordinates: [[0, 0], [1, 1]]}} as Feature;
        expect(() => renderTacticalGraphic(bad)).toThrow(/expects a Point base geometry, got LineString/);
    });
});

describe('toFeatureCollection', () => {
    it('returns graphic + label by default', () => {
        const fc = toFeatureCollection(renderTacticalGraphic(axisFeature()));
        expect(fc.type).toBe('FeatureCollection');
        expect(fc.features.map(f => (f.properties as any).role)).toEqual(['graphic', 'label']);
    });

    it('includes handles on request', () => {
        const fc = toFeatureCollection(renderTacticalGraphic(axisFeature()), ['graphic', 'label', 'handle']);
        expect(fc.features).toHaveLength(3);
    });

    it('is JSON-serializable', () => {
        const fc = toFeatureCollection(renderTacticalGraphic(axisFeature()));
        expect(() => JSON.parse(JSON.stringify(fc))).not.toThrow();
    });
});

/** A point-anchored tactical mission task at 1 km, unrotated. */
const pointTask = (name: TacticalGraphicName): Feature => ({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
    properties: {tacticalGraphic: {name, size: 1000, rotation: 0}},
});

describe('crossed mission tasks', () => {
    const CROSSED = [
        TacticalGraphicName.Destroy,
        TacticalGraphicName.Interdict,
        TacticalGraphicName.Neutralize,
        TacticalGraphicName.Suppress,
    ];

    it.each(CROSSED)('%s publishes the centre as its only handle', name => {
        const {handles} = renderTacticalGraphic(pointTask(name));
        const coords = (handles.geometry as any).coordinates;
        expect(coords).toHaveLength(1);
        expect(coords[0]).toEqual([-77.0, 38.9]);
    });

    it.each(CROSSED)('%s emits both arms whole, centred on the base point', name => {
        const {graphic} = renderTacticalGraphic(pointTask(name));
        const lines = (graphic.geometry as any).coordinates as number[][][];
        expect(graphic.geometry.type).toBe('MultiLineString');
        expect(lines.length).toBeGreaterThanOrEqual(2);
        // The style function opens the label gap, so each arm must arrive as a
        // single unbroken 2-point line through the centre.
        for (const arm of lines.slice(0, 2)) {
            expect(arm).toHaveLength(2);
            expect((arm[0][0] + arm[1][0]) / 2).toBeCloseTo(-77.0, 5);
            expect((arm[0][1] + arm[1][1]) / 2).toBeCloseTo(38.9, 5);
        }
    });

    it('gives Interdict an arrowhead per arm and the others none', () => {
        const armsAndHeads = (name: TacticalGraphicName) =>
            ((renderTacticalGraphic(pointTask(name)).graphic.geometry as any).coordinates as unknown[]).length;
        expect(armsAndHeads(TacticalGraphicName.Interdict)).toBe(4);
        expect(armsAndHeads(TacticalGraphicName.Destroy)).toBe(2);
        expect(armsAndHeads(TacticalGraphicName.Neutralize)).toBe(2);
        expect(armsAndHeads(TacticalGraphicName.Suppress)).toBe(2);
    });
});

describe('Turn', () => {
    const turn = () => renderTacticalGraphic(pointTask(TacticalGraphicName.TacticalTurn));

    it('publishes [bend, arrowTip, centre] — the centre last, per the point convention', () => {
        const coords = (turn().handles.geometry as any).coordinates as number[][];
        expect(coords).toHaveLength(3);
        expect(coords[2]).toEqual([-77.0, 38.9]);
    });

    it('puts the arrow-tip handle on the point of the arrowhead', () => {
        const {handles, graphic} = turn();
        const tip = ((handles.geometry as any).coordinates as number[][])[1];
        const [curve] = (graphic.geometry as any).geometries;
        const curveEnd = (curve.coordinates[1] as number[][]).slice(-1)[0];
        expect(tip[0]).toBeCloseTo(curveEnd[0], 6);
        expect(tip[1]).toBeCloseTo(curveEnd[1], 6);
    });

    it('puts the bend handle off the curve, on the perpendicular through the centre', () => {
        const {handles, graphic} = turn();
        const coords = (handles.geometry as any).coordinates as number[][];
        const bendHandle = coords[0];
        const centre = coords[2];
        // Rotation is 0, so the chord runs east–west and the handle must be
        // due north or south of the centre — never along the chord.
        expect(bendHandle[0]).toBeCloseTo(centre[0], 6);
        expect(bendHandle[1]).not.toBeCloseTo(centre[1], 6);
        // It is the Bézier control point, so it sits twice as far out as the
        // curve's apex — that is what keeps it clear of the "T".
        const [curve] = (graphic.geometry as any).geometries;
        const apex = (curve.coordinates[1] as number[][])[0];
        const apexOffset = Math.abs(apex[1] - centre[1]);
        expect(Math.abs(bendHandle[1] - centre[1])).toBeGreaterThan(apexOffset);
    });

    it('bends more sharply for a larger bend, and the other way for a negative one', () => {
        const apexOf = (bend: number) => {
            const f = pointTask(TacticalGraphicName.TacticalTurn);
            (f.properties as any).tacticalGraphic.bend = bend;
            const [curve] = (renderTacticalGraphic(f).graphic.geometry as any).geometries;
            return (curve.coordinates[0] as number[][]).slice(-1)[0];
        };
        const shallow = apexOf(0.3);
        const sharp = apexOf(1.2);
        expect(Math.abs(sharp[1] - 38.9)).toBeGreaterThan(Math.abs(shallow[1] - 38.9));
        expect(Math.sign(apexOf(-0.6)[1] - 38.9)).toBe(-Math.sign(apexOf(0.6)[1] - 38.9));
    });

    it('sizes the arrowhead off headSize, so a resize leaves it alone', () => {
        const headSpan = (size: number) => {
            const f = pointTask(TacticalGraphicName.TacticalTurn);
            (f.properties as any).tacticalGraphic.size = size;
            (f.properties as any).tacticalGraphic.headSize = 300;
            const [, head] = (renderTacticalGraphic(f, {headSize: 300} as any).graphic.geometry as any).geometries;
            const ring = head.coordinates[0] as number[][];
            const xs = ring.map(p => p[0]);
            const ys = ring.map(p => p[1]);
            return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        };
        expect(headSpan(2000)).toBeCloseTo(headSpan(1000), 4);
    });

    it('splits the curve around the label and keeps the filled arrowhead', () => {
        const geom = turn().graphic.geometry as any;
        expect(geom.type).toBe('GeometryCollection');
        const [curve, head] = geom.geometries;
        expect(curve.type).toBe('MultiLineString');
        expect(curve.coordinates).toHaveLength(2);
        expect(head.type).toBe('Polygon');
    });

    it('anchors the label on the curve, not on the base point', () => {
        const {labels, graphic} = turn();
        const label = (labels.geometry as any).coordinates as number[];
        const [curve] = (graphic.geometry as any).geometries;
        const before = curve.coordinates[0] as number[][];
        // The label sits in the gap: past the end of the first half, and off
        // the base point the centre handle occupies.
        expect(label).not.toEqual([-77.0, 38.9]);
        expect(Math.hypot(label[0] - before[before.length - 1][0], label[1] - before[before.length - 1][1]))
            .toBeLessThan(Math.hypot(label[0] - before[0][0], label[1] - before[0][1]));
    });
});

/**
 * Teeth belong to the geometry, not to the order the corners were clicked.
 *
 * The tooth apex is placed 90° off the direction of travel along the ring, so which side
 * that lands on depends entirely on the winding — and nothing normalises the winding of
 * what a user draws. Drawing an area clockwise put the teeth outside; drawing the same
 * area anticlockwise put every one of them inside.
 */
describe('obstacle teeth ignore the drawing direction', () => {
    // A square, and the same square with its corners in the opposite order.
    const CLOCKWISE = [[-77.10, 38.85], [-77.10, 38.95], [-77.00, 38.95], [-77.00, 38.85], [-77.10, 38.85]];
    const ANTICLOCKWISE = [...CLOCKWISE].reverse();

    const area = (name: TacticalGraphicName, ring: number[][]): Feature => ({
        type: 'Feature',
        geometry: {type: 'Polygon', coordinates: [ring]},
        properties: {tacticalGraphic: {name, size: 30}},
    });

    /**
     * Apexes are the vertices that leave the drawn edge. Every tooth is pushed as
     * (foot, apex, foot) with both feet on the edge, so a vertex further than a metre or
     * so from the square's outline is an apex — measured against the drawn ring rather
     * than against a tooth count, which would depend on the perimeter maths.
     */
    const apexSides = (name: TacticalGraphicName, ring: number[][]) => {
        const rendered = renderTacticalGraphic(area(name, ring)).graphic.geometry as any;
        const vertices: number[][] = rendered.type === 'Polygon'
            ? rendered.coordinates[0]
            : rendered.coordinates.flat();

        const outside: number[][] = [];
        const inside: number[][] = [];
        vertices.forEach(v => {
            const onEdge = ring.some((_, i) => {
                if (i === ring.length - 1) return false;
                const [ax, ay] = ring[i];
                const [bx, by] = ring[i + 1];
                const [px, py] = v;
                // Perpendicular distance to the drawn edge, in degrees — the teeth stand
                // well clear of it, tooth feet sit on it.
                const dx = bx - ax, dy = by - ay;
                const len2 = dx * dx + dy * dy;
                const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
                return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) < 1e-5;
            });
            if (onEdge) return;
            (booleanPointInPolygon(point(v), polygon([ring])) ? inside : outside).push(v);
        });
        return {outside: outside.length, inside: inside.length};
    };

    it.each([
        TacticalGraphicName.ObstacleBelt,
        TacticalGraphicName.ObstacleGroup,
        TacticalGraphicName.ObstacleZone,
    ])('points %s outward whichever way the area is drawn', name => {
        const cw = apexSides(name, CLOCKWISE);
        const ccw = apexSides(name, ANTICLOCKWISE);

        expect(cw.outside).toBeGreaterThan(0);
        expect(cw.inside).toBe(0);
        expect(ccw.outside).toBeGreaterThan(0);
        expect(ccw.inside).toBe(0);
    });

    it.each([
        TacticalGraphicName.ObstacleFreeArea,
        TacticalGraphicName.ObstacleRestrictedArea,
    ])('points %s inward whichever way the area is drawn', name => {
        const cw = apexSides(name, CLOCKWISE);
        const ccw = apexSides(name, ANTICLOCKWISE);

        expect(cw.inside).toBeGreaterThan(0);
        expect(cw.outside).toBe(0);
        expect(ccw.inside).toBeGreaterThan(0);
        expect(ccw.outside).toBe(0);
    });
});
