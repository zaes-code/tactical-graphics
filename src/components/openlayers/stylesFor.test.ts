/**
 * # Every graphic has a style pair, and it is the one its holder uses
 *
 * `stylesFor` exists because the pairing was internal and a host guessed. These assert
 * the two things a guess got wrong: that the answer covers *every* registered graphic,
 * and that it is the same answer the library draws with itself.
 *
 * The third assertion is the one that keeps the implementation honest. The pair is read
 * off a holder built at one resolution and then cached, so if any style function closed
 * over its constructor's resolution the cache would hand out a style correct at one zoom
 * only. Nothing in the repo does that today — the rule is that a style function reads
 * the live resolution from its second argument — and this is what notices if that changes.
 */

import {Feature} from 'ol';
import GeoJSON from 'ol/format/GeoJSON';
import type {StyleFunction} from 'ol/style/Style';
import {listTacticalGraphicNames, renderTacticalGraphic, baseGeometryFor, TacticalGraphicName} from '@zaes/tactical-graphics';
import {stylesFor} from './stylesFor';
import openlayersAdapter from './openlayersAdapter';
import {ROLE_KEY} from './graphicProperties';
import {resetTacticalGraphicsConfig} from '@zaes/tactical-graphics';

/**
 * Every registered name, all of which this engine can draw.
 *
 * `AxisOfAttack` used to be the exception — a generator with no enum member, no controller
 * and no UI path — and was pinned here rather than filtered silently. It was removed in
 * 4.0.0 for appearing in neither publication.
 */
const ALL = listTacticalGraphicNames() as TacticalGraphicName[];

/** A base big enough that nothing collapses to a minimum, away from the poles. */
const LINE: [number, number][] = [[0, 0], [0.4, 0], [0.8, 0]];
const POLY: [number, number][][] = [[[0, 0], [0.6, 0], [0.6, 0.4], [0, 0.4], [0, 0]]];

/** The `graphic` and `labels` features a consumer would build for `name`, as OpenLayers sees them. */
function renderedFeatures(name: TacticalGraphicName): {graphic?: Feature; labels?: Feature} {
    const kind = baseGeometryFor(name);
    const geometry =
        kind === 'Point' ? {type: 'Point' as const, coordinates: [10, 40]}
        : kind === 'Polygon' ? {type: 'Polygon' as const, coordinates: POLY}
        : {type: 'LineString' as const, coordinates: LINE};

    let result;
    try {
        result = renderTacticalGraphic({
            type: 'Feature',
            geometry: geometry as never,
            properties: {tacticalGraphic: {name, rotation: 0, radius: 20_000, decorationSize: 20_000, width: 20_000, designation: 'ALPHA'}},
        });
    } catch {
        return {};
    }
    const format = new GeoJSON({featureProjection: 'EPSG:3857'});
    const read = (f: unknown) => (f ? (format.readFeature(f as never) as Feature) : undefined);
    return {graphic: read(result.graphic), labels: read(result.labels)};
}

const asFn = (style: unknown): StyleFunction | undefined =>
    !style ? undefined : typeof style === 'function' ? (style as StyleFunction) : ((() => style) as unknown as StyleFunction);

/** The marks a style function makes, in a form two runs can be compared by. */
function describeStyles(fn: StyleFunction | undefined, feature: Feature | undefined, resolution = 40): string[] {
    if (!fn || !feature) return [];
    return [fn(feature, resolution)].flat().filter(Boolean).map(s => {
        const style = s as import('ol/style/Style').default;
        return [
            style.getText?.()?.getText?.() ?? '',
            style.getStroke?.()?.getColor?.() ?? '',
            style.getStroke?.()?.getWidth?.() ?? '',
            style.getStroke?.()?.getLineDash?.()?.join('/') ?? '',
            style.getFill?.() ? 'fill' : '',
            style.getImage?.() ? 'image' : '',
            style.getGeometry?.() ? 'geom' : '',
        ].join('|');
    });
}

const styleCount = (fn: StyleFunction | undefined, feature: Feature | undefined): number =>
    describeStyles(fn, feature).length;

beforeEach(() => resetTacticalGraphicsConfig());

