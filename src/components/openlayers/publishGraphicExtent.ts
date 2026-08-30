import Feature from 'ol/Feature';
import type {Geometry} from 'ol/geom';
import {Polygon} from 'ol/geom';

/**
 * # Telling a label feature how big the graphic it belongs to is
 *
 * Several symbols are **fitted to the area they land in** rather than drawn at a fixed
 * size: the CBRN triangle, the airfield zone's crossed runways, the sector-1 modifier
 * glyphs, and every label held to a share of its own shape. The paint that fits them
 * reads `feature.bounds` and `feature.ring` — and those ride the *label* feature, which
 * is a bare anchor point with no shape of its own to measure.
 *
 * A holder built by this package publishes them as a side effect of drawing. A host that
 * builds its own features — the shape `stylesFor` exists to serve — published nothing, so
 * `fitSymbolScale` fell back to its no-bounds answer and every fitted symbol came out at
 * a fixed size in metres. Measured in a consuming app, a CBRN triangle drew **12 px
 * across** at a zoom where the area it labelled was hundreds: right while the graphic was
 * being drawn, since the draw is holder-backed, and tiny the moment it was committed.
 *
 * So the keys stop being private to the holders. This is the same stamp
 * `AreaGraphicBase` makes, exported so a host can make it too, and so that what the keys
 * are called stays this package's business rather than something a consumer has to
 * reverse-engineer.
 *
 * @param labels the feature the label/glyph paints are styled onto
 * @param graphic the feature carrying the drawn shape, whose extent is published
 *
 * @see stylesFor — the other half of what a host building its own features needs
 */
export function publishGraphicExtent(labels: Feature | undefined, graphic: Feature | undefined): void {
    const geometry: Geometry | undefined = graphic?.getGeometry();
    if (!labels || !geometry) return;

    const extent = geometry.getExtent();
    if (!extent || !extent.every(n => Number.isFinite(n))) return;
    const [minX, minY, maxX, maxY] = extent;

    labels.set('polygonExtentWidth', maxX - minX);
    labels.set('polygonExtentHeight', maxY - minY);
    labels.set('polygonMinX', minX);
    labels.set('polygonMinY', minY);
    labels.set('polygonMaxX', maxX);
    labels.set('polygonMaxY', maxY);

    /*
     * The outline itself, when there is one. `bounds` sizes a glyph and the ring is what
     * shrinks it until it actually sits *inside* a shape that is not a rectangle — an L
     * shaped area's bounding box says there is room where there is none.
     *
     * Only a real Polygon answers. A line or a point graphic has an extent and no
     * interior, and a ring invented from a bounding box would report room that is not
     * there, which is worse than reporting none.
     */
    if (geometry instanceof Polygon) labels.set('polygonRing', geometry.getCoordinates()[0]);
}
