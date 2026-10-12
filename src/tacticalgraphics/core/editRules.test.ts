/**
 * The shared rules both engines edit by, for the multiple-strike zone's closing edge and its older
 * record, and the label rules both engines place area labels by.
 */
import {TacticalGraphicName as N} from './type';
import {hasClosingEdge, nearestInsertionEdge, takesInsertedVertices} from './handles';
import {areaLabelRing, topEdgeLabel} from './symbology';
import {configureTacticalGraphics, resetTacticalGraphicsConfig} from './config';
import {joinedAtSeam} from '../symbology/decorations';

afterEach(() => resetTacticalGraphicsConfig());

describe('inserting a vertex', () => {
    it('refuses only the multiple-strike zone with no width, its older two-ring record', () => {
        expect(takesInsertedVertices(N.MinimumSafeDistanceMultipleStrike, undefined)).toBe(false);
        expect(takesInsertedVertices(N.MinimumSafeDistanceMultipleStrike, 500)).toBe(true);
        expect(takesInsertedVertices(N.PhaseLine, undefined)).toBe(true);
        expect(hasClosingEdge(N.MinimumSafeDistanceMultipleStrike, 500)).toBe(true);
        expect(hasClosingEdge(N.PhaseLine, 500)).toBe(false);
    });

    const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];

    it('finds the nearest edge in reach, as the index the new vertex takes', () => {
        expect(nearestInsertionEdge(square, [50, 3], false, 10)).toEqual({index: 1, at: [50, 0]});
        expect(nearestInsertionEdge(square, [50, 30], false, 10)).toBeUndefined();
    });

    it('offers the closing edge, one past the end, only when asked', () => {
        expect(nearestInsertionEdge(square, [3, 50], false, 10)).toBeUndefined();
        expect(nearestInsertionEdge(square, [3, 50], true, 10)).toEqual({index: 4, at: [0, 50]});
    });
});

describe('joining a ring at its seam', () => {
    const walk = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];

    it('joins the last run to the first where both reach the seam', () => {
        const runs = [[[0, 0], [1, 0], [1, 0.4]], [[1, 0.6], [1, 1], [0, 1], [0, 0]]];
        expect(joinedAtSeam(runs, walk)).toEqual([[[1, 0.6], [1, 1], [0, 1], [0, 0], [1, 0], [1, 0.4]]]);
    });

    it('leaves them apart where a gap runs past the seam', () => {
        const runs = [[[0.2, 0], [1, 0], [1, 0.4]], [[1, 0.6], [1, 1], [0, 1], [0, 0]]];
        expect(joinedAtSeam(runs, walk)).toEqual(runs);
    });
});

describe('where area labels go', () => {
    const traced = [[0, 0], [10, 0], [10, 10], [0, 0]];
    const drawn = [[1, 1], [9, 1], [9, 9], [1, 1]];

    it('reads the traced ring, unless the outline is drawn smooth', () => {
        expect(areaLabelRing(N.AssemblyArea, traced, drawn)).toBe(traced);
        configureTacticalGraphics({smoothLines: true});
        expect(areaLabelRing(N.AssemblyArea, traced, drawn)).toBe(drawn);
        expect(areaLabelRing(N.FreeFireAreaCircular, undefined, drawn)).toBe(drawn);
    });

    it('anchors group or series of targets on the top edge it draws, and nothing else', () => {
        expect(topEdgeLabel(N.GroupOrSeriesOfTargets, drawn)).toEqual({anchor: [9, 5], segment: [[9, 1], [9, 9]]});
        expect(topEdgeLabel(N.AssemblyArea, drawn)).toBeUndefined();
    });
});
