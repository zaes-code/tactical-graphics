/**
 * A snapshot must rebuild to the same shape whatever resolution the loading session is at.
 *
 * `persistence.test.ts` covers one name per *holder family*, which is the wrong axis for
 * this property: the line family is represented by PhaseLine, and PhaseLine ignores
 * `opts.size` entirely. The graphics that actually read it — PassageLane, FieldsOfFire,
 * the whole Block family — went untested, and eight of them were silently
 * resolution-dependent. This sweeps by *name* instead, which is what found them.
 *
 * Restore is handed a view resolution 4x the drawing one (see `VIEW_RES`), so anything
 * still deriving geometry from the live resolution shows up as a changed span.
 */
import VectorSource from 'ol/source/Vector';
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import type {TacticalGraphicHandler} from './openlayersAdapter';
import type {TacticalGraphicsManager} from './TacticalGraphicsManager';
import {applyBaseGeometry} from './sampleGallery';
import {restoreTacticalGraphics, serializeTacticalGraphics} from './persistence';

const RES = 1200;
const VIEW_RES = RES * 4;
const CX = 500_000;
const CY = 2_000_000;

function fakeManager() {
    const listeners: string[] = [];
    const watched: TacticalGraphicHandler[] = [];
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: (e: string) => listeners.push(e), getResolution: () => VIEW_RES})},
        watchResolution: (h: TacticalGraphicHandler) => {
            if (!watched.includes(h)) watched.push(h);
        },
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

const NAMES: TacticalGraphicName[] = [
    TacticalGraphicName.PhaseLine,
    TacticalGraphicName.FieldsOfFire,
    TacticalGraphicName.ForwardLineOfOwnTroops,
    TacticalGraphicName.ObstacleLine,
    TacticalGraphicName.WireUnspecified,
    TacticalGraphicName.WireSingleFence,
    TacticalGraphicName.WireDoubleFence,
    TacticalGraphicName.WireDoubleApronFence,
    TacticalGraphicName.WireLowWireFence,
    TacticalGraphicName.WireHighWireFence,
    TacticalGraphicName.WireSingleConcertina,
    TacticalGraphicName.WireDoubleStrandConcertina,
    TacticalGraphicName.WireTripleStrandConcertina,
    TacticalGraphicName.FortifiedLine,
    TacticalGraphicName.PassageLane,
    TacticalGraphicName.FerryCrossing,
    TacticalGraphicName.LinearTarget,
    TacticalGraphicName.FinalProtectiveFire,
    TacticalGraphicName.Route,
    TacticalGraphicName.MainAxisOfAdvance,
    TacticalGraphicName.SupportingAxisOfAdvance,
    TacticalGraphicName.Counterattack,
    TacticalGraphicName.Infiltration,
    TacticalGraphicName.MobileDefense,
    TacticalGraphicName.AirCorridor,
    TacticalGraphicName.TacticalBlock,
    TacticalGraphicName.AttackByFire,
    TacticalGraphicName.SupportByFire,
    TacticalGraphicName.Breach,
    TacticalGraphicName.Bypass,
    TacticalGraphicName.Canalize,
    TacticalGraphicName.Clear,
    TacticalGraphicName.Disrupt,
    TacticalGraphicName.Delay,
    TacticalGraphicName.Exfiltrate,
    TacticalGraphicName.ReliefInPlace,
    TacticalGraphicName.Boundary,
    TacticalGraphicName.ObjectiveArea,
    TacticalGraphicName.BaseDefenseZone,
    TacticalGraphicName.FreeFireAreaCircular,
    TacticalGraphicName.WeaponSensorRangeFanCircular,
];

/** Widest span of the rendered graphic — a scale-free proxy for "did the shape change". */
function graphicSpan(handler: TacticalGraphicHandler): number {
    const g = handler.graphic.getFeatures().find(f => f.get('role') === 'graphic')?.getGeometry();
    if (!g) return NaN;
    const e = g.getExtent();
    return Math.max(e[2] - e[0], e[3] - e[1]);
}

describe('rebuilding at a different resolution', () => {
    it.each(NAMES.map(n => [String(n), n] as const))('%s keeps its shape', (_label, name) => {
        const from = fakeManager();
        const handler = getController(name, RES);
        handler.setSymbolId(`id-${name}`);
        handler.getFeatures().forEach(f => {
            f.set('graphicName', name);
            f.set('symbolId', `id-${name}`);
        });
        applyBaseGeometry(handler, name, CX, CY, `id-${name}`);
        from.renderingVectorSource.addFeatures(handler.getFeatures());
        from.graphicControllers.push(handler);

        const before = graphicSpan(handler);
        const to = fakeManager();
        const report = restoreTacticalGraphics(to, serializeTacticalGraphics(from));
        expect(report.failed).toEqual([]);
        const after = graphicSpan(to.graphicControllers[0]);

        // Tight on purpose. An earlier 0.5% tolerance passed Exfiltrate while it was
        // still resolution-dependent — its span is dominated by the base line, so a 4x
        // change in the decoration size moved the extent by less than half a percent.
        // The only real source of drift is 4326 <-> 3857 round-tripping, ~2e-7 m.
        expect(Math.abs(after - before) / before).toBeLessThan(1e-6);
    });
});
