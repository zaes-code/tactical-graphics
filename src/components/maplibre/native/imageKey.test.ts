/**
 * # Keying a rasterised center symbol on the image, not on the graphic
 *
 * The icon id used to be `name`-`hostility`, which assumes those two decide the
 * picture. They do for the library's own provider and not for a host's: one that
 * varies the symbol by `labels`, or returns a per-graphic `sizePx` — milsymbol bakes
 * the requested size into the SVG it returns — had every such graphic collapse onto
 * whichever raster was registered first.
 *
 * Only the keying is asserted here. Whether `NativeLayerRenderer` then registers and
 * references the image correctly needs a GL context and is verified in a browser, not
 * in jsdom.
 */

import {imageKey} from './NativeLayerRenderer';

describe('imageKey', () => {
    it('gives one image one key, however often it is asked for', () => {
        const src = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E';
        expect(imageKey(src)).toBe(imageKey(src));
    });

    it('separates two images that differ anywhere, including only at the end', () => {
        expect(imageKey('data:image/svg+xml,a')).not.toBe(imageKey('data:image/svg+xml,b'));
        // A per-graphic size differs deep inside a long SVG, not in its first bytes.
        const long = 'data:image/svg+xml,' + 'x'.repeat(4000);
        expect(imageKey(long + 'size25')).not.toBe(imageKey(long + 'size48'));
    });

    it('is short enough to travel in every feature\'s properties', () => {
        expect(imageKey('data:image/svg+xml,' + 'x'.repeat(50_000)).length).toBeLessThanOrEqual(7);
    });

    it('handles an empty source without collapsing onto a real one', () => {
        expect(imageKey('')).not.toBe(imageKey('data:image/svg+xml,a'));
    });
});
