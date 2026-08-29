/**
 * # A security operation's centre symbol belongs to the graphic that draws it
 *
 * The dialog identifies the graphic it is editing by the `symbolId` on the feature the hit
 * test returned, and drops the whole edit when that comes back empty: `apply` opens with
 * `if (!selection.id) return`. The centre symbol is the largest thing these three draw and
 * the natural place to click.
 *
 * That used to be a feature of its own, owned by the controller rather than the holder —
 * so `setSymbolId` stamped every feature except that one, and setting the affiliation on a
 * hand-drawn Cover silently did nothing while the same Cover drawn into the sample sheet
 * honoured it, because that path never goes through a click.
 *
 * **It is a style now, not a feature.** Cover, guard and screen are drawn from two points
 * as of 2026-08-29 and hold their symbol on the graphic feature itself, which cannot be
 * anything other than stamped. The class of defect is gone rather than fixed, and what is
 * left to check is that the symbol still answers to the graphic's affiliation — the reason
 * the id mattered in the first place.
 */

import {
    TacticalGraphicHostility,
    TacticalGraphicName,
    resetTacticalGraphicsConfig,
    setSecuritySymbolProvider,
} from '@zaes/tactical-graphics';
import {Feature} from 'ol';
import {LineString} from 'ol/geom';
import type {StyleFunction} from 'ol/style/Style';
import Icon from 'ol/style/Icon';
import {getController} from './controllerRegistry';
import {readGraphicLabels, writeGraphicProperties} from './graphicProperties';

const RES = 1200;
const OPERATIONS = [TacticalGraphicName.Cover, TacticalGraphicName.Guard, TacticalGraphicName.Screen];

/** Whatever a provider is handed, echoed back so a test can read it. */
const echoProvider = (seen: string[]) =>
    setSecuritySymbolProvider(request => {
        seen.push(request.sidc);
        return 'data:image/svg+xml,<svg/>';
    });

/** The drawn arm: point 1 at the arrowhead, point 2 at its inner end. */
const ARM: [number, number][] = [[0, 0], [60_000, 0]];

function build(name: TacticalGraphicName, id = 'sym-1') {
    const handler = getController(name, RES);
    handler.setSymbolId(id);
    handler.getFeatures().forEach(f => f.set('graphicName', name));
    handler.setBaseFeature?.(new Feature(new LineString(ARM)));
    return handler;
}

/** The style function on the feature that carries the drawn symbol. */
const drawnStyles = (handler: ReturnType<typeof build>) =>
    handler.getFeatures()
        .filter(f => typeof f.getStyle() === 'function')
        .flatMap(f => {
            const evaluated = (f.getStyle() as StyleFunction)(f, RES);
            return Array.isArray(evaluated) ? evaluated : evaluated ? [evaluated] : [];
        });

beforeEach(() => {
    resetTacticalGraphicsConfig();
    setSecuritySymbolProvider(undefined);
});
afterEach(() => setSecuritySymbolProvider(undefined));

describe.each(OPERATIONS)('%s', name => {
    it('puts its symbolId on every feature it publishes', () => {
        const handler = build(name);
        const ids = handler.getFeatures().map(f => f.get('symbolId'));
        expect(ids).not.toContain(undefined);
        expect(new Set(ids)).toEqual(new Set(['sym-1']));
    });

    it('draws no handles — there is nothing to drag', () => {
        // Every point but the two the operator drew is derived, and dragging one of those
        // alone would break the symmetry the symbol is built on. Move and resize only.
        const handler = build(name);
        const handlePoints = handler.getFeatures()
            .filter(f => f.get('role') === 'handle')
            .flatMap(f => (f.getGeometry() as unknown as {getCoordinates(): number[][]})?.getCoordinates?.() ?? []);
        expect(handlePoints).toHaveLength(0);
    });

    it('carries the graphic"s amplifiers on the feature that draws the symbol', () => {
        const handler = build(name);
        writeGraphicProperties(handler.getFeatures(), name, {
            designation: '',
            hostility: TacticalGraphicHostility.hostileFaker,
        });
        for (const feature of handler.getFeatures()) {
            expect(readGraphicLabels(feature).hostility).toBe(TacticalGraphicHostility.hostileFaker);
        }
    });

    it('rebuilds the symbol at the new affiliation when the hostility is changed', () => {
        const seen: string[] = [];
        echoProvider(seen);
        const handler = build(name);

        const before = drawnStyles(handler).find(style => style.getImage() instanceof Icon);
        expect(before).toBeDefined();
        const pendingSidc = seen.at(-1)!;

        writeGraphicProperties(handler.getFeatures(), name, {
            designation: '',
            hostility: TacticalGraphicHostility.hostileFaker,
        });
        const after = drawnStyles(handler).find(style => style.getImage() instanceof Icon);

        // Position 4 of the SIDC is the standard identity: 6 is hostile, 0 pending.
        expect(seen.at(-1)![3]).toBe('6');
        expect(pendingSidc[3]).toBe('0');
        expect(after).toBeDefined();
    });

    it('draws its letter twice, one at each arm"s inner end', () => {
        const handler = build(name);
        const letters = drawnStyles(handler)
            .map(style => style.getText?.()?.getText?.())
            .filter(text => typeof text === 'string');
        expect(letters).toHaveLength(2);
        expect(new Set(letters).size).toBe(1);
    });
});
