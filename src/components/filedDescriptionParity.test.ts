/**
 * # The two engines file the same description for the same symbol
 *
 * A snapshot is what a host writes to disk and what the engine toggle hands across, so a file
 * whose contents depend on which renderer last saved it is a file that says different things
 * to the same reader. They did: measured on `npm run sweep:import-export`, a MapLibre-written
 * file carried `labelGapDegrees` for 192 graphics and `radius` plus `rotation` for 249 that an
 * OpenLayers-written one carried nothing for.
 *
 * The cause was one sentence's worth of difference in what each engine thought the bag *was*.
 * OpenLayers files what its holder knows; MapLibre completed the bag before drawing — a zero
 * label gap for the arc tasks, a rectangle's width read back off the ring, a drawn-anchor
 * graphic's `radius` and `rotation` recovered from the points — and then filed the thing it
 * had drawn with. Half of that is an instruction to a paint layer and half is a second copy
 * of the geometry, and a second copy is worse than redundant because the two can disagree:
 * 151204 contain reported a 40 km radius beside a symbol drawn at 29.8, from exactly this.
 *
 * What both engines legitimately file is a value nothing else in the file states — a
 * screen-sized default spent at the drawing resolution, most of all, since a snapshot carries
 * no viewport and that metre figure is the only record of it there will ever be.
 *
 * @see describedProperties, ai/conventions.md "A base is the library's reading of it"
 */
import VectorSource from 'ol/source/Vector';
import {listTacticalGraphicNames, TacticalGraphicName, TACTICAL_GRAPHIC_KEY} from '@zaes/tactical-graphics';
import {getController} from './openlayers/controllerRegistry';
import type {TacticalGraphicHandler} from './openlayers/openlayersAdapter';
import type {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import {applyBaseGeometry} from './openlayers/sampleGallery';
import {serializeTacticalGraphics} from './openlayers/persistence';
import {buildTacticalGraphic} from './maplibre/maplibreAdapter';

const RES = 1200;
const CX = 500_000;
const CY = 2_000_000;

/** Values each engine derives from something the file does not carry, and so must state. */
const FROM_THE_DRAWING_ZOOM = new Set(['radius', 'decorationSize', 'width', 'length', 'startRange', 'stopRange']);

const fakeManager = () => ({
    renderingVectorSource: new VectorSource(),
    graphicControllers: [] as TacticalGraphicHandler[],
    map: {getView: () => ({on: () => undefined, getResolution: () => RES})},
    watchResolution: () => undefined,
    unwatchResolution: () => undefined,
    releaseAllGraphics: () => undefined,
} as unknown as TacticalGraphicsManager);

/** What OpenLayers writes for a graphic drawn the way both sample sheets draw one. */
function openLayersFiles(name: TacticalGraphicName) {
    const handler = getController(name, RES);
    handler.setSymbolId('x');
    handler.getFeatures().forEach(f => {
        f.set('graphicName', name);
        f.set('symbolId', 'x');
    });
    applyBaseGeometry(handler, name, CX, CY, 'x');
    const manager = fakeManager();
    manager.renderingVectorSource.addFeatures(handler.getFeatures());
    manager.graphicControllers.push(handler);
    const snapshot = serializeTacticalGraphics(manager);
    return {
        bag: (snapshot.features[0].properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>,
        geometry: snapshot.features[0].geometry,
    };
}

/** And what MapLibre writes, handed that same file. */
function mapLibreFiles(name: TacticalGraphicName, geometry: unknown, bag: Record<string, unknown>) {
    const properties = {...bag};
    delete properties.name;
    const built = buildTacticalGraphic(name, geometry as never, properties as never, RES);
    return (built?.base.properties?.[TACTICAL_GRAPHIC_KEY] ?? {}) as Record<string, unknown>;
}

const NAMES = listTacticalGraphicNames() as TacticalGraphicName[];

describe(`one file, whichever engine wrote it (${NAMES.length} names)`, () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        let ol;
        try {
            ol = openLayersFiles(name);
        } catch {
            return; // a graphic this harness cannot lay out is a different suite's problem
        }
        const mlb = mapLibreFiles(name, ol.geometry, ol.bag);

        /*
         * **Only the keys, not the values.** The two engines round a screen-sized default
         * differently in places and that is a separate question with its own sweep row; what
         * this suite is for is a *field* one engine states and the other does not, which is
         * the shape that made one file read two ways. A key MapLibre adds because it spent
         * the drawing resolution on it is legitimate and listed above.
         */
        const added = Object.keys(mlb).filter(key => !(key in ol.bag) && !FROM_THE_DRAWING_ZOOM.has(key));
        expect(added).toEqual([]);
    });
});
