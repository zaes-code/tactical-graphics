/**
 * # The size a graphic is drawn at is a library fact, and a rebuild must not change it
 *
 * Two defects met here, and both showed up as "MapLibre draws it bigger".
 *
 * **A stamped decoration outranks the per-name table.** `sizeDefaults` filled
 * `decorationSize` with the generic 20 px offset for every line graphic, and
 * `bakedDecorationSize` prefers a stamped value over `decorationMeters` — so the first
 * rebuild replaced each symbol's own size with 20 px worth. A bridge's ticks went 15 px
 * to 20, Fix's zigzag 14 to 20, and Abatis's chevron *shrank* 26 to 20. Rebuilds are not
 * rare: every zoom change re-derives the screen-sized graphics.
 *
 * **And the block family's size lived in an OpenLayers holder.** `Block.ts` kept a
 * private `DEFAULT_SIZE_PX` of 60, so MapLibre used the generic 20 and drew the same
 * block 40 px tall against OpenLayers' 120.
 *
 * Both are pinned as *stability under rebuild* rather than as pixel counts, because that
 * is the property that failed: build a graphic, feed its own description back in, and the
 * symbol must not move.
 */

import {TacticalGraphicName, decorationMeters, drawnSizeMeters} from '@zaes/tactical-graphics';
import {buildTacticalGraphic} from './maplibreAdapter';

const RES = 2445.98;
const LINE = {type: 'LineString' as const, coordinates: [[0, 0], [6, 0]]};

/** The graphic's own screen size, in pixels at `RES`, as the generator will read it. */
const sizePx = (properties: {radius?: number; decorationSize?: number}): number =>
    Math.round(((properties.radius ?? properties.decorationSize ?? 0) as number) / RES);

describe('the size a drawn graphic is built at', () => {
    it.each([
        [TacticalGraphicName.Bridge, 15],
        [TacticalGraphicName.Gap, 15],
        [TacticalGraphicName.FerryCrossing, 15],
        [TacticalGraphicName.Fix, 14],
        [TacticalGraphicName.Abatis, 26],
        [TacticalGraphicName.PassageLane, 20],
    ])('is %s\'s own decoration size, and stays it through three rebuilds', (name, expected) => {
        let properties: Record<string, unknown> = {};
        for (let build = 0; build < 4; build++) {
            const built = buildTacticalGraphic(name, LINE, properties, RES);
            expect(built).toBeDefined();
            expect(sizePx(built!.properties)).toBe(expected);
            properties = {...built!.properties};
        }
        // The same number OpenLayers derives on every render, which is the point.
        expect(Math.round(decorationMeters(name, RES) / RES)).toBe(expected);
    });

    /**
     * Not a baked decoration — its `size` is the bar across the line — so it comes from
     * the block family's own entry rather than from the generic offset.
     */
    it.each([TacticalGraphicName.Block, TacticalGraphicName.TacticalBlock])(
        'is 60 px for %s, the size the library states',
        name => {
            expect(Math.round(drawnSizeMeters(name, RES)! / RES)).toBe(60);

            let properties: Record<string, unknown> = {};
            for (let build = 0; build < 3; build++) {
                const built = buildTacticalGraphic(name, LINE, properties, RES);
                expect(sizePx(built!.properties)).toBe(60);
                properties = {...built!.properties};
            }
        },
    );

    /** A graphic that states no size of its own still gets the generic offset. */
    it('leaves the ordinary line graphics on the default offset', () => {
        expect(drawnSizeMeters(TacticalGraphicName.PhaseLine, RES)).toBeUndefined();
        const built = buildTacticalGraphic(TacticalGraphicName.MobileDefense, LINE, {}, RES);
        expect(sizePx(built!.properties)).toBe(20);
    });
});
