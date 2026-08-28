/**
 * Guards the two properties of the sample sweep that are easy to break by
 * accident and expensive to notice by eye:
 *
 *  1. A tactical mission task never picks up a hostility. FM 1-02.2 gives the
 *     Chapter 6 tasks no amplifier fields at all, so sweeping with a hostility
 *     selected must leave them byte-for-byte as they render without one.
 *  2. Line graphics are drawn LINE_SCALE× longer than area graphics, and every
 *     sample still measures to a finite box — which is what the packer needs in
 *     order to promise that no two samples overlap.
 */
import {
    GRAPHIC_CATEGORIES,
    TacticalGraphicCategory,
    TacticalGraphicHostility,
    TacticalGraphicName,
} from '@zaes/tactical-graphics';
import type {TacticalGraphicProperties} from '@zaes/tactical-graphics';

import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';
import {PROVEN_GRAPHICS} from './provenGraphics';
import type {GraphicLabels} from '../../utils/graphicLinkRegistry';
import {supportsHostility} from './graphicFieldRegistry';
import {readGraphicLabels, writeGraphicProperties} from './graphicProperties';
import {HALF, LINE_HALF, LINE_SCALE, applyBaseGeometry, applyHostility, groupByCategory, measureSample} from './sampleGallery';
import {buildSampleGraphics, sampleFeatureCollection} from '../maplibre/sampleGallery';
import {isRectangular} from '@zaes/tactical-graphics';

/**
 * The doctrinal colors below are the light-mode ones, and the palette has had a
 * second, dark set since the graphics layer stopped being repainted by the demo's
 * CSS invert filter. Pin the mode rather than lean on the default: these assertions
 * are about FM 1-02.2, and a later change to what the library defaults to must not
 * quietly turn them into assertions about a different palette.
 */
// (No mode to set: the library has one palette, so the doctrinal colors are simply
// what an unconfigured consumer gets.)

/** Roughly what the sweep frames at; only the ratios under test depend on it. */
const RESOLUTION = 1200;
/** What getColorByHostility returns for hostileFaker — doctrinal, so it is the only answer. */
const HOSTILE_RED = 'rgba(255, 0, 0, 1)';

/**
 * Every tactical mission task that does not take an identity — not only the ones the sweep
 * can draw, because the rule is doctrinal and has to hold for the 13 still finishing their
 * shapes too.
 *
 * The exfiltration is filtered out rather than special-cased below: it is one of the two
 * graphics that override the category rule, and the partition here is "does it take a
 * hostility", not "is it a mission task". @see supportsHostility
 */
const missionTasks = (Object.keys(GRAPHIC_CATEGORIES) as TacticalGraphicName[])
    .filter(n => GRAPHIC_CATEGORIES[n] === TacticalGraphicCategory.TacticalMissionTasks)
    .filter(n => !supportsHostility(n));
const others = PROVEN_GRAPHICS.filter(supportsHostility);

/**
 * Builds a sample the way the sweep does, minus the map. A generator that throws
 * still yields a handler: the hostility rule is about what gets stamped onto the
 * features, and a graphic that cannot draw yet must not be stamped either.
 */
function sample(name: TacticalGraphicName) {
    const handler = getController(name, RESOLUTION);
    handler.setSymbolId('test');
    try {
        applyBaseGeometry(handler, name, 0, 0, 'test');
    } catch {
        // an unfinished generator — the assertions below still apply
    }
    return handler;
}

