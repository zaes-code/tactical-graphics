/**
 * Every field the README documents under `tacticalGraphic` must exist on
 * `TacticalGraphicProperties`, and vice versa.
 *
 * The README has twice advertised a property that had been renamed or removed hours
 * earlier — `corridorWidth` existed for about an hour before being folded into `width`,
 * and the catalogue kept listing it. Prose drifts silently; this does not.
 */
import {readFileSync} from 'fs';
import {join} from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Field names declared on the TacticalGraphicProperties interface. */
function schemaFields(): Set<string> {
    const src = read('src/tacticalgraphics/core/render.ts');
    const body = src.slice(
        src.indexOf('export interface TacticalGraphicProperties'),
        src.indexOf('/** Which part of a rendered graphic a feature represents. */'),
    );
    return new Set(Array.from(body.matchAll(/^\s{4}(\w+)\??:/gm), m => m[1]));
}

/** Field names in the README's `tacticalGraphic: { ... }` catalogue block. */
function readmeFields(): Set<string> {
    const md = read('README.md');
    const start = md.indexOf('tacticalGraphic: {\n    // Required');
    const block = md.slice(start, md.indexOf('\n}\n```', start));
    return new Set(Array.from(block.matchAll(/^\s{4}(\w+):/gm), m => m[1]));
}

describe('the README documents the schema that exists', () => {
    it('documents no field the schema does not have', () => {
        const schema = schemaFields();
        const documented = Array.from(readmeFields());
        expect(documented.length).toBeGreaterThan(5);
        expect(documented.filter(f => !schema.has(f))).toEqual([]);
    });

    it('documents every geometry input, which are the ones users get wrong', () => {
        const documented = readmeFields();
        for (const field of ['radius', 'decorationSize', 'width', 'rotation']) {
            expect(documented.has(field)).toBe(true);
        }
    });
});
