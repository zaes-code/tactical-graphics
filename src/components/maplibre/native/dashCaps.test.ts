/**
 * A dash keeps the square ends the paint layer gives it on MapLibre, whose line layers used to
 * draw every line with round caps. @see withFittedDashes
 */
import {bucketPaintsInto, capOfKey, emptyBuckets, lineLayer} from './paintToLayers';

describe('dash caps on MapLibre', () => {
    it('keys a dash by its cap and builds its layer with that cap', () => {
        const buckets = bucketPaintsInto(emptyBuckets(), [
            {geometry: {type: 'LineString', coordinates: [[0, 0], [1000, 0]]}, stroke: {color: '#000', widthPx: 2, dashPx: [12, 8], cap: 'butt'}},
            {geometry: {type: 'LineString', coordinates: [[0, 0], [1000, 0]]}, stroke: {color: '#000', widthPx: 2}},
        ]);
        const keys = Array.from(buckets.lines.keys());
        const dashed = keys.find(k => k !== 'solid')!;
        expect(capOfKey(dashed)).toBe('butt');
        expect((lineLayer('d', 'd', [6, 4], capOfKey(dashed)).layout as Record<string, unknown>)['line-cap']).toBe('butt');
        expect((lineLayer('s', 's', undefined).layout as Record<string, unknown>)['line-cap']).toBe('round');
    });

    it('keeps two caps of one pattern in two layers', () => {
        const stroke = {color: '#000', widthPx: 2, dashPx: [12, 8]};
        const geometry = {type: 'LineString' as const, coordinates: [[0, 0], [1000, 0]] as [number, number][]};
        const buckets = bucketPaintsInto(emptyBuckets(), [{geometry, stroke: {...stroke, cap: 'butt'}}, {geometry, stroke: {...stroke, cap: 'round'}}]);
        expect(buckets.lines.size).toBe(2);
    });
});
