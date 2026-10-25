/**
 * # Names draw over amplifiers on MapLibre
 *
 * Labels are allowed to overlap here, and MapLibre then stacks them by their height on the
 * screen, so one graphic's dates could cover another's name. The paint list's order decides
 * instead. @see NAME_TEXT_Z_INDEX
 */
import {NAME_TEXT_Z_INDEX, fontStyle} from '@zaes/tactical-graphics';
import type {Paint} from '@zaes/tactical-graphics';
import {bucketPaintsInto, emptyBuckets, symbolLayer, turnedSymbolLayer} from './paintToLayers';

describe('label draw order on MapLibre', () => {
    it('carries each label\'s order to the symbol layer', () => {
        const name: Paint = {geometry: {type: 'Point', coordinates: [0, 0]}, text: {text: 'TVAR', font: fontStyle, fill: '#000'}, zIndex: NAME_TEXT_Z_INDEX};
        const date: Paint = {geometry: {type: 'Point', coordinates: [0, 0]}, text: {text: '031813ZOCT26', font: fontStyle, fill: '#000', kind: 'amplifier'}};
        const symbols = bucketPaintsInto(emptyBuckets(), [name, date]).symbols;
        expect(symbols.map(f => f.properties!.sortKey)).toEqual([NAME_TEXT_Z_INDEX, 0]);
    });

    it('sorts both symbol layers by it', () => {
        for (const layer of [symbolLayer('a', 's', 'Noto Sans Bold'), turnedSymbolLayer('b', 's', 'Noto Sans Bold', 0)]) {
            expect((layer as {layout: Record<string, unknown>}).layout['symbol-sort-key']).toEqual(['get', 'sortKey']);
        }
    });
});
