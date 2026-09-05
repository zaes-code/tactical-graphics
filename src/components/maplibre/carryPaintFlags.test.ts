/**
 * # What survives a rebuild, and what silently does not
 *
 * `buildTacticalGraphic` builds a graphic's paint features from `properties.tacticalGraphic`,
 * so **anything not in that bag is gone the moment a graphic is rebuilt** — and MapLibre
 * rebuilds on a zoom (`rebuildScreenSized`) and on an amplifier edit
 * (`featurePropertiesSource.apply`).
 *
 * Two fields live on the paint features rather than in the bag, and only one of them was
 * being carried. `drawingResolution` had a helper of its own and a paragraph explaining that
 * forgetting it is silent; `hideAmplifiers` had neither, so the "name only" toggle hid the
 * labels and the next rebuild put them straight back — *"briefly hide the labels but then
 * they reappear"* (user, 2026-09-04).
 *
 * The fix is one function for the class rather than a second special case, and this is the
 * test for the class: a third such flag added to a paint feature and not to `carryPaintFlags`
 * is the same defect a third time.
 */
import {TacticalGraphicName} from '@zaes/tactical-graphics';
import {carryPaintFlags, withDrawingResolution, type MapLibreTacticalGraphic} from './maplibreAdapter';

/** A graphic record of the shape the renderer holds, with only the fields under test set. */
const record = (over: Partial<MapLibreTacticalGraphic['graphic']> = {},
                labels: Partial<MapLibreTacticalGraphic['graphic']> | null = {}): MapLibreTacticalGraphic => ({
    id: 'mlb-1',
    name: TacticalGraphicName.LaunchAreaEllipse,
    base: {type: 'Feature', geometry: {type: 'Point', coordinates: [0, 0]}, properties: {}},
    properties: {name: TacticalGraphicName.LaunchAreaEllipse},
    graphic: {geometry: {type: 'Point', coordinates: [0, 0]}, properties: {}, ...over},
    labels: labels === null ? undefined : {geometry: {type: 'Point', coordinates: [0, 0]}, properties: {}, ...labels},
} as unknown as MapLibreTacticalGraphic);

describe('the paint-feature flags a rebuild has to carry', () => {
    it('carries hideAmplifiers onto the rebuilt graphic and its labels', () => {
        const previous = record({hideAmplifiers: true}, {hideAmplifiers: true});
        const carried = carryPaintFlags(previous, record());
        expect(carried.graphic.hideAmplifiers).toBe(true);
        expect(carried.labels?.hideAmplifiers).toBe(true);
    });

    it('carries the drawing resolution, which is the flag that already had a helper', () => {
        const previous = record({drawingResolution: 42});
        const carried = carryPaintFlags(previous, record({drawingResolution: 9999}));
        // The *previous* anchor wins: a rebuild re-stamps the current resolution, and taking
        // that would move the zoom the label is measured against to "now" every time.
        expect(carried.graphic.drawingResolution).toBe(42);
        expect(carried.labels?.drawingResolution).toBe(42);
    });

    it('leaves a graphic that was never hidden alone', () => {
        const carried = carryPaintFlags(record(), record());
        expect(carried.graphic.hideAmplifiers).toBeUndefined();
        expect(carried.labels?.hideAmplifiers).toBeUndefined();
    });

    it('survives a graphic with no labels feature at all', () => {
        // Plenty of graphics letter nothing, so `labels` is undefined and the carry must not
        // conjure one — an empty label feature paints an empty text mark.
        const carried = carryPaintFlags(record({hideAmplifiers: true}, null), record({}, null));
        expect(carried.labels).toBeUndefined();
        expect(carried.graphic.hideAmplifiers).toBe(true);
    });

    it('keeps the rebuilt geometry, and only the flags come from the old one', () => {
        // The whole point of a rebuild is the new geometry; a carry that brought the old
        // shape across would freeze the symbol at the zoom it was drawn.
        const rebuilt = record();
        rebuilt.graphic.geometry = {type: 'Point', coordinates: [7, 7]} as never;
        const carried = carryPaintFlags(record({hideAmplifiers: true}), rebuilt);
        expect((carried.graphic.geometry as {coordinates: number[]}).coordinates).toEqual([7, 7]);
    });

    it('is a superset of withDrawingResolution, so the older helper cannot drift from it', () => {
        const previous = record({drawingResolution: 42, hideAmplifiers: true}, {drawingResolution: 42});
        const viaOld = withDrawingResolution(record(), previous.graphic.drawingResolution);
        const viaNew = carryPaintFlags(previous, record());
        expect(viaNew.graphic.drawingResolution).toBe(viaOld.graphic.drawingResolution);
        expect(viaNew.labels?.drawingResolution).toBe(viaOld.labels?.drawingResolution);
    });
});
