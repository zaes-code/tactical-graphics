import {readFileSync} from 'fs';
import {join} from 'path';
import * as turf from './turf';
import {Feature, MultiLineString, Position} from 'geojson';
import {anchorsForBow} from './anchors';
import {TURN_DEFAULT_BEND} from '../graphics/Turn';
import {
    isTacticalGraphicFeature,
    listTacticalGraphicNames,
    readTacticalGraphicProperties,
    renderTacticalGraphic,
    TacticalGraphicError,
    toFeatureCollection,
} from './render';
import {TacticalGraphicHostility, TacticalGraphicName} from './type';

const axisFeature = (): Feature => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates: [[-77.04, 38.89], [-76.95, 38.95]]},
    properties: {
        tacticalGraphic: {
            name: TacticalGraphicName.MainAxisOfAdvance,
            label: '1-508 IN',
            hostility: TacticalGraphicHostility.friend,
            width: 300,
        },
    },
});

const secureFeature = (): Feature => ({
    type: 'Feature',
    geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
    properties: {tacticalGraphic: {name: TacticalGraphicName.Secure, radius: 1000, rotation: 0}},
});

describe('registry', () => {
    it('registers graphics', () => {
        expect(listTacticalGraphicNames().length).toBeGreaterThan(150);
    });
});

/**
 * The retrograde tasks are a base line, an arrowhead and a half-circle "cane"
 * hook, all three built by `getCaneArrow`.
 *
 * The hook used to be constructed at **absolute compass bearings** — its arc
 * center pinned due north of the start, the sweep a fixed 180°–360° with an
 * `end[0] >= start[0]` flip for lines drawn right-to-left. The line and the
 * arrowhead follow the drawn coordinates, so rotating one of these graphics
 * turned those two and left the hook pointing wherever it had always pointed.
 *
 * These assert the hook's placement is a function of the line's bearing, which
 * is the property that was missing. They fail against the absolute construction.
 */
describe('the retrograde cane hook follows its line', () => {
    const START: [number, number] = [-77.0, 38.9];

    /** A retirement drawn from START along `bearing`; returns its arc and tip. */
    const cane = (bearing: number) => {
        const end = turf.destination(START, 5, bearing, {units: 'kilometers'}).geometry.coordinates;
        const {graphic} = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: [START, end]},
            properties: {tacticalGraphic: {name: TacticalGraphicName.Retirement, radius: 1500}},
        });
        const parts = (graphic.geometry as MultiLineString).coordinates;
        return {end, arc: parts[parts.length - 1]};
    };

    /** Where the hook's free end sits, as an angle off the line's own bearing. */
    const hookOffset = (bearing: number): number => {
        const {end, arc} = cane(bearing);
        const delta = turf.bearing(START, arc[arc.length - 1]) - turf.bearing(START, end);
        return ((delta % 360) + 360) % 360;
    };

    const reference = hookOffset(90);

    it.each([0, 45, 180, 270, 315])('holds the hook at the same relative angle on bearing %s', b => {
        // Shortest angular distance, so 359° and 1° read as 2° apart.
        const spread = Math.abs((((hookOffset(b) - reference) % 360) + 540) % 360 - 180);
        expect(spread).toBeLessThan(2);
    });

    it('starts the arc at the rear of the symbol, which is the line\'s last point', () => {
        // APP-06 340800 numbers the cane from its head -- "Point 1 defines the tip of the
        // arrowhead. Point 2 defines the end of the straight line portion" -- so the arc
        // hangs off the *end* of the drawn line. It used to hang off the start, back when
        // these graphics stored their points rear-first. @see core/drawOrder
        const {end, arc} = cane(37);
        expect(turf.distance(end, arc[0], {units: 'meters'})).toBeLessThan(1);
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
    properties: {tacticalGraphic: {name, radius: 1000, rotation: 0}},
});

