/**
 * # Every graphic OpenLayers can draw actually draws something
 *
 * `LineGraphicBase` and its siblings decide their style from a `switch` on the graphic's
 * name. A graphic added to the paint registry but not to that switch falls through to a
 * default that renders **nothing at all** — the feature is created, it has geometry, it
 * carries its amplifiers, it round-trips through save and restore, and it is invisible.
 *
 * `paintParity.test.ts` names this exact risk in its docblock — *"a graphic can be ported
 * for one renderer and not the other, and nothing would say so"* — and then does not
 * check it: it asserts the registry against itself and that paints do not throw. The
 * "actually paints marks" assertion it defers to lives in `maplibre/maplibreAdapter.test.ts`,
 * which covers MapLibre. OpenLayers had no equivalent.
 *
 * It cost exactly what you would expect. Seize was added with its generator, its paint,
 * its entity code and its nine registry entries, 3,536 tests passed, the catalog rendered
 * it correctly from the paint layer — and in the app it drew nothing, because
 * `sweptArcTaskStyleFunc` was routed to `Capture`, `Evacuate` and `Recover` and not to it.
 * The two follow tasks had no route at all.
 *
 * So: build each graphic through the real controller and the real sample base, evaluate
 * the style function the holder attached, and require at least one style back.
 */

import VectorSource from 'ol/source/Vector';
import type {StyleFunction} from 'ol/style/Style';
import {listTacticalGraphicNames, resetTacticalGraphicsConfig, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {applyBaseGeometry} from './sampleGallery';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';

const RES = 1200;
const VIEW_RES = RES;
const CX = 500_000;
const CY = 2_000_000;

function fakeManager(): TacticalGraphicsManager {
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: () => undefined, getResolution: () => VIEW_RES})},
        watchResolution: () => undefined,
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

/** @see fullRoundTrip.test.ts — `AxisOfAttack` has no enum member and so no controller. */
const NO_CONTROLLER = ['AxisOfAttack'];

const NAMES = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(n => !NO_CONTROLLER.includes(String(n)));

beforeEach(() => resetTacticalGraphicsConfig());

describe(`every drawable graphic renders at least one style (${NAMES.length} names)`, () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        const manager = fakeManager();
        const handler = getController(name, RES);
        handler.setSymbolId(`id-${name}`);
        handler.getFeatures().forEach(f => {
            f.set('graphicName', name);
            f.set('symbolId', `id-${name}`);
        });
        applyBaseGeometry(handler, name, CX, CY, `id-${name}`);
        manager.renderingVectorSource.addFeatures(handler.getFeatures());

        // The drawn symbol, not its handles or its label anchors: those are editor chrome
        // and a graphic is allowed to have none.
        const drawn = handler.getFeatures().filter(f => f.get('role') === 'graphic');
        expect(drawn.length).toBeGreaterThan(0);

        const styles = drawn.flatMap(feature => {
            const style = feature.getStyle();
            const evaluated = typeof style === 'function' ? (style as StyleFunction)(feature, RES) : style;
            if (!evaluated) return [];
            return Array.isArray(evaluated) ? evaluated : [evaluated];
        });
        expect(styles.length).toBeGreaterThan(0);
    });
});
