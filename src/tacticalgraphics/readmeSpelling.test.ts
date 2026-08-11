/**
 * The README is US English. It was cleaned once and then quietly drifted back as later
 * sections were written, so this guards it rather than relying on anyone remembering.
 *
 * Only the prose is checked — the generated graphics tables come from the tracker and
 * carry doctrinal names, which are not ours to respell, and neither code blocks nor
 * inline code spans are prose: an identifier keeps whatever spelling it was declared
 * with.
 */
import {readFileSync} from 'fs';
import {join} from 'path';

const BRITISH = /\b(centre|centres|colour|colours|coloured|metre|metres|kilometre|kilometres|behaviour|labelled|organis(e|ed|ing|ation))\b/gi;

describe('README spelling', () => {
    it('uses US English throughout the prose', () => {
        const md = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
        const prose = md
            .slice(0, md.indexOf('## Supported graphics'))
            // Code is not prose. A fenced block is someone's program and an inline span
            // is usually an identifier — `HeightUnit.Metres` is the name of a thing, and
            // respelling it would make the documentation wrong rather than American.
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]*`/g, '');
        const hits = Array.from(prose.matchAll(BRITISH), m => m[0]);
        expect(hits).toEqual([]);
    });
});