describe('sweeping with a hostility', () => {
    it('covers both sides of the rule, so neither branch is vacuous', () => {
        // A floor, not a count — it only guards against the `it.each` below
        // silently iterating nothing. Excluding a graphic legitimately lowers
        // it (22 since FollowAndAssume / FollowAndSupport came out on
        // 2026-07-31; see ai/excluded-graphics.md), so move it down when that
        // happens rather than treating the drop as a failure.
        expect(missionTasks.length).toBeGreaterThanOrEqual(22);
        expect(others.length).toBeGreaterThan(100);
    });

    it.each(missionTasks)('leaves %s untouched', name => {
        const handler = sample(name);
        applyHostility(handler, name, TacticalGraphicHostility.hostileFaker);

        handler.getFeatures().forEach(f => {
            expect(f.get('hostility')).toBeUndefined();
            expect(f.get('hostilityColor')).toBeUndefined();
            expect(readGraphicLabels(f).hostility).toBeUndefined();
        });
    });

    it.each(others)('stamps %s, which does take the field', name => {
        const handler = sample(name);
        applyHostility(handler, name, TacticalGraphicHostility.hostileFaker);

        // Assert the actual color, not merely that something was stamped: an
        // enum member that does not exist reads as undefined, and the default
        // color would still make a "was it stamped?" check pass.
        const stamped = handler.getFeatures().filter(f => f.get('hostilityColor') === HOSTILE_RED);
        expect(stamped.length).toBeGreaterThan(0);
    });

    it('skips the tactical mission tasks, bar the two that carry an identity', () => {
        expect(missionTasks.every(n => !supportsHostility(n))).toBe(true);
        // The exception, so the filter above cannot quietly empty the list.
        expect(supportsHostility(TacticalGraphicName.Exfiltrate)).toBe(true);
        expect(supportsHostility(TacticalGraphicName.Infiltration)).toBe(true);
    });

    it('skips line of contact, which draws both identities at once', () => {
        // Its enemy-side wave is already red and its friendly-side wave black,
        // per FM 1-02.2's line control measure table, so there is nothing for a
        // hostility selection to change.
        expect(supportsHostility(TacticalGraphicName.LineOfContact)).toBe(false);
        expect(others).not.toContain(TacticalGraphicName.LineOfContact);
    });

    it('skips the table 5-19 obstacle effects, which twin a mission task', () => {
        // Chapter 5 by category, so the derivation above would switch hostility
        // on for them. But each is drawn as an exact copy of the Chapter 6
        // mission task of the same doctrinal name, letter aside, and a twin
        // that goes red where its original stays black is not a twin.
        const twins = [
            TacticalGraphicName.Block,
            TacticalGraphicName.Disrupt,
            TacticalGraphicName.Fix,
            TacticalGraphicName.Turn,
        ];
        twins.forEach(name => {
            expect(supportsHostility(name)).toBe(false);
            expect(others).not.toContain(name);
        });
    });
});

/**
 * The seven graphics whose style functions used to hardcode black and ignore the
 * stamped hostility color. FM 1-02.2 para 5-3 puts every hostile control
 * measure's line work in red, inner detail included — the airfield's crossed
 * runways and the fields-of-fire rectangle are part of the symbol, not
 * amplifiers. Text amplifiers stay black and are excluded below.
 */
const FIXED = [
    TacticalGraphicName.MovementToContact,
    TacticalGraphicName.Pursuit,
    TacticalGraphicName.MobileDefense,
    TacticalGraphicName.Airfield,
    TacticalGraphicName.Envelopment,
    TacticalGraphicName.Infiltration,
    TacticalGraphicName.FieldsOfFire,
];

const BLACKS = ['#000000', 'black', 'rgba(0,0,0,1)', '#000'];
const normalize = (c: unknown) => String(c).replace(/\s/g, '').toLowerCase();

/** Every stroke and fill color a handler renders, ignoring text amplifiers. */
function strokeColors(handler: ReturnType<typeof getController>): string[] {
    const found: string[] = [];
    handler.getFeatures().forEach(f => {
        const style = f.getStyle();
        const result = typeof style === 'function' ? style(f, RESOLUTION) : style;
        const list = Array.isArray(result) ? result : result ? [result] : [];
        list.forEach(s => {
            if (s.getText?.()?.getText?.()) return; // an amplifier — black by rule
            const stroke = s.getStroke?.()?.getColor?.();
            const fill = s.getFill?.()?.getColor?.();
            if (stroke) found.push(normalize(stroke));
            if (fill) found.push(normalize(fill));
        });
    });
    return found;
}

describe('hostile line work is red, inner detail included', () => {
    it.each(FIXED)('%s paints no black once hostile', name => {
        const handler = sample(name);
        applyHostility(handler, name, TacticalGraphicHostility.hostileFaker);

        const colors = strokeColors(handler);
        expect(colors.length).toBeGreaterThan(0);
        expect(colors).toContain(normalize(HOSTILE_RED));
        expect(colors.filter(c => BLACKS.includes(c))).toEqual([]);
    });

    it.each(FIXED)('%s is still black with no hostility', name => {
        const colors = strokeColors(sample(name));
        expect(colors).not.toContain(normalize(HOSTILE_RED));
    });
});

