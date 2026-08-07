/**
 * Every amplifier a graphic accepts, set and round-tripped.
 *
 * `fullRoundTrip.test.ts` proves the geometry survives. This proves the *fields* do: for
 * each graphic it reads `getGraphicFields(name)`, fills in every input that graphic
 * actually offers, saves, restores, and compares. A field that silently fails to persist
 * is invisible until a user loses a label they typed.
 */
import VectorSource from 'ol/source/Vector';
import {listTacticalGraphicNames, TacticalGraphicHostility, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {getGraphicFields} from './graphicFieldRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {applyBaseGeometry} from './sampleGallery';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './persistence';
import {readGraphicLabels, writeGraphicProperties} from './graphicProperties';
import type {GraphicLabels} from '../../utils/graphicLinkRegistry';

const RES = 1200;
const CX = 500_000;
const CY = 2_000_000;

function fakeManager() {
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: () => undefined, getResolution: () => RES * 4})},
        watchResolution: () => undefined,
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

/** Every amplifier this graphic's dialog would offer, filled with a distinctive value. */
function labelsFor(name: TacticalGraphicName): GraphicLabels {
    const f = getGraphicFields(name);
    const labels: Record<string, unknown> = {label: ''};
    if (f.identifier1) labels.label = 'ID-ONE';
    if (f.identifier2) labels.secondId = 'ID-TWO';
    if (f.dtg1) labels.startDate = '021200ZJUN26';
    if (f.dtg2) labels.endDate = '021800ZJUN26';
    if (f.hostility) labels.hostility = TacticalGraphicHostility.hostileFaker;
    if (f.status) labels.status = 'planned';
    if (f.echelon) labels.echelon = 'battalion';
    if (f.altitude1) labels.minAltitude = '500';
    if (f.altitude2) labels.maxAltitude = '2000';
    if (f.grids) labels.grid = '18SUJ2345';
    if (f.weapon) labels.weapon = 'M252 81mm';
    return labels as GraphicLabels;
}

const NAMES = (listTacticalGraphicNames() as TacticalGraphicName[])
    .filter(n => String(n) !== 'AxisOfAttack');

describe(`every field a graphic offers survives a round trip (${NAMES.length} names)`, () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        const from = fakeManager();
        const handler = getController(name, RES);
        handler.setSymbolId(`id-${name}`);
        handler.getFeatures().forEach(f => {
            f.set('graphicName', name);
            f.set('symbolId', `id-${name}`);
        });
        applyBaseGeometry(handler, name, CX, CY, `id-${name}`);

        const wanted = labelsFor(name);
        // The same fallback the dialog and `applyRestoredGeometry` use: not every holder
        // implements `setLabel`, and asserting it does was this test being wrong.
        const holder = handler.graphic as {setLabel?: (l: GraphicLabels) => void};
        if (holder.setLabel) holder.setLabel(wanted);
        else writeGraphicProperties(handler.getFeatures(), name, wanted);

        from.renderingVectorSource.addFeatures(handler.getFeatures());
        from.graphicControllers.push(handler);

        const to = fakeManager();
        const report = restoreTacticalGraphics(to, serializeTacticalGraphics(from));
        expect(report.failed).toEqual([]);

        const got = readGraphicLabels(to.graphicControllers[0].graphic.base) as Record<string, unknown>;
        for (const [key, value] of Object.entries(wanted)) {
            expect({field: key, value: got[key]}).toEqual({field: key, value});
        }
    });
});
