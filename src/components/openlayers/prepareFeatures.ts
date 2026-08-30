import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import type {TacticalGraphicName, TacticalGraphicRender} from '@zaes/tactical-graphics';
import {publishGraphicExtent} from './publishGraphicExtent';
import {stylesFor} from './stylesFor';

/**
 * # One call from `renderTacticalGraphic` output to features you can put on a map
 *
 * The pieces have existed for a while and had to be assembled in the right order:
 * project the GeoJSON, ask {@link stylesFor} which style functions draw this graphic,
 * publish the shape's extent to the label feature with {@link publishGraphicExtent}, and
 * skip the label feature entirely for the 104 graphics that keep every glyph on the
 * graphic itself. Miss the second and a symbol's designation is drawn twice; miss the
 * third and every *fitted* symbol — the CBRN triangle, the airfield's runways, the
 * sector-1 modifier glyphs — silently comes out at a fixed size in metres rather than
 * scaled to the area it landed in.
 *
 * Silently is the problem. Nothing throws, nothing warns, and the map looks plausible
 * until somebody notices a symbol that does not grow with its shape. A host should not
 * have to know a checklist to avoid that, so this is the checklist.
 *
 * Nothing here is new capability — it is the same three calls in the order they have to
 * happen — and the parts stay exported for a host that wants to do it by hand.
 *
 * ```ts
 * const rendered = renderTacticalGraphic(feature);
 * const {graphic, labels} = prepareFeatures(rendered);
 * source.addFeature(graphic);
 * if (labels) source.addFeature(labels);
 * ```
 */
export interface PreparedFeatures {
    /** The drawn symbol, styled. Always present. */
    graphic: Feature;
    /**
     * The label anchors, styled and carrying the graphic's extent — or `undefined` for
     * a graphic that keeps every glyph on the graphic feature, which is 104 of the 291.
     * Adding a label feature for one of those draws its designation a second time.
     */
    labels?: Feature;
}

export interface PrepareOptions {
    /**
     * The projection to read into. Defaults to Web Mercator, which is what the paint
     * layer expects and what both bundled renderers use; pass your map's code if it
     * differs. `renderTacticalGraphic` always emits EPSG:4326.
     */
    featureProjection?: string;
    /**
     * Draw the symbol without its annotating amplifiers — dates, altitudes, widths,
     * field H — keeping whatever text *is* the symbol. A renderer input the host owns,
     * deliberately not a field on the saved graphic.
     */
    hideAmplifiers?: boolean;
}

/**
 * Turns `renderTacticalGraphic` output into styled OpenLayers features.
 *
 * @param rendered what {@link renderTacticalGraphic} returned
 * @param options projection and per-render display flags
 */
export function prepareFeatures(rendered: TacticalGraphicRender, options: PrepareOptions = {}): PreparedFeatures {
    const format = new GeoJSON({featureProjection: options.featureProjection ?? 'EPSG:3857'});
    const {graphic: graphicStyle, labels: labelStyle} = stylesFor(rendered.name as TacticalGraphicName);

    // `readFeature` is typed `Feature | Feature[]`; a single GeoJSON Feature in always
    // yields a single feature out, and these three members are always single features.
    const read = (feature: TacticalGraphicRender['graphic']) => format.readFeature(feature) as Feature;

    const graphic = read(rendered.graphic);
    graphic.setStyle(graphicStyle);
    if (options.hideAmplifiers) graphic.set('hideAmplifiers', true);

    // No label style means this graphic draws its text on the graphic feature. Returning
    // a styled label feature anyway is how a designation gets drawn twice.
    if (!labelStyle || !rendered.labels) return {graphic};

    const labels = read(rendered.labels);
    // Before the style is attached, so the first render already has it: the paints that
    // fit a symbol to its area read the extent off this feature, and with none they fall
    // back to a fixed size in metres.
    publishGraphicExtent(labels, graphic);
    labels.setStyle(labelStyle);
    if (options.hideAmplifiers) labels.set('hideAmplifiers', true);

    return {graphic, labels};
}
