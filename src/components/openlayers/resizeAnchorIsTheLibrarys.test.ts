/**
 * # A resize scales about the library's anchor, and forgets which one if the name is missing
 *
 * `resizeFeature` reads the graphic's name off the base feature and asks `rotationAnchor` with
 * it. Two of that function's three answers depend on the name — a symbol described by anchor
 * points scales about its frame's centre, one stored tip-first about its rear — so a base
 * feature that has lost its `graphicName` silently gets the plain drawn-line answer instead:
 * the first vertex.
 *
 * Silently is the problem. Nothing throws, the gesture still works, and the graphic simply
 * grows from the wrong end. Measured on 340100 block with a 1.5x resize: with the name it holds
 * `[4, 40]`, which is what the library states, and without it holds `[0, 40]`.
 *
 * So this pins both halves: the anchor is the library's, and the name is what makes it so.
 */

import {fromLonLat, toLonLat} from 'ol/proj';
import LineString from 'ol/geom/LineString';
import {Feature} from 'ol';
import {TacticalGraphicName, baseGeometryFor, listTacticalGraphicNames, rotationAnchor} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {LineGraphicController} from './controllers/LineGraphicController';
import openlayersAdapter from './openlayersAdapter';

const LON_LAT: [number, number][] = [[0, 40], [2, 40.4], [4, 40]];
const RATIO = 1.5;

/** Scales a base the way a grip drag does, and answers the projected points before and after. */
function scaleBase(name: TacticalGraphicName | undefined) {
    const base = new Feature({geometry: new LineString(LON_LAT.map(c => fromLonLat(c)))});
    if (name) base.set('graphicName', name);
    const scaled = openlayersAdapter.resizeFeature(base, RATIO) as Feature<LineString>;
    return {
        before: (base.getGeometry() as LineString).getCoordinates(),
        after: scaled.getGeometry()!.getCoordinates(),
    };
}

/**
 * The point the scale was measured about, recovered from the transform itself.
 *
 * **Not "which vertex stayed put".** Several anchors are interior points — the midpoint of two
 * corners, a frame's centre — so no vertex holds still and a search for one answers nothing,
 * which is what the first version of this did on six graphics. Solving `after = a + r(before −
 * a)` for `a` works whether or not the anchor is a vertex.
 */
function scaledAbout(name: TacticalGraphicName | undefined): number[] {
    const {before, after} = scaleBase(name);
    return [0, 1].map(axis => (after[0][axis] - RATIO * before[0][axis]) / (1 - RATIO));
}

const LINE_NAMES = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(name => {
    if (baseGeometryFor(name) !== 'LineString') return false;
    try {
        return getController(name, 1200) instanceof LineGraphicController;
    } catch {
        return false;
    }
});

describe(`a resize scales about the library's anchor (${LINE_NAMES.length} graphics)`, () => {
    it.each(LINE_NAMES.map(name => [String(name), name] as const))('%s', (_label, name) => {
        const wanted = fromLonLat(rotationAnchor({type: 'LineString', coordinates: LON_LAT}, name) as [number, number]);
        const about = scaledAbout(name);
        // A metre of projected slack, for the round trip the library answer takes.
        expect(Math.hypot(about[0] - wanted[0], about[1] - wanted[1])).toBeLessThan(1);
    });

    /**
     * **And the name is load-bearing.** 340100 block's anchor is its last vertex when the
     * question is asked properly and its first when it is not, so a base feature that lost its
     * `graphicName` would grow the symbol from the opposite end without any error.
     */
    it('falls back to the first vertex when the base carries no name', () => {
        expect(toLonLat(scaledAbout(TacticalGraphicName.Block) as [number, number])[0]).toBeCloseTo(4, 3);
        expect(toLonLat(scaledAbout(undefined) as [number, number])[0]).toBeCloseTo(0, 3);
    });
});
