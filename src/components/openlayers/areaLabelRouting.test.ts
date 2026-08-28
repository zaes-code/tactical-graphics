/**
 * # Every area label routes to the same painter on both engines
 *
 * `getAreaLabelStylesFn` no longer *draws* anything of its own — every branch of its
 * switch bridges to a paint function, and so does its `default:`. What it still does is
 * **route**, and MapLibre routes the same names through `getPaintFunction(name).label`.
 * Two routing tables, one of which is a switch nobody diffs against the other.
 *
 * That is not a theoretical risk. The fighter engagement zone (APP-06 171400) was left out
 * of the switch's air-coordinating case, so on OpenLayers alone it fell through to the
 * ordinary area block: `FEZ ALPHA` over a date range, with the minimum and maximum
 * altitudes its own dialog collects rendered nowhere at all. MapLibre had drawn the full
 * `MIN ALT: / MAX ALT: / TIME FROM: / TIME TO:` block the whole time. Nothing failed —
 * both engines drew *something*, and both looked plausible on their own.
 *
 * So this compares the two routings directly, for every graphic an `AreaGraphicBase`
 * holds, with a bag full enough that a layout which ignores a field shows up as missing
 * text. It is the general form of that defect, and it costs one assertion per area.
 */

import Feature from 'ol/Feature';
import {Point} from 'ol/geom';
import Style from 'ol/style/Style';
import {
    AltitudeDatum,
    getPaintFunction,
    listTacticalGraphicNames,
    resetTacticalGraphicsConfig,
    TacticalGraphicName,
} from '@zaes/tactical-graphics';
import type {PaintContext, PaintFeature, ProjectedPosition} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {AreaGraphicBase} from './graphics/AreaGraphicBase';
import {getAreaLabelStylesFn} from './openlayerStyles';
import {writeGraphicProperties} from './graphicProperties';

const RES = 40;

/** A square ring 400 km across, centered on the origin, and its bounding box. */
const HALF = 200_000;
const RING: ProjectedPosition[] = [
    [-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF], [-HALF, -HALF],
];

/**
 * Every amplifier an area layout might read, so a branch that drops one is visible as
 * text the other engine drew and this one did not.
 */
const BAG = {
    designation: 'ALPHA',
    secondDesignation: 'BRAVO',
    additionalInfo: 'NOTE',
    minAltitude: 500,
    maxAltitude: 2000,
    altitudeDatum: AltitudeDatum.aboveGroundLevel,
    startDate: '021200ZJUN26',
    endDate: '021800ZJUN26',
    grid: '18SUJ2345',
    eff: '021200Z-021800Z',
} as const;

const context: PaintContext = {
    resolution: RES,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** The names an `AreaGraphicBase` holds — the ones `getAreaLabelStylesFn` is called for. */
const AREA_NAMES = (listTacticalGraphicNames() as TacticalGraphicName[])
    .filter(n => String(n) !== 'AxisOfAttack')
    .filter(name => {
        try {
            return getController(name, RES).graphic instanceof AreaGraphicBase;
        } catch {
            return false;
        }
    });

/** What this engine renders, through the switch. */
function openLayersTexts(name: TacticalGraphicName): string[] {
    const feature = new Feature(new Point([0, 0]));
    writeGraphicProperties([feature], name, {...BAG});
    feature.set('polygonRing', RING);
    feature.set('polygonMinX', -HALF);
    feature.set('polygonMinY', -HALF);
    feature.set('polygonMaxX', HALF);
    feature.set('polygonMaxY', HALF);

    const result = getAreaLabelStylesFn(name)(feature, RES);
    const styles: Style[] = Array.isArray(result) ? result : result ? [result as Style] : [];
    return styles
        .map(s => s.getText()?.getText())
        .filter((t): t is string => typeof t === 'string')
        .map(t => t.trim())
        .filter(Boolean);
}

/** What the shared registry says, which is what MapLibre renders. */
function registryTexts(name: TacticalGraphicName): string[] {
    const paint = getPaintFunction(name)?.label;
    if (!paint) return [];
    const feature = {
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name, ...BAG},
        ring: RING,
        bounds: {minX: -HALF, minY: -HALF, maxX: HALF, maxY: HALF},
    } as unknown as PaintFeature;
    return paint(feature, context)
        .map(p => p.text?.text)
        .filter((t): t is string => typeof t === 'string')
        .map(t => t.trim())
        .filter(Boolean);
}

beforeEach(() => resetTacticalGraphicsConfig());

describe(`area labels route the same on both engines (${AREA_NAMES.length} names)`, () => {
    it.each(AREA_NAMES.map(n => [String(n), n] as const))('%s', (_label, name) => {
        expect(openLayersTexts(name).sort()).toEqual(registryTexts(name).sort());
    });
});

describe('APP-06 171400 — the fighter engagement zone', () => {
    it('draws exactly what the joint engagement zone draws, but for the literal', () => {
        const fez = openLayersTexts(TacticalGraphicName.FighterEngagementZone).join('\n');
        const jez = openLayersTexts(TacticalGraphicName.JointEngagementZone).join('\n');
        expect(fez.replace(/\bFEZ\b/g, 'JEZ')).toBe(jez);
    });

    it('renders the altitudes its own dialog collects', () => {
        // The defect this suite was written for: the block was the ordinary area stack,
        // which has nowhere to put an altitude, so the two fields were silently dropped.
        const text = openLayersTexts(TacticalGraphicName.FighterEngagementZone).join('\n');
        expect(text).toContain('MIN ALT:');
        expect(text).toContain('MAX ALT:');
        expect(text).toContain('FEZ');
    });
});
