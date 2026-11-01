/**
 * # A label's halo scales with the label, as on OpenLayers
 *
 * OpenLayers renders a scaled label into a canvas scaled the same way, halo included
 * (`Executor.createLabel` sets the scale before the stroke width). MapLibre's halo width is
 * absolute, so it has to be scaled here, or a zone's block zoomed out to half size wears a
 * full-size halo that fills in the letters.
 */
import {HALO_WIDTH, fontStyle} from '@zaes/tactical-graphics';
import type {Paint} from '@zaes/tactical-graphics';
import {bucketPaintsInto, emptyBuckets} from './paintToLayers';

const label = (scale?: number): Paint => ({
    geometry: {type: 'Point', coordinates: [0, 0]},
    text: {text: 'WFZ', font: fontStyle, fill: '#000', halo: {color: '#fff', widthPx: HALO_WIDTH}, scale},
});

describe('the halo on MapLibre', () => {
    it('is half the shared width at full size, the outward share of a canvas stroke', () => {
        expect(bucketPaintsInto(emptyBuckets(), [label()]).symbols[0].properties!.haloWidth).toBe(HALO_WIDTH / 2);
    });

    it('shrinks with the label', () => {
        expect(bucketPaintsInto(emptyBuckets(), [label(0.5)]).symbols[0].properties!.haloWidth).toBe(HALO_WIDTH / 4);
    });
});
