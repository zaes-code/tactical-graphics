/**
 * # Turned labels on a turned map
 *
 * A paint that states a rotation lays its text along something on the map, so on MapLibre
 * that text turns with the map, and past a quarter turn from level it is turned the other
 * half turn and anchored at the opposite corner, so it reads the right way up and stays on
 * the same side of its line. The rule is stated twice, once as a function the renderer
 * uses to decide when to lay the text out again and once as the expression MapLibre
 * draws with, so the two are checked against each other.
 */
import {expression} from '@maplibre/maplibre-gl-style-spec';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {buildTacticalGraphic, paintTacticalGraphic} from '../maplibreAdapter';
import {bucketPaintsInto, emptyBuckets, symbolLayer, turnedLabelFlips, turnedSymbolLayer, turnedSymbolLayout} from './paintToLayers';

const RES = 2445.98;

describe('turnedLabelFlips', () => {
    it('keeps a label as painted on a north-up map', () => {
        for (const rotate of [-90, -60, -1, 0, 1, 45, 90]) expect(turnedLabelFlips(rotate, 0)).toBe(false);
    });

    it('flips a label the map has turned past a quarter turn from level', () => {
        expect(turnedLabelFlips(0, 180)).toBe(true);
        expect(turnedLabelFlips(20, 120)).toBe(true);
        expect(turnedLabelFlips(-80, 30)).toBe(true);
        expect(turnedLabelFlips(80, -30)).toBe(true);
        expect(turnedLabelFlips(20, 100)).toBe(false);
        expect(turnedLabelFlips(0, 359)).toBe(false);
    });

    it('agrees with the expression MapLibre draws with, all the way round', () => {
        for (let bearing = -180; bearing <= 360; bearing += 7.5) {
            const rotate = expression.createExpression(turnedSymbolLayout(bearing)['text-rotate'], {
                type: 'number',
                'property-type': 'data-driven',
                expression: {interpolated: false, parameters: ['zoom', 'feature']},
            } as never);
            if (rotate.result !== 'success') throw new Error(JSON.stringify(rotate.value));
            for (let r = -90; r <= 90; r += 5) {
                const drawn = rotate.value.evaluate({zoom: 0}, {type: 'Point', properties: {rotate: r}} as never);
                expect(drawn).toBe(turnedLabelFlips(r, bearing) ? r + 180 : r);
            }
        }
    });
});

describe('which labels turn with the map', () => {
    const limitOfAdvance = (coordinates: number[][]) => {
        const graphic = buildTacticalGraphic(TacticalGraphicName.LimitOfAdvance, {type: 'LineString', coordinates}, {}, RES)!;
        return bucketPaintsInto(emptyBuckets(), paintTacticalGraphic(graphic, {resolution: RES} as never)).symbols;
    };

    it('turns a line label drawn exactly east to west, whose rotation is zero', () => {
        const labels = limitOfAdvance([[0, 0], [3, 0]]).filter(f => f.properties!.label === 'LOA');
        expect(labels).toHaveLength(2);
        for (const label of labels) {
            expect(Math.abs(label.properties!.rotate as number)).toBe(0);
            expect(label.properties!.turned).toBe(true);
        }
    });

    it('mirrors a turned label about its anchor for when it flips', () => {
        const [label] = limitOfAdvance([[0, 0], [3, 1]]).filter(f => f.properties!.label === 'LOA');
        const mirror: Record<string, string> = {left: 'right', right: 'left', top: 'bottom', bottom: 'top', center: 'center'};
        const anchor = String(label.properties!.anchor);
        expect(label.properties!.flippedAnchor).toBe(anchor.split('-').map(part => mirror[part]).join('-'));
        const [x, y] = label.properties!.offset as number[];
        const [fx, fy] = label.properties!.flippedOffset as number[];
        expect(fx + x).toBeCloseTo(0, 12);
        expect(fy + y).toBeCloseTo(0, 12);
    });

    it('leaves a label no paint turned on the upright layer', () => {
        const bucket = emptyBuckets();
        bucketPaintsInto(bucket, [{geometry: {type: 'Point', coordinates: [0, 0]}, text: {text: 'NAME', font: 'bold 16px sans-serif', fill: '#000'}}]);
        expect(bucket.symbols[0].properties!.turned).toBe(false);
    });

    it('draws the two kinds on two layers from one source, only the turned one tied to the map', () => {
        const upright = symbolLayer('u', 's', 'f') as {filter: unknown; layout: Record<string, unknown>};
        const turned = turnedSymbolLayer('t', 's', 'f', 0) as {filter: unknown; layout: Record<string, unknown>};
        expect(upright.filter).toEqual(['!', ['get', 'turned']]);
        expect(turned.filter).toEqual(['get', 'turned']);
        expect(upright.layout['text-rotation-alignment']).toBe('viewport');
        expect(turned.layout['text-rotation-alignment']).toBe('map');
        expect(turned.layout['text-pitch-alignment']).toBe('viewport');
    });
});
