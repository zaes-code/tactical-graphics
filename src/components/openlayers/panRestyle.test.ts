/**
 * # A pan restyles the OpenLayers layer only when labels move with the view
 *
 * With `autoPlaceLabels` off nothing drawn depends on the view, so a pan keeps the frames
 * OpenLayers already styled, as it did before labels could move. On, the layer restyles once
 * the pan settles so a moved label follows. @see getAutoPlaceLabels
 */

import {vi} from 'vitest';
import {configureTacticalGraphics, resetTacticalGraphicsConfig} from '@zaes/tactical-graphics';
import {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {endPaintFrame} from './paintToOpenLayers';

const RES = 100;

/** A manager on a stub map that keeps its listeners, so a test can fire them. */
function managerWithListeners() {
    const listeners: Record<string, (event?: unknown) => void> = {};
    const map = {
        addInteraction: () => {},
        addLayer: () => {},
        removeInteraction: () => {},
        on: (type: string, fn: (event?: unknown) => void) => {
            listeners[type] = fn;
            return {type, listener: fn};
        },
        un: () => {},
        getView: () => ({getResolution: () => RES, on: () => ({}), un: () => {}}),
        getTargetElement: () => ({style: {}, getBoundingClientRect: () => ({left: 0, top: 0})}),
        getPixelFromCoordinate: (c: number[]) => [c[0] / RES, -c[1] / RES],
        getCoordinateFromPixel: (p: number[]) => [p[0] * RES, -p[1] * RES],
        forEachFeatureAtPixel: () => undefined,
        getInteractions: () => ({getArray: () => []}),
    };
    const manager = new TacticalGraphicsManager(map as never);
    const changed = vi.spyOn((manager as unknown as {renderingVectorLayer: {changed(): void}}).renderingVectorLayer, 'changed');
    return {listeners, changed};
}

afterEach(() => {
    endPaintFrame();
    resetTacticalGraphicsConfig();
});

describe('a pan on the OpenLayers manager', () => {
    it('leaves the styled frames alone when auto placement is off, the default', () => {
        const {listeners, changed} = managerWithListeners();
        listeners.moveend?.();
        expect(changed).not.toHaveBeenCalled();
    });

    it('restyles the layer once the pan settles when auto placement is on', () => {
        configureTacticalGraphics({autoPlaceLabels: true});
        const {listeners, changed} = managerWithListeners();
        listeners.moveend?.();
        expect(changed).toHaveBeenCalledTimes(1);
    });
});
