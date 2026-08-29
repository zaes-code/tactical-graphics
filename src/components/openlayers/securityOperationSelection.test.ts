/**
 * # Clicking a security operation's centre symbol has to reach its graphic
 *
 * The dialog identifies the graphic it is editing by the `symbolId` on the feature the
 * hit test returned, and drops the whole edit when that comes back empty:
 * `apply` opens with `if (!selection.id) return`. The centre symbol is the largest
 * thing a Cover, Guard or Screen draws and the natural place to click — and it is the
 * controller's feature, not the holder's, so `setSymbolId` stamped every feature except
 * that one.
 *
 * What the user saw: a Cover drawn by hand ignored the affiliation, while the same
 * Cover drawn into the sample sheet honoured it. The sample path sets the amplifiers
 * directly and never goes through a click.
 *
 * MapLibre hit this first and fixed it by putting the graphic's id on its icon feature
 * (`NativeLayerRenderer`, `GRAPHIC_ID_PROPERTY`). This is the same fix on this side, and
 * the same reason the two engines have to be checked separately: an omission in one
 * holder is invisible to everything that reads the symbology.
 */

import {
    TacticalGraphicHostility,
    TacticalGraphicName,
    resetTacticalGraphicsConfig,
    setSecuritySymbolProvider,
} from '@zaes/tactical-graphics';
import type {StyleFunction} from 'ol/style/Style';
import Icon from 'ol/style/Icon';
import {getController} from './controllerRegistry';
import {applyBaseGeometry} from './sampleGallery';
import {readGraphicLabels, writeGraphicProperties} from './graphicProperties';

const RES = 1200;
const OPERATIONS = [TacticalGraphicName.Cover, TacticalGraphicName.Guard, TacticalGraphicName.Screen];

/** Whatever a provider is handed, echoed back so a test can read it. */
const echoProvider = (seen: string[]) =>
    setSecuritySymbolProvider(request => {
        seen.push(request.sidc);
        return 'data:image/svg+xml,<svg/>';
    });

function build(name: TacticalGraphicName, id = 'sym-1') {
    const handler = getController(name, RES);
    handler.setSymbolId(id);
    handler.getFeatures().forEach(f => f.set('graphicName', name));
    applyBaseGeometry(handler, name, 500_000, 2_000_000, id);
    return handler;
}

beforeEach(() => {
    resetTacticalGraphicsConfig();
    setSecuritySymbolProvider(undefined);
});
afterEach(() => setSecuritySymbolProvider(undefined));

describe.each(OPERATIONS)('%s', name => {
    it('puts its symbolId on every feature it publishes, the centre symbol included', () => {
        const handler = build(name);
        const ids = handler.getFeatures().map(f => f.get('symbolId'));
        expect(ids).not.toContain(undefined);
        expect(new Set(ids)).toEqual(new Set(['sym-1']));
    });

    it('lets the centre symbol answer for the graphic"s amplifiers', () => {
        const handler = build(name);
        const holderFeatures = handler.getFeatures().filter(f => f.get('role'));
        const icon = handler.getFeatures().find(f => !f.get('role'))!;

        // Stamped the way the holder stamps its own features on a rebuild — which is
        // every path except this one. The dialog reads the amplifiers off *the feature
        // that was clicked*, so an icon left out of that write opens a form showing
        // defaults and saves them back over what the graphic carried.
        writeGraphicProperties(holderFeatures, name, {
            designation: '',
            hostility: TacticalGraphicHostility.hostileFaker,
        });
        // Any rebuild: this is the one place the base moves, and the icon follows it.
        handler.handleTranslate(0, 0);

        expect(readGraphicLabels(icon).hostility).toBe(TacticalGraphicHostility.hostileFaker);
    });

    it('rebuilds the symbol at the new affiliation when the hostility is changed', () => {
        const seen: string[] = [];
        echoProvider(seen);
        const handler = build(name);

        // The icon is the controller's own feature: the one carrying an Icon style.
        const icon = handler.getFeatures().find(f => typeof f.getStyle() === 'function' && !f.get('role'));
        expect(icon).toBeDefined();

        const evaluate = () => (icon!.getStyle() as StyleFunction)(icon!, RES);
        expect(evaluate()).toBeTruthy();
        const pendingSidc = seen.at(-1)!;

        writeGraphicProperties(handler.getFeatures(), name, {
            designation: '',
            hostility: TacticalGraphicHostility.hostileFaker,
        });
        const style = evaluate();

        // Position 4 of the SIDC is the standard identity: 6 is hostile, 0 pending.
        expect(seen.at(-1)![3]).toBe('6');
        expect(pendingSidc[3]).toBe('0');
        expect([style].flat()[0]?.getImage()).toBeInstanceOf(Icon);
    });
});
