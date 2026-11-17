/**
 * # A draw started with a preset
 *
 * A host's graphic builder, or a code read with `parseGraphicSidc`, picks the identity, echelon and
 * amplifiers before the first click. The placed graphic carries them, as MapLibre's does, and the
 * size the clicks give stays the draw's.
 */
import {Feature, Map, View} from 'ol';
import {LineString} from 'ol/geom';
import {Draw} from 'ol/interaction';
import {DrawEvent} from 'ol/interaction/Draw';
import {fromLonLat} from 'ol/proj';
import {TacticalGraphicEchelon, TacticalGraphicHostility, TacticalGraphicName, TACTICAL_GRAPHIC_KEY, parseGraphicSidc} from '@zaes/tactical-graphics';
import {createTacticalGraphics} from './createTacticalGraphics';

/** jsdom has no `ResizeObserver`, which a `Map` given a target constructs. */
beforeAll(() => {
    if (!('ResizeObserver' in window)) {
        (window as unknown as {ResizeObserver: unknown}).ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
});

function makeMap(): Map {
    const target = document.createElement('div');
    Object.defineProperty(target, 'clientWidth', {value: 800});
    Object.defineProperty(target, 'clientHeight', {value: 600});
    document.body.appendChild(target);
    return new Map({target, view: new View({center: fromLonLat([8.2, 46.1]), zoom: 9})});
}

/**
 * Places a line as the Draw interaction does: the sketch starts at the first click, its geometry
 * changes as the clicks land (which is what the holder builds from), and the last ends the draw.
 */
function place(map: Map, lonLats: number[][]): void {
    const draw = map.getInteractions().getArray().find((i): i is Draw => i instanceof Draw)!;
    const line = new LineString([fromLonLat(lonLats[0])]);
    const feature = new Feature(line);
    draw.dispatchEvent(new DrawEvent('drawstart', feature));
    line.setCoordinates(lonLats.map(p => fromLonLat(p)));
    draw.dispatchEvent(new DrawEvent('drawend', feature));
}

it('places the graphic with the identity, echelon and amplifiers it was started with', () => {
    const map = makeMap();
    const engine = createTacticalGraphics(map);
    const parsed = parseGraphicSidc('13062500181101000000');
    expect(parsed.name).toBe(TacticalGraphicName.Boundary);
    engine.startDrawing(parsed.name!, {...parsed.properties, designation: 'BLUE'});
    place(map, [[8, 46], [8.5, 46.2]]);

    const [saved] = engine.snapshot().features;
    expect(saved?.properties?.[TACTICAL_GRAPHIC_KEY]).toMatchObject({
        name: TacticalGraphicName.Boundary,
        hostility: TacticalGraphicHostility.hostileFaker,
        identityStated: true,
        echelon: TacticalGraphicEchelon.brigade,
        designation: 'BLUE',
    });
});

it('starts the next draw without the last one\'s preset', () => {
    const map = makeMap();
    const engine = createTacticalGraphics(map);
    engine.startDrawing(TacticalGraphicName.Boundary, {hostility: TacticalGraphicHostility.hostileFaker});
    place(map, [[8, 46], [8.5, 46.2]]);
    engine.startDrawing(TacticalGraphicName.Boundary);
    place(map, [[8.1, 46], [8.6, 46.2]]);
    const hostilities = engine.snapshot().features.map(f => f.properties?.[TACTICAL_GRAPHIC_KEY]?.hostility);
    expect(hostilities).toEqual([TacticalGraphicHostility.hostileFaker, undefined]);
});
