/**
 * # The hatch tile, and why its geometry is stated here
 *
 * Three renderers rasterise a hatch — the OpenLayers paint bridge, MapLibre's canvas
 * path and MapLibre's native path — and each one used to hard-code a single diagonal
 * stroke. Adding a second `kind` to `HatchSpec` therefore **compiled, type-checked and
 * rendered identically to the first** in all three: severely restricted terrain, which
 * APP-06 distinguishes from restricted terrain by texture alone, would have shipped
 * looking exactly like it.
 *
 * So the tile's strokes are described in the library and the renderers only stroke them.
 * These tests are what stops the two kinds collapsing back into one.
 */
import {hatchTileSegments} from './paint';
import type {HatchSpec} from './paint';

const spec = (kind: HatchSpec['kind'], sizePx = 10): HatchSpec => ({
    kind,
    color: '#000000',
    sizePx,
    lineWidthPx: 1,
});

describe('hatchTileSegments', () => {
    it('gives a diagonal tile one stroke and a crossed tile two', () => {
        expect(hatchTileSegments(spec('diagonal'))).toHaveLength(1);
        expect(hatchTileSegments(spec('cross'))).toHaveLength(2);
    });

    it('draws the crossed tile as the diagonal plus its mirror, so density matches', () => {
        const [rising] = hatchTileSegments(spec('diagonal'));
        const crossed = hatchTileSegments(spec('cross'));
        expect(crossed[0]).toEqual(rising);
        // The second stroke runs the other way across the same tile.
        expect(crossed[1]).toEqual([0, 0, 10, 10]);
    });

    it('scales every stroke to the tile, so a hatch stays seamless when tiled', () => {
        for (const size of [4, 10, 32]) {
            for (const kind of ['diagonal', 'cross'] as const) {
                for (const [x0, y0, x1, y1] of hatchTileSegments(spec(kind, size))) {
                    for (const v of [x0, y0, x1, y1]) {
                        expect(v).toBeGreaterThanOrEqual(0);
                        expect(v).toBeLessThanOrEqual(size);
                    }
                }
            }
        }
    });

    it('never returns the same tile for the two kinds', () => {
        // The assertion the silent-no-op bug would have failed.
        expect(hatchTileSegments(spec('cross'))).not.toEqual(hatchTileSegments(spec('diagonal')));
    });
});
