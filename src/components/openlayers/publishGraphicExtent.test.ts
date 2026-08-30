/**
 * # A host that builds its own features can fit a symbol to its area
 *
 * The CBRN triangle, the airfield's runways and the sector-1 modifier glyphs are fitted to
 * the area they land in, and the fit reads `bounds` and `ring` off the *label* feature —
 * which is a bare anchor with no shape of its own. A holder publishes them while drawing;
 * a host building its own features published nothing, so every fitted symbol fell back to
 * a fixed size in metres and came out tiny once the draw was committed.
 */

import Feature from 'ol/Feature';
import {LineString, Point, Polygon} from 'ol/geom';
import {publishGraphicExtent} from './publishGraphicExtent';
import {toPaintFeature} from './paintToOpenLayers';

import {TacticalGraphicName} from '@zaes/tactical-graphics';

/** `toPaintFeature` is optional-returning; a missing one is a failure, not "no bounds". */
const paintOf = (f: Feature) => {
    const paint = toPaintFeature(f);
    if (!paint) throw new Error('toPaintFeature returned nothing for the label feature');
    return paint;
};

const RING = [[0, 0], [400, 0], [400, 300], [0, 300], [0, 0]];

const labelFeature = () => {
    const f = new Feature({geometry: new Point([200, 150])});
    f.set('graphicName', TacticalGraphicName.ChemicalContaminatedArea);
    return f;
};

describe('publishGraphicExtent', () => {
    it('gives a bare anchor the extent of the shape it belongs to', () => {
        const labels = labelFeature();
        expect(paintOf(labels).bounds).toBeUndefined();

        publishGraphicExtent(labels, new Feature({geometry: new Polygon([RING])}));
        expect(paintOf(labels).bounds).toEqual({minX: 0, minY: 0, maxX: 400, maxY: 300});
    });

    it('publishes the outline, which is what shrinks a glyph into a shape that is not a box', () => {
        const labels = labelFeature();
        publishGraphicExtent(labels, new Feature({geometry: new Polygon([RING])}));
        expect(paintOf(labels).ring).toEqual(RING);
    });

    it('publishes no ring for a graphic that has no interior', () => {
        // A line has an extent and no inside. A ring invented from its bounding box would
        // report room that is not there, which is worse than reporting none.
        const labels = labelFeature();
        publishGraphicExtent(labels, new Feature({geometry: new LineString([[0, 0], [400, 300]])}));
        const paint = paintOf(labels);
        expect(paint.bounds).toEqual({minX: 0, minY: 0, maxX: 400, maxY: 300});
        expect(paint.ring).toBeUndefined();
    });

    it('says the same thing AreaGraphicBase stamps, key for key', () => {
        const labels = labelFeature();
        publishGraphicExtent(labels, new Feature({geometry: new Polygon([RING])}));
        for (const [key, value] of [
            ['polygonExtentWidth', 400],
            ['polygonExtentHeight', 300],
            ['polygonMinX', 0],
            ['polygonMinY', 0],
            ['polygonMaxX', 400],
            ['polygonMaxY', 300],
        ] as const) {
            expect(labels.get(key)).toBe(value);
        }
    });

    it('does nothing rather than throwing when either half is missing', () => {
        expect(() => publishGraphicExtent(undefined, new Feature({geometry: new Polygon([RING])}))).not.toThrow();
        expect(() => publishGraphicExtent(labelFeature(), undefined)).not.toThrow();
        expect(() => publishGraphicExtent(labelFeature(), new Feature())).not.toThrow();
    });
});
