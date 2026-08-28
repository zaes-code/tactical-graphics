/**
 * # The viewport shared between the two engines
 *
 * Three numbers in `localStorage`, read by whichever engine mounts next. The reason
 * it stores **meters per pixel** and not a zoom number is the thing worth pinning: a
 * zoom is not portable between the two renderers, since MapLibre's tiles are 512 px
 * and OpenLayers' are 256, so the same view is `z` in one and `z - 1` in the other.
 *
 * The rest is defensive. This is user-writable storage, and a bad value does not
 * fail loudly — it opens a blank map with no error.
 */

import {readViewport, writeViewport} from './mapViewport';

const KEY = 'tg_viewport';

beforeEach(() => localStorage.clear());

describe('a round trip', () => {
    it('returns what was written', () => {
        writeViewport({lon: 13.475, lat: 33.785, resolution: 2445.98});
        expect(readViewport()).toEqual({lon: 13.475, lat: 33.785, resolution: 2445.98});
    });

    it('reads nothing when nothing was written', () => {
        expect(readViewport()).toBeUndefined();
    });
});

describe('a value that would open a blank map is refused', () => {
    it.each([
        ['not JSON at all', 'not json'],
        ['a NaN center', '{"lon":null,"lat":33,"resolution":100}'],
        ['a missing resolution', '{"lon":13,"lat":33}'],
        ['a zero resolution', '{"lon":13,"lat":33,"resolution":0}'],
        ['a negative resolution', '{"lon":13,"lat":33,"resolution":-5}'],
        ['a longitude off the globe', '{"lon":400,"lat":33,"resolution":100}'],
        ['a latitude past the Mercator limit', '{"lon":13,"lat":89,"resolution":100}'],
        ['a string where a number belongs', '{"lon":"13","lat":33,"resolution":100}'],
    ])('%s', (_label, raw) => {
        localStorage.setItem(KEY, raw);
        expect(readViewport()).toBeUndefined();
    });

    it('is never written in the first place', () => {
        writeViewport({lon: 13, lat: 33, resolution: 0});
        writeViewport({lon: Number.NaN, lat: 33, resolution: 100});
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('keeps the Mercator limit itself, which is a legal view', () => {
        writeViewport({lon: -180, lat: 85, resolution: 156543});
        expect(readViewport()?.lat).toBe(85);
    });
});
