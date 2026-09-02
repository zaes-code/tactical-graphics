import {configureTacticalGraphics} from '../core/config';
import {getLabelFillColor} from '../core/symbology';
import {TacticalGraphicHostility, TacticalGraphicName} from '../core/type';

import {getPaintFunction} from './registry';

import type {Paint, PaintContext, PaintFeature} from '../core/paint';

/**
 * **A number set in a gap in the line is still text.**
 *
 * `nestedZonePaint` and the radiation contour both draw into a break they cut in their own
 * ring, and both were handing `breakLabel` the LINE colour — so the zone numbers and the
 * dose came out red on a hostile graphic no matter what the host had set. Every other
 * label in the library goes through `labelColorOf`, which is what reads the setting.
 *
 * Found by a user toggling "Label Text Uses Hostility" and seeing the numbers ignore it.
 */
const context: PaintContext = {resolution: 10, measureText: (t: string) => t.length * 8};

/**
 * **The library ships one palette and no affiliation colours**, so an unconfigured
 * `getColorByHostility` answers black for every affiliation — including hostile. A first
 * version of this suite asserted against that and passed against the BUG as well as the
 * fix, because both branches returned the same black. A host supplies its own set, so the
 * test does too, and the two branches are then distinguishable.
 */
const HOSTILE_RED = '#c8102e';

beforeAll(() => configureTacticalGraphics({hostilityColors: {[TacticalGraphicHostility.hostileFaker]: HOSTILE_RED}}));

/** A closed ring, plus the `ring`/`bounds` the break paints read off the feature. */
function ringFeature(name: TacticalGraphicName, extra: Record<string, unknown> = {}): PaintFeature {
    const ring = [
        [0, 0],
        [40000, 0],
        [40000, 30000],
        [0, 30000],
        [0, 0],
    ];
    return {
        geometry: {type: 'MultiLineString', coordinates: [ring, ring.map(([x, y]) => [x * 1.3, y * 1.3])]},
        properties: {name, hostility: TacticalGraphicHostility.hostileFaker, ...extra},
        ring,
        bounds: {minX: 0, minY: 0, maxX: 40000, maxY: 30000},
    } as unknown as PaintFeature;
}

const textFills = (paints: Paint[]): string[] => paints.filter(p => p.text?.text).map(p => p.text!.fill as string);

describe('a label in a ring break follows the hostility setting', () => {
    afterEach(() => configureTacticalGraphics({labelUsesHostilityColor: false}));

    it('zone numbers are not hostility-coloured when the setting is off', () => {
        configureTacticalGraphics({labelUsesHostilityColor: false});
        const paint = getPaintFunction(TacticalGraphicName.MinimumSafeDistanceMultipleStrike)?.graphic;
        const fills = textFills(paint!(ringFeature(TacticalGraphicName.MinimumSafeDistanceMultipleStrike), context));

        expect(fills.length).toBeGreaterThan(0);
        for (const fill of fills) expect(fill).toBe(getLabelFillColor());
        expect(fills).not.toContain(HOSTILE_RED);
    });

    it('and are hostility-coloured when it is on', () => {
        configureTacticalGraphics({labelUsesHostilityColor: true});
        const paint = getPaintFunction(TacticalGraphicName.MinimumSafeDistanceMultipleStrike)?.graphic;
        const fills = textFills(paint!(ringFeature(TacticalGraphicName.MinimumSafeDistanceMultipleStrike), context));

        for (const fill of fills) expect(fill).toBe(HOSTILE_RED);
    });

    it('the radiation dose follows it too', () => {
        // Same break machinery, same bug: the dose is typed by the operator, so it is an
        // amplifier and never belonged to the line.
        configureTacticalGraphics({labelUsesHostilityColor: false});
        // Registered as its LABEL paint, not its graphic paint: the dose belongs in the
        // break and there is no centre block under it.
        const name = TacticalGraphicName.RadiationDoseRateContourLine;
        const paint = getPaintFunction(name)?.label;
        const fills = textFills(paint!(ringFeature(name, {additionalInfo: '30 CGH'}), context));

        expect(fills.length).toBeGreaterThan(0);
        for (const fill of fills) expect(fill).toBe(getLabelFillColor());
        expect(fills).not.toContain(HOSTILE_RED);
    });

    it('and the concentric-circle sibling, which shares the same paint', () => {
        configureTacticalGraphics({labelUsesHostilityColor: false});
        const name = TacticalGraphicName.MinimumSafeDistanceZone;
        const paint = getPaintFunction(name)?.graphic;
        const fills = textFills(paint!(ringFeature(name), context));

        expect(fills.length).toBeGreaterThan(0);
        for (const fill of fills) expect(fill).toBe(getLabelFillColor());
        expect(fills).not.toContain(HOSTILE_RED);
    });
});
