import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import {fromLonLat} from 'ol/proj';
import {getDistance} from 'ol/sphere';
import {TacticalGraphicName, isRectangular} from '@zaes/tactical-graphics';
import {getController} from './controllerRegistry';
import {getGraphicFields} from './graphicFieldRegistry';
import {readGraphicLabels} from './graphicProperties';

/**
 * The rectangular zones' width amplifier.
 *
 * FM 1-02.2 table 5-24 draws these with an `AM` arrow down the edge labelled
 * "Width (M)", and APP-06 states it in words: "two anchor points **and a width,
 * defined in metres**". The width was pure geometry here — a saved zone carried no
 * figure a NATO consumer could read back, and none could be typed in.
 *
 * The rendered rectangle was always right, which is why nothing caught this: it is a
 * missing *input*, not a wrong picture. @see ai/app-6.md, "F2"
 */

const RESOLUTION = 20;

/**
 * The 13 rectangular *zones*, taken from the library rather than restated here.
 *
 * `TargetAreaRectangular` is excluded although it is also `isRectangular`: APP-06
 * 240802 builds it from **one** anchor point at the centre plus *two* amplifiers —
 * "the target length (AM1) in metres and target width (AM) in metres" — so it is a
 * different construction, not a zone with a width. Giving it the width half alone
 * would read as conformance while being neither model. Left as found and recorded.
 */
const RECTANGULAR = (Object.values(TacticalGraphicName) as TacticalGraphicName[])
    .filter(isRectangular)
    .filter(name => name !== TacticalGraphicName.TargetAreaRectangular);

/** A box roughly 20 km east-west by 10 km north-south, near 51°N. */
const box = (halfWidthDeg = 0.07) => {
    const ring = [
        fromLonLat([-0.14, 51.5 - halfWidthDeg]),
        fromLonLat([0.14, 51.5 - halfWidthDeg]),
        fromLonLat([0.14, 51.5 + halfWidthDeg]),
        fromLonLat([-0.14, 51.5 + halfWidthDeg]),
        fromLonLat([-0.14, 51.5 - halfWidthDeg]),
    ];
    return new Feature({geometry: new Polygon([ring])});
};

const holderFor = (name: TacticalGraphicName) => {
    const controller: any = getController(name, RESOLUTION);
    controller.setBaseFeature(box());
    return controller;
};

/** Ground width of the holder's base rectangle, measured the way a user would. */
const groundWidth = (controller: any): number => {
    const [minX, minY, maxX, maxY] = controller.graphic.base.getGeometry().getExtent();
    const midX = (minX + maxX) / 2;
    const {toLonLat} = require('ol/proj');
    return getDistance(toLonLat([midX, minY]), toLonLat([midX, maxY]));
};

describe('rectangular zones carry their width in meters', () => {
    it('covers all thirteen rectangular zones', () => {
        expect(RECTANGULAR).toHaveLength(13);
    });

    it.each(RECTANGULAR)('%s offers a width field in the dialog', name => {
        expect(getGraphicFields(name).width).toBe(true);
    });

    it.each(RECTANGULAR)('%s writes the drawn width into the amplifier bag', name => {
        const controller = holderFor(name);
        const stamped = readGraphicLabels(controller.graphic.graphic).width;
        expect(stamped).toBeGreaterThan(0);
        // Ground meters, not projected: at 51° the projected value is ~1.6x larger, so a
        // zone drawn 15 km across would be filed as 24 km.
        expect(stamped).toBeCloseTo(groundWidth(controller), -2);
    });

    it.each(RECTANGULAR)('%s restretches when a width is typed in', name => {
        const controller = holderFor(name);
        const before = groundWidth(controller);
        const target = Math.round(before * 2);

        controller.graphic.setLabel({...controller.graphic.graphicLabels, width: target});

        expect(groundWidth(controller)).toBeCloseTo(target, -2);
        // ...and the east-west extent is untouched: width is the across-dimension only.
        const [minX, , maxX] = controller.graphic.base.getGeometry().getExtent();
        const [bMinX, , bMaxX] = box().getGeometry()!.getExtent();
        expect(maxX - minX).toBeCloseTo(bMaxX - bMinX, 0);
    });

    it.each(RECTANGULAR)('%s does not restretch when its own value is re-stamped', name => {
        const controller = holderFor(name);
        const before = groundWidth(controller);
        const stamped = readGraphicLabels(controller.graphic.graphic).width;

        // Exactly what the dialog sends back when the user edits some *other* field.
        controller.graphic.setLabel({...controller.graphic.graphicLabels, width: stamped});

        expect(groundWidth(controller)).toBeCloseTo(before, -1);
    });

    it('ignores a width that is not a usable number', () => {
        const controller = holderFor(TacticalGraphicName.FreeFireAreaRectangular);
        const before = groundWidth(controller);
        for (const bad of [0, -500, NaN]) {
            controller.graphic.setLabel({...controller.graphic.graphicLabels, width: bad as number});
        }
        expect(groundWidth(controller)).toBeCloseTo(before, -1);
    });
});
