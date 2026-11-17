/**
 * # A pick made mid-draw starts the new draw
 *
 * `startDrawing` set the mode to `drawing` and then let the interaction layer end the draw
 * under way, whose end put the mode back to `view`. So a pick made while drawing (another
 * graphic, or the same one again) left the engine out of drawing, the sample app moved it on
 * to edit, and the operator had to pick a second time. OpenLayers never did this.
 */
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from './createTacticalGraphics';

/** A map that answers anything with nothing, which is all a draw that is never clicked needs. */
function anyMap(): never {
    const canvas = document.createElement('canvas');
    const noop = () => undefined;
    const known: Record<string, unknown> = {
        getCanvas: () => canvas,
        getCanvasContainer: () => canvas,
        getZoom: () => 5,
        getBearing: () => 0,
        getStyle: () => ({layers: []}),
        getLayer: noop,
        getSource: noop,
        queryRenderedFeatures: () => [],
        project: () => ({x: 0, y: 0}),
        unproject: () => ({lng: 0, lat: 0}),
        hasImage: () => true,
        dragPan: {enable: noop, disable: noop, isEnabled: () => true},
        doubleClickZoom: {enable: noop, disable: noop, isEnabled: () => true},
    };
    return new Proxy(known, {get: (target, key: string) => (key in target ? target[key] : noop)}) as never;
}

it('stays drawing when a graphic is picked while another is being drawn', () => {
    const reported: string[] = [];
    const engine = createTacticalGraphics(anyMap(), {onModeChange: mode => reported.push(mode)});
    engine.setInteractionMode('edit');

    engine.startDrawing(TacticalGraphicName.PhaseLine);
    expect(engine.getInteractionMode()).toBe('drawing');

    engine.startDrawing(TacticalGraphicName.Boundary);
    expect(engine.getInteractionMode()).toBe('drawing');
    // And the last word the host heard was drawing, not the end of the old draw.
    expect(reported.at(-1)).toBe('drawing');

    engine.startDrawing(TacticalGraphicName.Boundary);
    expect(engine.getInteractionMode()).toBe('drawing');
});
