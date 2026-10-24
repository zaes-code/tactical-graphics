/**
 * # An air zone keeps its doctrinal prefix when the block is too small to read
 *
 * The air-coordinating zones (`ROZ` over the name) and the airspace coordination areas
 * (`ACA NAME` on one line) draw one block at one scale, so below the legibility floor all of it
 * would go. The prefix is drawn alone instead, at a size that can be read, until the zone is
 * smaller than about twice it. (User, 2026-10-24.) @see legibleDesignation
 */

import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';
import {AltitudeDatum, TacticalGraphicName} from '../core/type';
import {BASE_FONT_SIZE_PX, MIN_LEGIBLE_TEXT_PX, resetTacticalGraphicsConfig} from '../core/config';
import {airCoordinatingAreaLabelPaint, airspaceCoordinationAreaLabelPaint} from './airPaints';

const context: PaintContext = {
    resolution: 1,
    measureText: (text, font) => text.length * parseFloat(font.match(/(\d*\.?\d+)px/)?.[1] ?? '16') * 0.6,
};

/** A square zone `sidePx` screen pixels across, labelled at its middle, with an altitude set. */
const zone = (name: TacticalGraphicName, sidePx: number): PaintFeature => {
    const h = sidePx / 2;
    return {
        geometry: {type: 'Point', coordinates: [0, 0]},
        properties: {name, designation: 'LONGNAME ALPHA', minAltitude: 500, altitudeDatum: AltitudeDatum.aboveGroundLevel},
        bounds: {minX: -h, minY: -h, maxX: h, maxY: h},
        ring: [
            [-h, -h],
            [h, -h],
            [h, h],
            [-h, h],
            [-h, -h],
        ] as ProjectedPosition[],
    } as PaintFeature;
};

/** The marks that would survive the legibility floor, as `[first line, px]`. */
const legible = (paints: Paint[]): [string, number][] =>
    paints
        .filter(p => p.text?.text)
        .map(p => [p.text!.text.split('\n')[0], BASE_FONT_SIZE_PX * (p.text!.scale ?? 1)] as [string, number])
        .filter(([, px]) => px >= MIN_LEGIBLE_TEXT_PX);

beforeEach(() => resetTacticalGraphicsConfig());

describe.each([
    ['the air-coordinating zones', airCoordinatingAreaLabelPaint, TacticalGraphicName.RestrictedOperationsZone, 'ROZ', 'ROZ'],
    [
        'the airspace coordination areas',
        airspaceCoordinationAreaLabelPaint,
        TacticalGraphicName.AirSpaceCoordinationAreaRectangular,
        'ACA LONGNAME ALPHA',
        'ACA',
    ],
])('%s', (_family, paintOf, name, firstLine, prefix) => {
    it('draws the whole block while it is legible', () => {
        const drawn = legible(paintOf(name)(zone(name, 1200), context));
        expect(drawn.map(([text]) => text)).toEqual([firstLine]);
    });

    it('keeps the prefix alone, at a legible size, once the block would be too small', () => {
        expect(legible(paintOf(name)(zone(name, 60), context))).toEqual([[prefix, MIN_LEGIBLE_TEXT_PX]]);
    });

    it('draws nothing once the zone is smaller than about twice the prefix', () => {
        expect(legible(paintOf(name)(zone(name, 12), context))).toEqual([]);
    });
});