describe('sample sizing', () => {
    it('draws line graphics LINE_SCALE× the span of an area graphic', () => {
        expect(LINE_HALF).toBe(HALF * LINE_SCALE);
        expect(LINE_SCALE).toBeGreaterThanOrEqual(3);
    });

    it('gives every line sample a span of at least 2 × LINE_HALF', () => {
        const lines = PROVEN_GRAPHICS.filter(n => getController(n, RESOLUTION) instanceof LineGraphicController);
        expect(lines.length).toBeGreaterThan(0);

        const short = lines
            .map(name => ({name, box: measureSample(name, RESOLUTION)}))
            .filter(({box}) => box && box.dx1 - box.dx0 < 2 * LINE_HALF * 0.98)
            .map(({name}) => name);
        expect(short).toEqual([]);
    });

    it('measures every proven graphic to a finite box', () => {
        const unmeasurable = PROVEN_GRAPHICS.filter(name => {
            const box = measureSample(name, RESOLUTION);
            return !box || ![box.dx0, box.dy0, box.dx1, box.dy1].every(Number.isFinite);
        });
        expect(unmeasurable).toEqual([]);
    });
});

describe('grouping', () => {
    it('buckets every proven graphic exactly once, in category order', () => {
        const groups = groupByCategory(PROVEN_GRAPHICS);
        const flat = groups.reduce<TacticalGraphicName[]>((all, [, names]) => all.concat(names), []);

        expect(flat.slice().sort()).toEqual(PROVEN_GRAPHICS.slice().sort());
        expect(new Set(flat).size).toBe(PROVEN_GRAPHICS.length);

        const order = Object.values(TacticalGraphicCategory) as TacticalGraphicCategory[];
        const seen = groups.map(([category]) => order.indexOf(category));
        expect(seen).toEqual(seen.slice().sort((a, b) => a - b));
    });

    it('puts every member of a bucket in that bucket’s category', () => {
        groupByCategory(PROVEN_GRAPHICS).forEach(([category, names]) => {
            names.forEach(name => expect(GRAPHIC_CATEGORIES[name]).toBe(category));
        });
    });
});

/**
 * The same rule as above, reached the way a *saved* graphic reaches it.
 *
 * `applyHostility` stamps the amplifier bag **and** the loose `hostility` /
 * `hostilityColor` keys, because that is what the demo's dialog and sweep do. Restore
 * does not: `restoreTacticalGraphics` rebuilds from `properties.tacticalGraphic` alone,
 * and so does any consumer following the README's `writeGraphicProperties` example. A
 * style function reading only the loose keys was therefore correct on screen and wrong
 * for every graphic that had been round-tripped — silently, since nothing throws and the
 * shape is still right.
 *
 * So: stamp the bag and nothing else, and require the line work to come out red anyway.
 */
describe('hostility survives a bag-only stamp, as restore and consumers produce', () => {
    const bagOnly = (name: TacticalGraphicName) => {
        const handler = sample(name);
        const holder = handler.graphic as {setLabel?: (l: GraphicLabels) => void};
        const labels: GraphicLabels = {label: '', hostility: TacticalGraphicHostility.hostileFaker};
        // Deliberately not `applyHostility`: no loose keys, exactly what restore leaves.
        if (holder.setLabel) holder.setLabel(labels);
        else writeGraphicProperties(handler.getFeatures(), name, labels);
        return handler;
    };

    it.each(others)('%s paints hostile red from the bag alone', name => {
        const colors = strokeColors(bagOnly(name));
        expect(colors.length).toBeGreaterThan(0);
        expect(colors).toContain(normalize(HOSTILE_RED));
    });
});

/**
 * The sweep's own shapes, which are a documentation decision rather than a rendering
 * one: a catalog whose job is showing what a symbol looks like must not draw the
 * fourteen rectangular variants identically to the irregular areas they exist to be an
 * alternative to. Four corners means a rectangle, five means an area.
 *
 * Asserted on `sampleFeatureCollection`, which is what **both** engines draw — the
 * OpenLayers sweep restores the very same collection — so one assertion covers them.
 */
