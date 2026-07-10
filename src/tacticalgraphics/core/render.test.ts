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
