/**
 * # The one-call path from rendered GeoJSON to features on a map
 *
 * The three steps existed and had to be assembled in the right order. Missing the extent
 * failed *silently* — every fitted symbol came out at a fixed size in meters and the map
 * still looked plausible — which is the failure this exists to remove.
 */

import {renderTacticalGraphic, TacticalGraphicName} from '@zaes/tactical-graphics';
import {prepareFeatures} from './prepareFeatures';
import {stylesFor} from './stylesFor';
import {toPaintFeature} from './paintToOpenLayers';

const render = (name: TacticalGraphicName, geometry: object) =>
    renderTacticalGraphic({
        type: 'Feature',
        geometry,
        properties: {tacticalGraphic: {name, designation: 'ALPHA'}},
    } as never);

const AREA = {type: 'Polygon', coordinates: [[[-77.1, 38.8], [-76.9, 38.8], [-76.9, 38.95], [-77.1, 38.95], [-77.1, 38.8]]]};
const LINE = {type: 'LineString', coordinates: [[-77.1, 38.8], [-76.9, 38.9]]};

describe('prepareFeatures', () => {
    it('styles the graphic with the same function stylesFor gives', () => {
        const {graphic} = prepareFeatures(render(TacticalGraphicName.ChemicalContaminatedArea, AREA));
        expect(graphic.getStyle()).toBe(stylesFor(TacticalGraphicName.ChemicalContaminatedArea).graphic);
    });

    it('projects into Web Mercator by default', () => {
        const {graphic} = prepareFeatures(render(TacticalGraphicName.PhaseLine, LINE));
        const [x, y] = graphic.getGeometry()!.getExtent();
        // Degrees would be around -77; meters are in the millions.
        expect(Math.abs(x)).toBeGreaterThan(1e6);
        expect(Math.abs(y)).toBeGreaterThan(1e6);
    });

    it('publishes the extent to the label feature, which is what fits a symbol to its area', () => {
        const {graphic, labels} = prepareFeatures(render(TacticalGraphicName.ChemicalContaminatedArea, AREA));
        expect(labels).toBeDefined();
        const paint = toPaintFeature(labels!);
        const [minX, minY, maxX, maxY] = graphic.getGeometry()!.getExtent();
        expect(paint!.bounds).toEqual({minX, minY, maxX, maxY});
        // The outline too — the bounding box says there is room in an L-shaped area's
        // notch, and the ring is what shrinks a glyph until it genuinely fits.
        expect(paint!.ring?.length).toBeGreaterThanOrEqual(3);
    });

    it('returns no label feature for a graphic that keeps its glyphs on the graphic', () => {
        // A phase line's `PL ALPHA` rides its own line work; a styled label feature here
        // is how the designation gets drawn twice.
        expect(stylesFor(TacticalGraphicName.PhaseLine).labels).toBeUndefined();
        expect(prepareFeatures(render(TacticalGraphicName.PhaseLine, LINE)).labels).toBeUndefined();
    });

    it('passes the host\'s name-only choice to both features', () => {
        const bare = prepareFeatures(render(TacticalGraphicName.ChemicalContaminatedArea, AREA));
        expect(bare.graphic.get('hideAmplifiers')).toBeUndefined();

        const hidden = prepareFeatures(render(TacticalGraphicName.ChemicalContaminatedArea, AREA), {hideAmplifiers: true});
        expect(hidden.graphic.get('hideAmplifiers')).toBe(true);
        expect(hidden.labels!.get('hideAmplifiers')).toBe(true);
    });

    it('is the same result as doing the three steps by hand', () => {
        // The parts stay exported; this must not become a second, divergent answer.
        const rendered = render(TacticalGraphicName.ChemicalContaminatedArea, AREA);
        const {graphic, labels} = prepareFeatures(rendered);
        const styles = stylesFor(TacticalGraphicName.ChemicalContaminatedArea);
        expect(graphic.getStyle()).toBe(styles.graphic);
        expect(labels!.getStyle()).toBe(styles.labels);
    });
});