describe('the sample sweep tells rectangles from areas', () => {
    const rings = () =>
        sampleFeatureCollection()
            .features.filter(f => f.geometry.type === 'Polygon')
            .map(f => ({
                name: (f.properties as {tacticalGraphic: {name: TacticalGraphicName}}).tacticalGraphic.name,
                // Corners, not coordinates: a ring repeats its first point.
                corners: (f.geometry as {coordinates: number[][][]}).coordinates[0].length - 1,
            }));

    /**
     * The rectangles left this comparison on 2026-08-27: their base is the axis APP-06
     * defines them by — two anchor points and a width — so there is no ring in the sweep
     * to count corners on. What replaces the assertion is the same guarantee stated at
     * the source: every one of them is a two-point line carrying a width, which is a
     * different sample from an irregular area's five-cornered ring by construction.
     * @see RectangularArea
     */
    it('draws every rectangular variant from two anchor points', () => {
        const axes = sampleFeatureCollection().features
            .map(f => ({
                name: (f.properties as {tacticalGraphic: {name: TacticalGraphicName}}).tacticalGraphic.name,
                geometry: f.geometry,
            }))
            .filter(f => isRectangular(f.name));
        expect(axes.length).toBeGreaterThan(0);
        for (const {geometry} of axes) {
            expect(geometry.type).toBe('LineString');
            expect((geometry as {coordinates: number[][]}).coordinates).toHaveLength(2);
        }
    });

    it('draws every other area with five, so the two cannot be confused', () => {
        const areas = rings().filter(r => !isRectangular(r.name));
        expect(areas.length).toBeGreaterThan(0);
        expect(areas.every(r => r.corners === 5)).toBe(true);
    });
});

/**
 * # The two engines draw the same catalog
 *
 * `buildSampleGraphics` (MapLibre realizes these directly) and `sampleFeatureCollection`
 * (the OpenLayers sweep restores this) are two exits from one list. They were not always:
 * one sorted by category and the other took registry order, so the circular range fan sat
 * in a different cell in each engine and every side-by-side comparison was comparing two
 * different pictures. A pixel diff cannot report that — it sees two full, plausible
 * catalogs — so the ordering is asserted here instead.
 */
describe('both engines lay the sweep out identically', () => {
    it('emits the same graphics in the same order', () => {
        const built = buildSampleGraphics().graphics.map(g => g.name);
        const collected = sampleFeatureCollection().features.map(
            f => (f.properties as {tacticalGraphic: {name: TacticalGraphicName}}).tacticalGraphic.name,
        );
        expect(collected).toEqual(built);
    });

    it('gives each cell its own identity, so a graphic may appear twice', () => {
        const ids = sampleFeatureCollection().features.map(f => (f.properties as {symbolId: string}).symbolId);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

/**
 * The range fans are the one family whose interesting variation is in the properties
 * rather than the geometry: a lone band draws a ring, three draw nested rings with the
 * labels sharing the gaps between them. A catalog with only the first shows the shape
 * and hides the graphic, so each fan appears twice.
 */
describe('the range fans appear once with one band and once with several', () => {
    const bandCounts = (name: TacticalGraphicName): number[] =>
        sampleFeatureCollection()
            .features.map(f => (f.properties as {tacticalGraphic: TacticalGraphicProperties}).tacticalGraphic)
            .filter(g => g.name === name)
            .map(g => g.rangeFan?.bands?.length ?? 0);

    it.each([TacticalGraphicName.WeaponSensorRangeFanCircular, TacticalGraphicName.WeaponSensorRangeFanSector])(
        '%s',
        name => {
            const counts = bandCounts(name);
            expect(counts.length).toBe(2);
            expect(counts).toContain(1);
            expect(counts.some(n => n > 1)).toBe(true);
        },
    );

    it('gives the multi-band sector its own bearings per band, which the circle cannot do', () => {
        // Only the multi-band one. The single-band sample omits them on purpose, so the
        // catalog also shows a sector falling back to its own span.
        const bands = sampleFeatureCollection()
            .features.map(f => (f.properties as {tacticalGraphic: TacticalGraphicProperties}).tacticalGraphic)
            .filter(g => g.name === TacticalGraphicName.WeaponSensorRangeFanSector)
            .map(g => g.rangeFan?.bands ?? [])
            .find(b => b.length > 1);
        expect(bands?.length).toBeGreaterThan(1);
        expect(bands?.every(b => b.leftAzimuthDeg !== undefined && b.rightAzimuthDeg !== undefined)).toBe(true);
    });
});