describe('crossed mission tasks', () => {
    const CROSSED = [
        TacticalGraphicName.Destroy,
        TacticalGraphicName.Interdict,
        TacticalGraphicName.Neutralize,
        TacticalGraphicName.Suppress,
    ];

    /**
     * All four, as of 2026-08-17. They were fixed-size badges pinned to a constant 100 px,
     * so the centre was the only handle worth publishing — an edge handle would have
     * offered a dimension that could not change. They now cover ground and scale with it.
     */
    it.each(CROSSED)('%s publishes [edge, center], so the edge can be dragged', name => {
        const {handles} = renderTacticalGraphic(pointTask(name));
        const coords = (handles.geometry as any).coordinates;
        expect(coords).toHaveLength(2);
        // Edge first — the order the controllers depend on. The centre is the anchor.
        expect(coords[1]).toEqual([-77.0, 38.9]);
        expect(coords[0]).not.toEqual([-77.0, 38.9]);
    });

    it.each(CROSSED)('%s emits both arms whole, centered on the base point', name => {
        const {graphic} = renderTacticalGraphic(pointTask(name));
        const lines = (graphic.geometry as any).coordinates as number[][][];
        expect(graphic.geometry.type).toBe('MultiLineString');
        expect(lines.length).toBeGreaterThanOrEqual(2);
        // The style function opens the label gap, so each arm must arrive as a
        // single unbroken 2-point line through the center.
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
    // Since the APP-06 conversion the base is 270504's three anchor points rather than a
    // dropped center. Built from the same center, size and bend the dropped form used,
    // so every assertion below is still asking the same question of the same shape.
    const TURN_CENTER: Position = [-77.0, 38.9];
    const turn = () =>
        renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: anchorsForBow(TURN_CENTER, 1000, 0, TURN_DEFAULT_BEND)},
            properties: {tacticalGraphic: {name: TacticalGraphicName.TacticalTurn}},
        });

    it('publishes [bend, arrowTip, center] — the center last, per the point convention', () => {
        const coords = (turn().handles.geometry as any).coordinates as number[][];
        expect(coords).toHaveLength(3);
        expect(coords[2][0]).toBeCloseTo(TURN_CENTER[0], 9);
        expect(coords[2][1]).toBeCloseTo(TURN_CENTER[1], 9);
    });

    it('puts the arrow-tip handle on the point of the arrowhead', () => {
        const {handles, graphic} = turn();
        const tip = ((handles.geometry as any).coordinates as number[][])[1];
        const [curve] = (graphic.geometry as any).geometries;
        const curveEnd = (curve.coordinates[1] as number[][]).slice(-1)[0];
        expect(tip[0]).toBeCloseTo(curveEnd[0], 6);
        expect(tip[1]).toBeCloseTo(curveEnd[1], 6);
    });

    it('puts the bend handle off the curve, on the perpendicular through the center', () => {
        const {handles, graphic} = turn();
        const coords = (handles.geometry as any).coordinates as number[][];
        const bendHandle = coords[0];
        const center = coords[2];
        // Rotation is 0, so the chord runs east–west and the handle must be
        // due north or south of the center — never along the chord.
        expect(bendHandle[0]).toBeCloseTo(center[0], 6);
        expect(bendHandle[1]).not.toBeCloseTo(center[1], 6);
        // It is the Bézier control point, so it sits twice as far out as the
        // curve's apex — that is what keeps it clear of the "T".
        const [curve] = (graphic.geometry as any).geometries;
        const apex = (curve.coordinates[1] as number[][])[0];
        const apexOffset = Math.abs(apex[1] - center[1]);
        expect(Math.abs(bendHandle[1] - center[1])).toBeGreaterThan(apexOffset);
    });

    it('bends more sharply for a larger bend, and the other way for a negative one', () => {
        // The bow is a drawn point now, so it is set by moving anchor point 3 rather
        // than by an amplifier. Same question, stated the way the symbol states it.
        const apexOf = (bend: number) => {
            const f: Feature = {
                type: 'Feature',
                geometry: {type: 'LineString', coordinates: anchorsForBow(TURN_CENTER, 1000, 0, bend)},
                properties: {tacticalGraphic: {name: TacticalGraphicName.TacticalTurn}},
            };
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
            const f: Feature = {
                type: 'Feature',
                geometry: {type: 'LineString', coordinates: anchorsForBow(TURN_CENTER, size, 0, TURN_DEFAULT_BEND)},
                properties: {tacticalGraphic: {name: TacticalGraphicName.TacticalTurn, headSize: 300}},
            };
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
        // the base point the center handle occupies.
        expect(label).not.toEqual([-77.0, 38.9]);
        expect(Math.hypot(label[0] - before[before.length - 1][0], label[1] - before[before.length - 1][1]))
            .toBeLessThan(Math.hypot(label[0] - before[0][0], label[1] - before[0][1]));
    });
});

