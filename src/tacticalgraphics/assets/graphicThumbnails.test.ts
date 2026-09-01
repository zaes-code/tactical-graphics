import {isPaintable} from '../symbology/registry';
import {listTacticalGraphicNames} from '../core/render';
import {TacticalGraphicName} from '../core/type';

import {getGraphicThumbnailSvg, getGraphicThumbnailUrl, GRAPHIC_THUMBNAIL_SVGS} from './graphicThumbnails';

/**
 * The thumbnails are generated (`npm run gen:thumbnails`), so this suite does not
 * re-derive them — `scripts/gen-catalog-svgs.js --check` is what catches a stale file.
 *
 * What it pins is the contract a picker depends on: every graphic it can offer has a
 * picture, no picture is empty or malformed, and the three rules the profile exists to
 * enforce actually reached the output. A generator that silently stopped filtering text
 * would still produce 293 valid SVGs, and nothing else here would notice.
 */
describe('graphic thumbnails', () => {
    const paintable = (listTacticalGraphicNames() as TacticalGraphicName[]).filter(isPaintable);

    it('covers every paintable graphic', () => {
        const missing = paintable.filter(name => !getGraphicThumbnailSvg(name));
        expect(missing).toEqual([]);
    });

    it('offers nothing a picker cannot draw', () => {
        // The reverse direction. A name that left the enum but stayed in the generated
        // file would be an option that draws a symbol and then fails to place it.
        const orphans = Object.keys(GRAPHIC_THUMBNAIL_SVGS).filter(name => !paintable.includes(name as TacticalGraphicName));
        expect(orphans).toEqual([]);
    });

    it('emits well-formed, self-contained SVG', () => {
        for (const name of paintable) {
            const svg = getGraphicThumbnailSvg(name) as string;
            expect(svg.startsWith('<svg ')).toBe(true);
            expect(svg.endsWith('</svg>')).toBe(true);
            expect(svg).toContain('viewBox="0 0 ');
            // No external reference of any kind: these are inlined into a `data:` URI,
            // where a relative href resolves against nothing and silently draws blank.
            expect(svg).not.toMatch(/xlink:href|<image|<use\s/);
        }
    });

    it('builds a data URI that round-trips', () => {
        const url = getGraphicThumbnailUrl(TacticalGraphicName.AssemblyArea) as string;
        expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
        expect(decodeURIComponent(url.slice('data:image/svg+xml;charset=utf-8,'.length))).toBe(
            getGraphicThumbnailSvg(TacticalGraphicName.AssemblyArea),
        );
    });

    it('caches the data URI rather than re-encoding it', () => {
        const first = getGraphicThumbnailUrl(TacticalGraphicName.PhaseLine);
        expect(getGraphicThumbnailUrl(TacticalGraphicName.PhaseLine)).toBe(first);
    });

    it('answers for a name it does not carry', () => {
        expect(getGraphicThumbnailSvg('NotAGraphic')).toBeUndefined();
        expect(getGraphicThumbnailUrl('NotAGraphic')).toBeUndefined();
    });

    /**
     * The three profile rules. @see scripts/gen-catalog-svgs.js, PROFILE
     *
     * Every one of them is asserted against the AMPLIFIER values the generator fills in —
     * `ALPHA` for the designation, `ZJUN26` for the date-time pair, `USA` for the country
     * code — and never against "is there any text", which is the wrong question. A phase
     * line still draws `PL` with every field emptied, because that abbreviation is part of
     * the paint rather than a field the user typed. @see the next test for why that
     * distinction is the one worth pinning.
     */
    const amplifierText = (name: TacticalGraphicName) => {
        const svg = getGraphicThumbnailSvg(name) as string;
        return ['ALPHA', 'BRAVO', 'ZJUN26', 'USA', 'CAN', '18SUJ2345'].filter(v => svg.includes(v));
    };

    it('fills in no amplifier field on line graphics', () => {
        // Rectangular zones are drawn from an axis, so their base is a LineString while
        // the symbol is an area — they keep their amplifiers and are not in this set.
        // @see kindOf in the generator.
        const lines: TacticalGraphicName[] = [
            TacticalGraphicName.PhaseLine,
            TacticalGraphicName.LineOfDeparture,
            TacticalGraphicName.FireSupportCoordinationLine,
            TacticalGraphicName.Boundary,
            TacticalGraphicName.MainSupplyRoute,
            TacticalGraphicName.Abatis,
        ];
        for (const name of lines) expect([name, amplifierText(name)]).toEqual([name, []]);
    });

    /**
     * **Emptying the fields must not empty the symbol.**
     *
     * Roughly forty line graphics are, as line work, the same plain stroke; what separates
     * a phase line from a line of departure from a fire support coordination line is the
     * abbreviation at each end. Those come from the paint layer, not from `designation`, so
     * the line rule leaves them — and if a future change ever routes them through an
     * amplifier, this catches it, because the picker would collapse into forty identical
     * horizontal lines and every one of the other tests here would still pass.
     */
    it('keeps the doctrinal abbreviation that identifies a line', () => {
        expect(getGraphicThumbnailSvg(TacticalGraphicName.PhaseLine)).toContain('>PL<');
        expect(getGraphicThumbnailSvg(TacticalGraphicName.LineOfDeparture)).toContain('>LD<');
        expect(getGraphicThumbnailSvg(TacticalGraphicName.FireSupportCoordinationLine)).toContain('>FSCL<');
    });

    it('draws at most the designation on point graphics', () => {
        // The designation survives and nothing else does — the DTG pair, the country
        // codes and the grid are the fields the point rule drops.
        expect(amplifierText(TacticalGraphicName.TargetAreaCircular)).toEqual(['ALPHA']);
        expect(getGraphicThumbnailSvg(TacticalGraphicName.TargetAreaCircular)).toContain('>ALPHA<');
    });

    it('keeps the amplifier stack on areas', () => {
        // The one kind that keeps its text: an area has the room, and the stack is inset
        // off the boundary rather than dropped. @see labelInsetViolation in the generator.
        expect(amplifierText(TacticalGraphicName.AssemblyArea)).toEqual(expect.arrayContaining(['ALPHA', 'ZJUN26']));
    });

    /**
     * The bean. A traced area must not arrive as the four-corner box the catalog uses —
     * that is the shape the seventeen genuinely rectangular zones own, and the picker's
     * whole job is telling them apart.
     */
    it('draws free-form areas as a curve, not a box', () => {
        const svg = getGraphicThumbnailSvg(TacticalGraphicName.AssemblyArea) as string;
        const outline = /<path d="(M[^"]*Z)"/.exec(svg);
        expect(outline).not.toBeNull();
        expect((outline as RegExpExecArray)[1].match(/L/g)?.length).toBeGreaterThan(20);
    });

    it('leaves a rectangular zone rectangular', () => {
        const svg = getGraphicThumbnailSvg(TacticalGraphicName.NoFireAreaRectangular) as string;
        const outline = /<path d="(M[^"]*Z)"/.exec(svg);
        expect(outline).not.toBeNull();
        expect((outline as RegExpExecArray)[1].match(/L/g)?.length).toBeLessThanOrEqual(4);
    });
});