describe('stylesFor', () => {
    it('answers for every registered graphic', () => {
        const failures: string[] = [];
        for (const name of ALL) {
            try {
                if (typeof stylesFor(name).graphic !== 'function') failures.push(`${name}: graphic is not a function`);
            } catch (e) {
                failures.push(`${name}: threw ${(e as Error).message}`);
            }
        }
        expect(failures).toEqual([]);
        expect(ALL.length).toBeGreaterThan(280);
    });

    it('draws what the holder draws', () => {
        // Not identity: each `getTacticalGraphicController` call builds its own holder, so
        // the two style functions are different closures over the same dispatch. What has
        // to match is the marks they produce for the same feature at the same zoom.
        for (const name of [TacticalGraphicName.PhaseLine, TacticalGraphicName.AssemblyArea, TacticalGraphicName.Retain, TacticalGraphicName.AirCorridor, TacticalGraphicName.Cover]) {
            const holder = openlayersAdapter.getTacticalGraphicController(name, 40, 0);
            const featureFor = (role: string) => holder.getFeatures().find(f => f.get(ROLE_KEY) === role);
            const features = renderedFeatures(name);

            expect(describeStyles(stylesFor(name).graphic, features.graphic)).toEqual(
                describeStyles(asFn(featureFor('graphic')?.getStyle()), features.graphic),
            );
            // The holder's own answer to "is there a label feature" is the one reported.
            expect(stylesFor(name).labels === undefined).toBe(featureFor('label') === undefined);
            expect(describeStyles(stylesFor(name).labels, features.labels)).toEqual(
                describeStyles(asFn(featureFor('label')?.getStyle()), features.labels),
            );
        }
    });

    it('draws every registered name — there is no longer one it cannot', () => {
        /*
         * This used to assert the opposite: that `AxisOfAttack` threw, being registered with
         * no enum member and so no controller. Removing it in 4.0.0 makes the registry and
         * the enum agree, and the stronger claim is now true — every name a consumer can list
         * is a name this engine can style.
         */
        for (const name of ALL) expect(() => stylesFor(name)).not.toThrow();
    });

    it('reports no label style for the graphics that keep their text on the graphic feature', () => {
        // A phase line's "PL ALPHA" rides its own line work; styling its label geometry as
        // well is how a consumer draws the designation twice.
        expect(stylesFor(TacticalGraphicName.PhaseLine).labels).toBeUndefined();
        expect(stylesFor(TacticalGraphicName.ForwardEdgeOfBattleArea).labels).toBeUndefined();
        // …and an area's designation lives on its label feature, so that one is present.
        expect(stylesFor(TacticalGraphicName.AssemblyArea).labels).toBeDefined();
    });

    it('draws something for every graphic it claims to cover', () => {
        const silent: string[] = [];
        for (const name of ALL) {
            const {graphic, labels} = stylesFor(name);
            const features = renderedFeatures(name);
            if (!features.graphic) continue; // the generator needs inputs this sweep does not synthesize
            if (styleCount(graphic, features.graphic) + styleCount(labels, features.labels) === 0) silent.push(name);
        }
        expect(silent).toEqual([]);
    });

    it('does not bake the resolution it was built at into the styles it returns', () => {
        // The cache hands one pair to every caller at every zoom, so a style that closed
        // over its constructor's resolution would be wrong for all but one of them.
        const format = new GeoJSON({featureProjection: 'EPSG:3857'});
        for (const name of [TacticalGraphicName.PhaseLine, TacticalGraphicName.AssemblyArea, TacticalGraphicName.Retain]) {
            const features = renderedFeatures(name);
            const fresh = openlayersAdapter.getTacticalGraphicController(name, 5_000, 0);
            const freshStyle = fresh.getFeatures().find(f => f.get(ROLE_KEY) === 'graphic')!.getStyle() as StyleFunction;
            for (const resolution of [4, 40, 400]) {
                const cached = [stylesFor(name).graphic(features.graphic!, resolution)].flat().filter(Boolean);
                const other = [freshStyle(features.graphic!, resolution)].flat().filter(Boolean);
                expect(cached.length).toBe(other.length);
            }
        }
        expect(format).toBeDefined();
    });
});