/**
 * The obstacle graphics emit the drawn shape, undecorated.
 *
 * Their teeth used to be baked in here, sized from the drawing resolution — so they were
 * fixed in meters and grew on screen as the map zoomed in. Crenellation carries no
 * measurement, so it belongs in a style function at a constant number of screen pixels,
 * which is where it now lives (`obstacleAreaStyles`). The cost is deliberate: a consumer
 * rendering this GeoJSON outside the OpenLayers entry point gets the plain shape, the
 * same contract `StrongPoint` has always had.
 */
describe('decorated graphics emit the drawn shape', () => {
    const RING = [[-77.10, 38.85], [-77.10, 38.95], [-77.00, 38.95], [-77.00, 38.85], [-77.10, 38.85]];

    const area = (name: TacticalGraphicName): Feature => ({
        type: 'Feature',
        geometry: {type: 'Polygon', coordinates: [RING]},
        properties: {tacticalGraphic: {name, radius: 30}},
    });

    it.each([
        TacticalGraphicName.ObstacleBelt,
        TacticalGraphicName.ObstacleGroup,
        TacticalGraphicName.ObstacleZone,
        TacticalGraphicName.ObstacleFreeArea,
        TacticalGraphicName.ObstacleRestrictedArea,
    ])('%s returns its ring unchanged', name => {
        const geometry = renderTacticalGraphic(area(name)).graphic.geometry as any;
        expect(geometry.type).toBe('Polygon');
        expect(geometry.coordinates[0]).toEqual(RING);
    });

    it('ObstacleLine returns the drawn line unchanged', () => {
        const drawn = [[-77.05, 38.88], [-76.99, 38.91], [-76.95, 38.93]];
        const geometry = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: drawn},
            properties: {tacticalGraphic: {name: TacticalGraphicName.ObstacleLine, radius: 30}},
        }).graphic.geometry as any;
        expect(geometry.type).toBe('LineString');
        expect(geometry.coordinates).toEqual(drawn);
    });

    it.each([
        [TacticalGraphicName.FortifiedLine, 'LineString'],
        [TacticalGraphicName.ForwardLineOfOwnTroops, 'LineString'],
        [TacticalGraphicName.LineOfContact, 'LineString'],
    ])('%s returns the drawn line unchanged too', (name, type) => {
        // Their merlons and scallops moved to the style layer for the same reason: both
        // were sized from the drawing resolution and then fixed in meters. The line of
        // contact is the sharpest case — the *gap between its two waves* is what the
        // symbol says, and baked in it changed with zoom.
        const drawn = [[-77.05, 38.88], [-76.99, 38.91], [-76.95, 38.93]];
        const geometry = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'LineString', coordinates: drawn},
            properties: {tacticalGraphic: {name, radius: 30}},
        }).graphic.geometry as any;
        expect(geometry.type).toBe(type);
        expect(geometry.coordinates).toEqual(drawn);
    });

    it('FortifiedArea returns its ring unchanged', () => {
        const geometry = renderTacticalGraphic({
            type: 'Feature',
            geometry: {type: 'Polygon', coordinates: [RING]},
            properties: {tacticalGraphic: {name: TacticalGraphicName.FortifiedArea, radius: 30}},
        }).graphic.geometry as any;
        expect(geometry.type).toBe('Polygon');
        expect(geometry.coordinates[0]).toEqual(RING);
    });

    it('still stamps the properties and role onto that output', () => {
        const rendered = renderTacticalGraphic(area(TacticalGraphicName.ObstacleBelt));
        expect(rendered.graphic.properties!.role).toBe('graphic');
        expect(rendered.graphic.properties!.tacticalGraphic.name).toBe(TacticalGraphicName.ObstacleBelt);
    });
});

