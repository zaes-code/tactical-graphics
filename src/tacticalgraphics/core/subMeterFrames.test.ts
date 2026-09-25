import {Feature, MultiLineString, Position} from 'geojson';
import {synthesizedBase} from './drawnBase';
import {renderTacticalGraphic} from './render';
import {TacticalGraphicName} from './type';

/**
 * **Ambush and Pursuit draw nothing under a meter across, on purpose.**
 *
 * Their generators read only a frame off the drawn points, and a frame under `MIN_SIZE_M` is
 * read as a click, which draws nothing rather than parking a default-sized symbol (the
 * 2026-09-06 call). The NVG add-on's tiny fixtures, half a meter across, found the two and
 * pinned them; this pins the same fact from this side, and that it stops at a meter.
 * @see MIN_SIZE_M in anchors.ts
 */
const METERS_PER_DEGREE = 111_320;
const CENTER: Position = [16, 60];

function drawnAt(name: TacticalGraphicName, halfMeters: number): Feature<MultiLineString> {
    const coordinates = synthesizedBase(name, CENTER, halfMeters / METERS_PER_DEGREE, 3)!;
    return renderTacticalGraphic({
        type: 'Feature',
        geometry: {type: 'LineString', coordinates},
        properties: {tacticalGraphic: {name}},
    }).graphic as Feature<MultiLineString>;
}

describe.each([TacticalGraphicName.Ambush, TacticalGraphicName.Pursuit])('%s below a meter', name => {
    it('draws an empty geometry at half a meter across', () => {
        const graphic = drawnAt(name, 0.5);
        expect(graphic.geometry.type).toBe('MultiLineString');
        expect(graphic.geometry.coordinates).toEqual([]);
    });

    it('draws the symbol at two meters across', () => {
        expect(drawnAt(name, 2).geometry.coordinates.length).toBeGreaterThan(0);
    });
});
