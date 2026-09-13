/**
 * # Which graphics reshape on a grip is one fact, and both engines read it from one place
 *
 * `reshapesByVertex(name)` says whether dragging a published grip moves that point or scales
 * the whole symbol. It used to be stated only as an `enableVertexDragging(n)` call in the
 * OpenLayers registry, which MapLibre cannot see — and MapLibre reshapes wherever
 * `allowedGestures().modify` is true, 272 graphics against the 81 named here. On the 23 that
 * stretch and do not reshape, the same dot scaled the symbol on one engine and pulled a
 * single point out of it on the other.
 *
 * The controller now asks the library, so the two agree by construction. This suite is what
 * stops the second statement coming back: a factory that calls `enableVertexDragging` for a
 * graphic the table does not name is now a silent no-op, and that is the drift worth
 * catching.
 *
 * @see ai/conventions.md — "A symbology fact never lives in a holder"
 */
import {editStretches, listTacticalGraphicNames, reshapesByVertex, TacticalGraphicName} from '@zaes/tactical-graphics';
import {getController} from './openlayers/controllerRegistry';

const RES = 1200;

/** What the OpenLayers controller will actually do with a grip. */
function openLayersReshapes(name: TacticalGraphicName): boolean | undefined {
    let controller;
    try {
        controller = getController(name, RES) as unknown as {dragsVertices?: boolean; handleVertexDrag?: unknown};
    } catch {
        return undefined;
    }
    return !!controller.dragsVertices;
}

const NAMES = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(n => openLayersReshapes(n) !== undefined);

describe('a grip means the same thing on both engines', () => {
    it('has the whole registry to check', () => {
        expect(NAMES.length).toBeGreaterThan(300);
    });

    it.each(NAMES)('%s', name => {
        expect(openLayersReshapes(name)).toBe(reshapesByVertex(name));
    });

    it('routes on the method the manager looks for, not on the flag alone', () => {
        for (const name of NAMES) {
            const controller = getController(name, RES) as unknown as {handleVertexDrag?: unknown};
            expect(typeof controller.handleVertexDrag === 'function').toBe(reshapesByVertex(name));
        }
    });

    it('leaves a real set on each side of the split', () => {
        const reshaping = NAMES.filter(reshapesByVertex);
        // The 23 the split exists for: they stretch, and a grip scales them.
        const stretchOnly = NAMES.filter(n => editStretches(n) && !reshapesByVertex(n));
        expect(reshaping.length).toBeGreaterThan(70);
        expect(stretchOnly.length).toBeGreaterThan(20);
        // Both halves named, so a change that empties one is visible here.
        expect(reshaping).toContain(TacticalGraphicName.FieldsOfFire);
        expect(reshaping).toContain(TacticalGraphicName.Block);
        expect(stretchOnly).toContain(TacticalGraphicName.BearingLine);
        expect(stretchOnly).toContain(TacticalGraphicName.Turn);
    });
});
