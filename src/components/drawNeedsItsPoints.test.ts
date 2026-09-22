/**
 * # A draw finishes when the symbol has its points, on both engines
 *
 * User's report, 2026-09-21: on OpenLayers a roadblock (or any demolition obstacle) drawn with
 * two clicks and a double-click stored two points, and its side grip then did nothing, because
 * OpenLayers ended every line at two. MapLibre waited for the third click. Both engines now ask
 * `drawIsComplete`, and a file already saved with two points gets its third on restore.
 *
 * The OpenLayers `Draw` interaction cannot run in jsdom, so its half is driven in the browser
 * (`tmp/probe-two-click.mjs`, `tmp/sweep-draw-finish.mjs`); this pins the rule, the repair, and
 * the restore that applies it.
 */
import fs from 'fs';
import path from 'path';
import VectorSource from 'ol/source/Vector';
import LineString from 'ol/geom/LineString';
import {toLonLat} from 'ol/proj';
import type {FeatureCollection, Position} from 'geojson';
import {
    ROADBLOCK_MAX_HALF_WIDTH_RATIO,
    TacticalGraphicName,
    completeDemolitionBase,
    drawIsComplete,
} from '@zaes/tactical-graphics';
import type {TacticalGraphicHandler} from './openlayers/openlayersAdapter';
import type {TacticalGraphicsManager} from './openlayers/TacticalGraphicsManager';
import {restoreTacticalGraphics} from './openlayers/persistence';

const ROADBLOCK = TacticalGraphicName.RoadblockCompleteExecuted;
const DEMOLITION = [
    TacticalGraphicName.ExplosivesPlannedStateOfReadiness,
    TacticalGraphicName.ExplosivesStateOfReadiness1Safe,
    TacticalGraphicName.ExplosivesStateOfReadiness2ArmedButPassable,
    ROADBLOCK,
];
const TWO: Position[] = [[12, 41], [12.4, 41]];
const THREE: Position[] = [[12, 41], [12.4, 41], [12.2, 41.03]];

describe('drawIsComplete', () => {
    it.each(DEMOLITION)('keeps %s drawing at two points and finishes it at three', name => {
        expect(drawIsComplete(name, TWO)).toBe(false);
        expect(drawIsComplete(name, THREE)).toBe(true);
    });

    it('lets a free-form line finish at two', () => {
        expect(drawIsComplete(TacticalGraphicName.Abatis, TWO)).toBe(true);
        expect(drawIsComplete(TacticalGraphicName.PhaseLine, [TWO[0]])).toBe(false);
    });

    it('lets fields of fire finish at two, because its second leg follows from them', () => {
        expect(drawIsComplete(TacticalGraphicName.FieldsOfFire, TWO)).toBe(true);
    });

    it('counts clicks where the library states them rather than stored points', () => {
        // Envelopment stores four anchors and is drawn with three.
        expect(drawIsComplete(TacticalGraphicName.Envelopment, THREE)).toBe(true);
        expect(drawIsComplete(TacticalGraphicName.Envelopment, TWO)).toBe(false);
    });
});

describe('completeDemolitionBase', () => {
    it.each(DEMOLITION)('gives a two-point %s its side point', name => {
        const repaired = completeDemolitionBase(name, TWO);
        expect(repaired).toHaveLength(3);
        expect(repaired.slice(0, 2)).toEqual(TWO);
        // Square off the midpoint, on the right of point 1 to point 2 (south, for an eastward line).
        expect(repaired[2][0]).toBeCloseTo(12.2, 3);
        expect(repaired[2][1]).toBeLessThan(41);
    });

    it('keeps the roadblock inside its limits', () => {
        const [a, b, side] = completeDemolitionBase(ROADBLOCK, TWO);
        const km = (p: Position, q: Position) => Math.hypot((p[0] - q[0]) * Math.cos((41 * Math.PI) / 180), p[1] - q[1]) * 111.32;
        expect(km([12.2, 41], side) / km(a, b)).toBeLessThanOrEqual(ROADBLOCK_MAX_HALF_WIDTH_RATIO + 1e-3);
    });

    it('leaves every other base alone', () => {
        expect(completeDemolitionBase(ROADBLOCK, THREE)).toBe(THREE);
        expect(completeDemolitionBase(TacticalGraphicName.Breach, TWO)).toBe(TWO);
        expect(completeDemolitionBase(TacticalGraphicName.PhaseLine, TWO)).toBe(TWO);
    });
});

function fakeManager() {
    return {
        renderingVectorSource: new VectorSource(),
        graphicControllers: [] as TacticalGraphicHandler[],
        map: {getView: () => ({on: () => undefined, getResolution: () => 1200})},
        watchResolution: () => undefined,
        unwatchResolution: () => undefined,
        releaseAllGraphics: () => undefined,
    } as unknown as TacticalGraphicsManager;
}

const savedWithTwo = (name: TacticalGraphicName): FeatureCollection => ({
    type: 'FeatureCollection',
    tacticalGraphicsVersion: 2,
    features: [{type: 'Feature', geometry: {type: 'LineString', coordinates: TWO}, properties: {tacticalGraphic: {name}, symbolId: `two-${name}`}}],
} as FeatureCollection);

describe('a demolition obstacle saved with two points', () => {
    it.each(DEMOLITION)('restores %s on OpenLayers with its third point, so the side grip has a vertex', name => {
        const manager = fakeManager();
        restoreTacticalGraphics(manager, savedWithTwo(name));
        const handler = manager.graphicControllers[0] as unknown as {graphic: {base: {getGeometry(): LineString}}};
        const base = handler.graphic.base.getGeometry().getCoordinates().map(c => toLonLat(c));
        expect(base).toHaveLength(3);
    });

    it('is repaired by MapLibre’s restore too', () => {
        // Source-level: that restore needs a live map. It must run the same repair, before the
        // version-gated upgrade, on every file.
        const restore = fs.readFileSync(path.join(__dirname, 'maplibre/createTacticalGraphics.ts'), 'utf8');
        expect(restore).toContain('completeDemolitionBase(properties.name, geometry.coordinates)');
    });
});
