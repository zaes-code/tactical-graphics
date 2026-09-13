/**
 * # A bend is a ratio, so both halves of it have to be in the same frame
 *
 * 340200's `bend` is the curve's depth over the symbol's own size. The cursor arrives in
 * projected metres and `size` is spent on the ground — the tip branch of the same method
 * converts it there, and says so — so dividing one by the other mixed two frames. Mercator
 * metres run 1.31x long at 40 degrees north and 1.74x at 55, which means the same drag bowed
 * a turn harder the further north it was made, and differently from MapLibre, whose `setBend`
 * has divided by the scale factor all along.
 *
 * Measured on the handle sweep at 40 north: the same drag on the apex left the two engines'
 * bend point **2.12 km** apart, the clamp having absorbed most of the rest.
 *
 * @see turnBendFromOffset, editGeometry.setBend, mercator.ts
 */
import {fromLonLat} from 'ol/proj';
import {TacticalGraphicName, turnBendFromOffset} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';

const RES = 1200;
/** Far enough north that the scale factor is not a rounding error. */
const LAT = 55;
const SIZE_M = 60_000;
/** How far off the chord the apex is dragged, in projected metres. */
const OFFSET_M = 30_000;

type Holder = {
    updateGeom(state: {size: number; center: number[]; rotation: number}): void;
    bend?: number;
    centerCoordinate(): number[];
};

function bendAfterDrag(name: TacticalGraphicName): {got: number; onTheGround: number; onTheScreen: number} {
    const controller = getController(name, RES) as unknown as {
        graphic: Holder;
        handleBandResize?: (index: number, coordinate: number[]) => void;
    };
    const centre = fromLonLat([0, LAT]);
    // Chord due east, so the clockwise perpendicular is straight down the screen.
    controller.graphic.updateGeom({size: SIZE_M, center: centre, rotation: 0});

    // The apex handle is index 2 — `[tip, rear, bend]`, which is the plate's order.
    controller.handleBandResize!(2, [centre[0], centre[1] - OFFSET_M]);

    const scale = 1 / Math.cos((LAT * Math.PI) / 180);
    return {
        got: controller.graphic.bend!,
        onTheGround: turnBendFromOffset(OFFSET_M / scale, SIZE_M),
        onTheScreen: turnBendFromOffset(OFFSET_M, SIZE_M),
    };
}

describe('the bend a drag produces is read on the ground', () => {
    it.each([TacticalGraphicName.Turn, TacticalGraphicName.TacticalTurn])('%s', name => {
        const {got, onTheGround, onTheScreen} = bendAfterDrag(name);
        expect(got).toBeCloseTo(onTheGround, 4);
        // And the two answers really are different here, or the assertion above proves nothing.
        expect(Math.abs(onTheGround - onTheScreen)).toBeGreaterThan(0.05);
    });
});