/**
 * The README quotes numbers that come from the code, and they drift silently — the
 * "supported names" figure in its Errors section was 199 against a registry of 195, and
 * the intro count sat at 201 against 207 until the tracker generator was taught to own
 * it. Nothing renders wrong when they rot; the docs just quietly start lying.
 *
 * The tracker-derived tables have `gen-readme-graphics-table.py --check`. This is the
 * one number that comes from the registry instead, so it needs its own guard.
 */
describe('README stays honest about the registry', () => {
    const readme = readFileSync(join(__dirname, '..', '..', '..', 'README.md'), 'utf8');

    it('quotes the real number of registered graphics in its error example', () => {
        const quoted = readme.match(/see\s+the\s+(\d+)\s+supported names/s);
        expect(quoted).not.toBeNull();
        expect(Number(quoted![1])).toBe(listTacticalGraphicNames().length);
    });
});

/**
 * The arc-and-arrowhead circles leave a hole for their one-letter label. It is a
 * *fraction of the circle*, which is the best a generator can do with no glyph to
 * measure — but a renderer that can measure one asks for none and cuts its own.
 */
describe('labelGapDegrees on the arc mission tasks', () => {
    /** Bearings of an arc's two ends, relative to the label axis, in degrees. */
    const arcEnds = (feature: Feature, subLine: number): [number, number] => {
        const {graphic} = renderTacticalGraphic(feature);
        const geom = graphic.geometry as {type: string; coordinates: number[][][]};
        const center = (feature.geometry as {coordinates: number[]}).coordinates;
        const line = geom.coordinates[subLine];
        // Planar angle about the center, 0 = east — the frame `createCircularArc`
        // works in. Longitude has to be scaled by cos(lat) first: a degree of it
        // is not a degree of latitude anywhere but the equator, and without the
        // correction a 15° arc end reads as 19°.
        const lonScale = Math.cos((center[1] * Math.PI) / 180);
        const at = (p: number[]) => (Math.atan2(p[1] - center[1], (p[0] - center[0]) * lonScale) * 180) / Math.PI;
        return [at(line[0]), at(line[line.length - 1])];
    };

    const secureWith = (labelGapDegrees?: number): Feature => ({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [-77.0, 38.9]},
        properties: {tacticalGraphic: {name: TacticalGraphicName.Secure, radius: 1000, rotation: 0, labelGapDegrees}},
    });

    it('defaults to a 15° half-gap, so a raw-GeoJSON consumer gets a legible hole', () => {
        const [upperStart] = arcEnds(secureWith(), 0);
        const [, lowerEnd] = arcEnds(secureWith(), 1);
        expect(upperStart).toBeCloseTo(15, 0);
        expect(lowerEnd).toBeCloseTo(-15, 0);
    });

    it('runs the arcs to the label axis when asked for none', () => {
        const [upperStart] = arcEnds(secureWith(0), 0);
        const [, lowerEnd] = arcEnds(secureWith(0), 1);
        expect(Math.abs(upperStart)).toBeLessThan(0.5);
        expect(Math.abs(lowerEnd)).toBeLessThan(0.5);
    });

    it('leaves the arrowhead gap alone — only the label side moves', () => {
        for (const gap of [undefined, 0]) {
            const [, upperEnd] = arcEnds(secureWith(gap), 0);
            const [lowerStart] = arcEnds(secureWith(gap), 1);
            expect(upperEnd).toBeCloseTo(175, 0);
            expect(lowerStart).toBeCloseTo(-155, 0);
        }
    });
});
