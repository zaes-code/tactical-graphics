/**
 * # Name only: hiding a graphic's amplifiers without hiding the graphic
 *
 * A planning map carries a lot of graphics, and most of what an operator types on one is
 * reference detail rather than something to read at a glance. `hideAmplifiers` draws the
 * symbol and its designation and drops the rest.
 *
 * **The line this file exists to hold** is between the two kinds of text a graphic draws.
 * A cover's `C`, a mission task's letter, a `PL` prefix and a corridor's `ACP 2` are the
 * *symbol* — hide those and the reader is looking at a different graphic. A date, an
 * altitude, a width, field H and a corridor's information block are annotations on it.
 * `TextKind` is where a paint says which it is, and an unclassified mark counts as
 * doctrinal: a stray date is noise, a missing letter is wrong.
 *
 * The consumer request behind it came from the Spearhead UI side, which had been filtering
 * our styles by text alignment to drop the corridor block — a workaround that broke the
 * moment the block moved. (User's call, 2026-08-29.)
 */

import {getPaintFunction} from './registry';
import {withHiddenAmplifiers} from './paintFunctions';
import {TacticalGraphicName} from '../core/type';
import {resetTacticalGraphicsConfig} from '../core/config';
import type {Paint, PaintContext, PaintFeature, ProjectedPosition} from '../core/paint';

const context: PaintContext = {
    resolution: 40,
    measureText: (text, font) => text.length * parseFloat(/([0-9.]+)px/.exec(font)?.[1] ?? '16') * 0.6,
};

const LEG: ProjectedPosition[] = [[0, 0], [40_000, 0], [80_000, 0]];

/**
 * Every string a graphic draws, with the toggle either way.
 *
 * `hideAmplifiers` is a field on the **feature**, not in its properties: it is a view input
 * the host supplies at render time, the way `graphicSize` is, and never part of the
 * portable description. @see PaintFeature.hideAmplifiers
 */
function textsFor(name: TacticalGraphicName, {hideAmplifiers, ...properties}: Record<string, unknown>): string[] {
    const painters = getPaintFunction(name);
    if (!painters) return [];
    const feature = {
        geometry: {type: 'MultiPoint', coordinates: LEG},
        properties: {name, ...properties},
        graphicSize: 8_000,
        hideAmplifiers: hideAmplifiers as boolean | undefined,
    } as unknown as PaintFeature;

    const drawn: Paint[] = [
        ...(painters.graphic?.(feature, context) ?? []),
        ...(painters.label?.(feature, context) ?? []),
    ];
    return withHiddenAmplifiers(drawn, feature.hideAmplifiers)
        .map(paint => paint.text?.text)
        .filter((text): text is string => typeof text === 'string');
}

beforeEach(() => resetTacticalGraphicsConfig());

describe('a corridor showing its name only', () => {
    const amplifiers = {
        designation: 'ALPHA',
        width: 4000,
        minAltitude: 1500,
        maxAltitude: 9000,
        startDate: '011200ZJUL',
    };

    it('drops the information block, including the NAME line inside it', () => {
        const shown = textsFor(TacticalGraphicName.AirCorridor, amplifiers);
        const hidden = textsFor(TacticalGraphicName.AirCorridor, {...amplifiers, hideAmplifiers: true});

        expect(shown.some(text => text.includes('WIDTH:'))).toBe(true);
        expect(shown.some(text => text.includes('MIN ALT:'))).toBe(true);
        // The block carries its own `NAME:` line, and the whole block goes: the corridor
        // already draws its designation along each leg, so nothing is lost.
        expect(hidden.some(text => text.includes('NAME:'))).toBe(false);
        expect(hidden.some(text => text.includes('WIDTH:') || text.includes('ALT:'))).toBe(false);
    });

    it('keeps the designation on the legs and the ACP markers', () => {
        const hidden = textsFor(TacticalGraphicName.AirCorridor, {...amplifiers, hideAmplifiers: true});
        expect(hidden.some(text => text.includes('ALPHA'))).toBe(true);
        expect(hidden.some(text => /^ACP \d+$/.test(text))).toBe(true);
    });
});

describe('withHiddenAmplifiers', () => {
    const mark = (text: string, kind?: 'doctrinal' | 'designation' | 'amplifier'): Paint => ({
        geometry: {type: 'Point', coordinates: [0, 0]},
        text: {text, kind, font: 'bold 16px sans-serif', fill: '#000'},
    });

    it('changes nothing when the graphic is not hiding anything', () => {
        const paints = [mark('C'), mark('011200ZJUL', 'amplifier')];
        expect(withHiddenAmplifiers(paints, false)).toHaveLength(2);
    });

    it('drops amplifier text and keeps everything else', () => {
        const paints = [mark('C'), mark('TF RAIDER', 'designation'), mark('011200ZJUL', 'amplifier')];
        const kept = withHiddenAmplifiers(paints, true).map(p => p.text!.text);
        expect(kept).toEqual(['C', 'TF RAIDER']);
    });

    it('keeps a mark that never said what it was', () => {
        // The safe direction: an unclassified mark is more likely to be part of the symbol
        // than an annotation, and drawing one too many beats drawing a different symbol.
        const kept = withHiddenAmplifiers([mark('ACP 2')], true);
        expect(kept).toHaveLength(1);
    });

    it('leaves marks that carry no text at all', () => {
        const line: Paint = {geometry: {type: 'LineString', coordinates: LEG}, stroke: {color: '#000', widthPx: 2}};
        expect(withHiddenAmplifiers([line], true)).toEqual([line]);
    });
});
