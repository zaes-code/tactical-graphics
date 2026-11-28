/**
 * The route-direction arrows, inlined as `data:` URIs.
 *
 * They used to be `import arrow from './route_direction_one_way.svg'`, which
 * only works behind a bundler's asset loader. The OpenLayers layer is published
 * (`@zaes/tactical-graphics/openlayers`), and a library cannot require its
 * consumers to configure an SVG loader — `tsc` cannot compile that import at
 * all, and the emitted `require('./x.svg')` would fail at run time. Inlining
 * removes the loader from the contract: these are plain strings that OpenLayers'
 * `Icon` accepts as `src` anywhere.
 *
 * The `.svg` files next to this one remain the editable originals.
 * `routeDirectionIcons.test.ts` decodes each URI and compares it against its
 * file, so the two cannot drift apart silently.
 */

/** Percent-encodes an SVG document for use in a `data:image/svg+xml` URI. */
const svgDataUri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** Route direction: one way. */
export const ONE_WAY_ARROW = svgDataUri(
    '<!-- Route direction: one way. Original work, MIT (see LICENSE). -->\n' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#1f1f1f">' +
        '<path d="M3 11h11.5v2H3z"/><path d="M13.5 6.5 21 12l-7.5 5.5z"/></svg>\n',
);

/** Route direction: alternating. Double-headed arrow. */
export const ALTERNATING_ARROW = svgDataUri(
    '<!-- Route direction: alternating. Double-headed arrow. Original work, MIT (see LICENSE). -->\n' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#1f1f1f">' +
        '<path d="M8 11h8v2H8z"/><path d="M3 12l6-5.5v11z"/><path d="M21 12l-6 5.5v-11z"/></svg>\n',
);

/** Route direction: two way. Opposed arrows, stacked. */
export const TWO_WAY_ARROW = svgDataUri(
    '<!-- Route direction: two way. Opposed arrows, stacked. Original work, MIT (see LICENSE). -->\n' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#1f1f1f">' +
        '<path d="M3 6h11v2H3z"/><path d="M13 3.5 19.5 7 13 10.5z"/>' +
        '<path d="M10 16h11v2H10z"/><path d="M11 13.5 4.5 17 11 20.5z"/></svg>\n',
);
