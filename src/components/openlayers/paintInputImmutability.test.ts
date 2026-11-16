/**
 * # No paint function writes to the geometry it is handed
 *
 * A paint function reads its feature's geometry and returns marks; it must never write to the
 * coordinates it was given. Today each style call converts the OpenLayers geometry afresh, so
 * a write would be harmless, but any reuse of the converted geometry across calls (a cache
 * per geometry revision, or handing the input straight back as a mark) is only correct while
 * that holds.
 *
 * So every graphic is built as the sample sweep builds it, the converted input of each feature
 * is frozen deep and handed to the feature's own paint at five resolutions, outside and inside
 * a paint frame with labels placing themselves. ES modules run in strict mode, so a write to a
 * frozen array throws, and the run fails on the first paint that mutates its input.
 */
import Feature from 'ol/Feature';
import {
    getPaintFunction,
    listTacticalGraphicNames,
    placeAreaLabel,
    TacticalGraphicName,
    withFittedDashes,
    withHiddenAmplifiers,
    withLegibleText,
    withUnobscuredNames,
    type PaintFeature,
} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {applyBaseGeometry} from './sampleGallery';
import {paintContext, paintToOlStyles, toPaintFeature} from './paintToOpenLayers';

const RESOLUTIONS = [150, 600, 1200, 3600, 14400];

function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const v of Object.values(value as object)) deepFreeze(v);
    }
    return value;
}

/** Every input a paint reads, frozen: the geometry and the values stamped on the feature. */
function frozenInput(feature: Feature, name: TacticalGraphicName): PaintFeature | undefined {
    const input = toPaintFeature(feature, name);
    if (!input) return undefined;
    for (const value of [input.geometry, input.ring, input.bounds, input.graphicCenter, input.graphicLabelPoint, input.labelSegment, input.rangeFanBands, input.rangeFanShape]) {
        deepFreeze(value);
    }
    return input;
}

describe('the geometry a paint is handed', () => {
    it.each([false, true])('is never written to by any graphic, painting in a view: %s', inView => {
        let calls = 0;
        for (const name of listTacticalGraphicNames() as TacticalGraphicName[]) {
            const painters = getPaintFunction(name);
            if (!painters) continue;
            const handler = getController(name, 1200);
            handler.setSymbolId(`id-${name}`);
            handler.getFeatures().forEach(f => {
                f.set('graphicName', name);
                f.set('symbolId', `id-${name}`);
            });
            applyBaseGeometry(handler, name, 500_000, 2_000_000, `id-${name}`);
            for (const feature of handler.getFeatures() as Feature[]) {
                const role = feature.get('role');
                const paint = role === 'label' ? painters.label : role === 'graphic' ? painters.graphic : undefined;
                if (!paint) continue;
                for (const resolution of RESOLUTIONS) {
                    const input = frozenInput(feature, name);
                    if (!input) continue;
                    const context = inView
                        ? {...paintContext(resolution), view: {minX: 0, minY: 1_000_000, maxX: 1_000_000, maxY: 3_000_000}}
                        : paintContext(resolution);
                    // The whole OpenLayers path after the paint: the shared filters, then the styles.
                    expect(() => {
                        const placed = inView ? placeAreaLabel(input, context) : input;
                        paintToOlStyles(withFittedDashes(withUnobscuredNames(withLegibleText(withHiddenAmplifiers(paint(placed, context), false)), context), context));
                    }).not.toThrow();
                    calls++;
                }
            }
        }
        expect(calls).toBeGreaterThan(2000);
    }, 300_000);
});
