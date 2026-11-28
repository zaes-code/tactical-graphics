/**
 * # The first-segment floor exists on both engines, or it exists on neither
 *
 * Three line graphics bake a mark into the geometry near the start of the line and need
 * room for it and for the arrowhead. The floor that guarantees that room lived as two
 * hard-coded literals inside `LineGraphicBase.setBaseFeature` — so MapLibre had none at
 * all, and the same short drag gave a readable symbol on one engine and, on the other, a
 * bow-tie sitting off the end of its own line.
 *
 * That is the shape of defect this repository keeps finding: a symbology fact living in
 * an OpenLayers holder. `minimumFirstSegmentPx` is now the single statement of it, and
 * this is the guard that it stays single — the same test `drawLimitParity` is for the
 * vertex count and `minimumDrawnRadius` is for the drawn radius.
 */

import {readFileSync} from 'fs';
import {join} from 'path';
import {listTacticalGraphicNames, minimumFirstSegmentPx, TacticalGraphicName} from '@zaes/tactical-graphics';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('the minimum first segment', () => {
    it('is stated for exactly the graphics that bake a mark near the start', () => {
        const withFloor = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(n => minimumFirstSegmentPx(n) !== undefined);
        expect(withFloor.sort()).toEqual(
            [TacticalGraphicName.AviationDirectionOfAttack, TacticalGraphicName.Fix, TacticalGraphicName.TacticalFix].sort(),
        );
    });

    it('gives the aviation bow-tie room for itself and the arrowhead', () => {
        // The bow-tie reaches 3 x the 20 px decoration unit; the arrowhead reaches
        // cos(45°) x it back from the tip. 60 + 15 with a margin.
        expect(minimumFirstSegmentPx(TacticalGraphicName.AviationDirectionOfAttack)).toBe(80);
    });

    it('gives both fixes the same floor, since the twin differs only by its letter', () => {
        expect(minimumFirstSegmentPx(TacticalGraphicName.Fix)).toBe(145);
        expect(minimumFirstSegmentPx(TacticalGraphicName.TacticalFix)).toBe(145);
    });

    /**
     * Read out of the sources rather than exercised through them: both engines apply the
     * floor deep inside a gesture — one in an OpenLayers holder reacting to a `change`
     * event, the other in a MapLibre draw handler — and standing either up in jsdom tests
     * the harness more than the rule. What this catches is the thing that actually went
     * wrong: one engine holding a number the other does not.
     */
    it('is read from the shared table by both engines, and hard-coded by neither', () => {
        const openLayers = read('src/components/openlayers/graphics/LineGraphicBase.ts');
        const mapLibre = read('src/components/maplibre/interaction/MapLibreInteractions.ts');

        expect(openLayers).toContain('minimumFirstSegmentPx(');
        expect(mapLibre).toContain('minimumFirstSegmentPx(');

        // The literals these replaced. A number reappearing beside a resolution is the
        // regression: it means an engine started answering for itself again.
        expect(openLayers).not.toMatch(/\b80 \* this\.resolution\b/);
        expect(openLayers).not.toMatch(/\b145 \* this\.resolution\b/);
    });
});
