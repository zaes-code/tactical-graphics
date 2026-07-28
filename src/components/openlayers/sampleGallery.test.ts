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

import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';
import {PROVEN_GRAPHICS} from './provenGraphics';
import {supportsHostility} from './graphicFieldRegistry';
import {readGraphicLabels} from './graphicProperties';
import {HALF, LINE_HALF, LINE_SCALE, applyBaseGeometry, applyHostility, groupByCategory, measureSample} from './sampleGallery';

/** Roughly what the sweep frames at; only the ratios under test depend on it. */
const RESOLUTION = 1200;
/** What getColorByHostility returns for hostileFaker. */
const HOSTILE_RED = 'rgba(255, 0, 0, 1)';

/**
 * Every tactical mission task, not only the ones the sweep can draw — the rule
 * is doctrinal, so it has to hold for the 13 still finishing their shapes too.
 */
const missionTasks = (Object.keys(GRAPHIC_CATEGORIES) as TacticalGraphicName[])
    .filter(n => GRAPHIC_CATEGORIES[n] === TacticalGraphicCategory.TacticalMissionTasks);
const others = PROVEN_GRAPHICS.filter(n => GRAPHIC_CATEGORIES[n] !== TacticalGraphicCategory.TacticalMissionTasks);

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
        expect(missionTasks.length).toBeGreaterThanOrEqual(24);
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

        // Assert the actual colour, not merely that something was stamped: an
        // enum member that does not exist reads as undefined, and the default
        // colour would still make a "was it stamped?" check pass.
        const stamped = handler.getFeatures().filter(f => f.get('hostilityColor') === HOSTILE_RED);
        expect(stamped.length).toBeGreaterThan(0);
    });

    it('skips exactly the tactical mission tasks', () => {
        expect(missionTasks.every(n => !supportsHostility(n))).toBe(true);
        expect(others.every(n => supportsHostility(n))).toBe(true);
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
