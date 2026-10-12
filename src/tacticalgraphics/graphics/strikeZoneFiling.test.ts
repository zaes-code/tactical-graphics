/**
 * The multiple-strike safe distance zone (APP-06 272101) is filed with both rings' points.
 *
 * *"Points 1 through N/2 define the inner safe zone (zone 1). Points N/2 +1 though point N defines
 * the outer zone (zone 2)"*, with an equal number of points for both. Every engine edits zone 1
 * alone and derives zone 2 from the standoff, so the conversion happens at the file: `toSnapshot`
 * writes zone 2 out, every restore reads zone 1 back. Older files, zone 1 and a width or two rings
 * and no width, keep opening as they did.
 */
import type {Feature, LineString, Position} from 'geojson';
import {renderTacticalGraphic, restoreSnapshotGraphics, toSnapshot, TacticalGraphicName} from '../index';
import {editableStrikeBase, filedStrikeBase, isFiledStrikeBase, strikeZone2} from './SafeDistanceZone';

const N = TacticalGraphicName.MinimumSafeDistanceMultipleStrike;
const zone1: Position[] = [[0, 0], [0.4, 0.1], [0.5, -0.3], [0.2, -0.45], [-0.1, -0.2]];
const width = 5000;

const base = (coordinates: Position[], bag: Record<string, unknown> = {width}): Feature<LineString> => ({
    type: 'Feature',
    geometry: {type: 'LineString', coordinates},
    properties: {role: 'base', symbolId: 'z', graphicName: N, tacticalGraphic: {name: N, ...bag}},
});

const coordinatesOf = (feature: Feature) => (feature.geometry as LineString).coordinates;

describe('filing both rings', () => {
    it('writes zone 1 then zone 2, an equal number each, zone 2 one standoff out', () => {
        const filed = filedStrikeBase(zone1, width);
        expect(filed).toHaveLength(zone1.length * 2);
        expect(filed.slice(0, zone1.length)).toEqual(zone1);
        expect(filed.slice(zone1.length)).toEqual(strikeZone2(zone1, width));
        expect(isFiledStrikeBase(filed, width)).toBe(true);
    });

    it('reads zone 1 back, and leaves a zone-1-only base alone', () => {
        expect(editableStrikeBase(filedStrikeBase(zone1, width), width)).toEqual(zone1);
        expect(editableStrikeBase(zone1, width)).toEqual(zone1);
        // Even with an even count: six points of one ring are not two rings of three.
        const six = [...zone1, [-0.15, 0.05]];
        expect(editableStrikeBase(six, width)).toEqual(six);
        expect(filedStrikeBase(filedStrikeBase(zone1, width), width)).toEqual(filedStrikeBase(zone1, width));
    });

    it('is what every snapshot carries', () => {
        const [feature] = toSnapshot([base(zone1)]).features;
        expect(coordinatesOf(feature)).toEqual(filedStrikeBase(zone1, width));
    });

    it('leaves every other graphic, and a zone with no width, exactly as handed', () => {
        const twoRingLegacy = [...zone1, ...zone1.map(([x, y]) => [x * 1.3, y * 1.3])];
        const [legacy, phase] = toSnapshot([
            base(twoRingLegacy, {}),
            {...base(zone1), properties: {tacticalGraphic: {name: TacticalGraphicName.PhaseLine, width}}},
        ]).features;
        expect(coordinatesOf(legacy)).toEqual(twoRingLegacy);
        expect(coordinatesOf(phase)).toEqual(zone1);
    });
});

describe('reading a filed zone', () => {
    it('restores zone 1 for editing, so the handles are zone 1 alone', () => {
        const [restored] = restoreSnapshotGraphics(toSnapshot([base(zone1)]), 100);
        expect(coordinatesOf(restored.graphic.base as Feature)).toEqual(zone1);
        expect(restored.graphic.handles).toHaveLength(zone1.length);
    });

    it('opens a file written before zone 2 was filed, and files it on the next save', () => {
        const old = {type: 'FeatureCollection' as const, tacticalGraphicsVersion: 2, features: [base(zone1)]};
        const [restored] = restoreSnapshotGraphics(old, 100);
        expect(coordinatesOf(restored.graphic.base as Feature)).toEqual(zone1);
        const [saved] = toSnapshot([restored.graphic.base as Feature<LineString>]).features;
        expect(coordinatesOf(saved)).toHaveLength(zone1.length * 2);
    });

    it('draws the same symbol from a filed base as from zone 1 alone', () => {
        const fromZone1 = renderTacticalGraphic(base(zone1))!;
        const fromFiled = renderTacticalGraphic(base(filedStrikeBase(zone1, width)))!;
        expect(fromFiled.graphic.geometry).toEqual(fromZone1.graphic.geometry);
        expect(fromFiled.handles.geometry).toEqual(fromZone1.handles.geometry);
    });
});

describe('the snapshot and the closing edge', () => {
    it('keeps the caller\'s array, which a caller may fill after wrapping it', () => {
        const list: Feature<LineString>[] = [];
        const snapshot = toSnapshot(list);
        list.push(base(zone1));
        expect(snapshot.features).toBe(list);
        expect(snapshot.features).toHaveLength(1);
    });
});
