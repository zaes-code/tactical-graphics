/**
 * Every field the README documents under `tacticalGraphic` must exist on
 * `TacticalGraphicProperties`, and vice versa.
 *
 * The README has twice advertised a property that had been renamed or removed hours
 * earlier — `corridorWidth` existed for about an hour before being folded into `width`,
 * and the catalog kept listing it. Prose drifts silently; this does not.
 */
import {readFileSync} from 'fs';
import {
    AltitudeDatum,
    RouteDirection,
    TacticalGraphicConfidence,
    TacticalGraphicEchelon,
    TacticalGraphicHostility,
    TacticalGraphicMineType,
    TacticalGraphicMobility,
    TacticalGraphicStatus,
    TacticalGraphicTerrain,
} from './core/type';
import {join} from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Field names declared on the TacticalGraphicProperties interface.
 *
 * Bounded by the interface's own closing brace, not by whatever declaration used to
 * follow it. It was cut at a comment further down the file, and moving `GraphicLabels`
 * in above that comment quietly folded a second interface's fields into "the schema" —
 * which loosens the check below into accepting a README that documents them. A test
 * that reads source has to be anchored to the thing it is reading.
 */
function schemaFields(): Set<string> {
    const src = read('src/tacticalgraphics/core/render.ts');
    const start = src.indexOf('export interface TacticalGraphicProperties');
    const body = src.slice(start, src.indexOf('\n}\n', start));
    return new Set(Array.from(body.matchAll(/^\s{4}(\w+)\??:/gm), m => m[1]));
}

/** Field names in the README's `tacticalGraphic: { ... }` catalog block. */
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

    /**
     * The other direction, which was missing: a field could be added to the schema and
     * never documented, and only the reverse was caught. `secondCountryCode` had sat
     * undocumented — mentioned in a trailing comment on `countryCode`'s line, which
     * reads as documentation and is invisible to a check that parses field names.
     *
     * A field the catalog does not list is a field a consumer cannot discover: there
     * is no per-graphic options type to read, which is the point of the flat bag.
     */
    it('documents every field the schema has', () => {
        const documented = readmeFields();
        const undocumented = Array.from(schemaFields()).filter(f => !documented.has(f));
        expect(undocumented).toEqual([]);
    });
});

/**
 * # The selector table lists exactly what the enums hold
 *
 * The README used to trail off — `hostility` was documented as
 * "Friend | Hostile/Faker | Neutral | Unknown | ..." and `direction`, `mineType`,
 * `mobility` and `terrain` named no values at all. A consumer cannot guess a string
 * enum's members, and a value outside the set is ignored rather than rejected, so an
 * incomplete list shows up as an amplifier that silently does not draw.
 *
 * The table is now complete, and this is what stops it drifting: every member of every
 * documented enum must appear in that enum's row, and the row may not invent values the
 * enum does not have.
 */
describe('the README documents the enums that exist', () => {
    const ENUMS: ReadonlyArray<readonly [string, Record<string, string>]> = [
        ['TacticalGraphicHostility', TacticalGraphicHostility],
        ['TacticalGraphicStatus', TacticalGraphicStatus],
        ['TacticalGraphicConfidence', TacticalGraphicConfidence],
        ['TacticalGraphicEchelon', TacticalGraphicEchelon],
        ['RouteDirection', RouteDirection],
        ['TacticalGraphicMineType', TacticalGraphicMineType],
        ['TacticalGraphicMobility', TacticalGraphicMobility],
        ['TacticalGraphicTerrain', TacticalGraphicTerrain],
        ['AltitudeDatum', AltitudeDatum],
    ];

    /** The `Every accepted value` cell of the row naming this enum. */
    function documentedValues(enumName: string): string[] {
        const md = read('README.md');
        const row = md.split('\n').find(line => line.includes(`\`${enumName}\``) && line.startsWith('|'));
        if (!row) return [];
        const cells = row.split('|').map(c => c.trim());
        return cells[cells.length - 2].split('·').map(v => v.trim().replace(/^`|`$/g, '')).filter(Boolean);
    }

    it.each(ENUMS.map(([name]) => name))('%s has a row', name => {
        expect(documentedValues(name).length).toBeGreaterThan(0);
    });

    it.each(ENUMS)('%s lists every value it holds, and no others', (name, members) => {
        expect(documentedValues(name).sort()).toEqual(Object.values(members).sort());
    });
});
