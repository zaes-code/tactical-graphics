import {readFileSync} from 'fs';
import {join} from 'path';
import {GRAPHIC_ENTITY_CODES, getEntityCode, getNameByEntityCode, listEntityCodes, listNamesByEntityCode} from './entityCodes';
import {TacticalGraphicSpecification, getSpecifications, hasSpecification} from './specifications';
import {TacticalGraphicName} from './type';

const names = () => Object.keys(GRAPHIC_ENTITY_CODES) as TacticalGraphicName[];

/**
 * The codes recorded as trailing comments beside each entry in `specifications.ts`.
 *
 * They were the original home of this data -- prose a reviewer could check against
 * Table A-32 -- and they stay there because each also carries the entity name as the
 * standard writes it. Parsing them back out is what stops the two copies drifting:
 * a code corrected in one place and not the other fails here rather than shipping.
 */
const codesFromSpecificationComments = (): Map<string, string> => {
    const source = readFileSync(join(__dirname, 'specifications.ts'), 'utf8');
    const found = new Map<string, string>();
    const pattern = /\[TacticalGraphicName\.(\w+)\]:[^\n]*?\/\/ APP-06 (\d{6})/g;
    let match = pattern.exec(source);
    while (match) {
        found.set(match[1], match[2]);
        match = pattern.exec(source);
    }
    return found;
};

describe('GRAPHIC_ENTITY_CODES', () => {
    it('agrees with every code recorded in specifications.ts', () => {
        const commented = codesFromSpecificationComments();
        // Both directions: a code here with no comment is unsourced, and a commented
        // code missing here is a graphic that became unaddressable by code.
        const fromRecord = new Map(names().filter((n) => GRAPHIC_ENTITY_CODES[n]).map((n) => [String(n), GRAPHIC_ENTITY_CODES[n] as string]));
        expect(Object.fromEntries(fromRecord)).toEqual(Object.fromEntries(commented));
    });

    it('assigns a code to every graphic a coded catalog defines, and none to the rest', () => {
        for (const name of names()) {
            const code = GRAPHIC_ENTITY_CODES[name];
            // FM 1-02.2 publishes no identifiers, so an FM-only graphic has no code to
            // carry. Every other graphic is in APP-06 and therefore has one.
            expect(code === null).toBe(!hasSpecification(name, TacticalGraphicSpecification.APP6));
            if (code !== null) expect(code).toMatch(/^\d{6}$/);
        }
    });

    it('leaves exactly the FM 1-02.2-only graphics uncoded', () => {
        const uncoded = names().filter((n) => GRAPHIC_ENTITY_CODES[n] === null);
        expect(uncoded).toHaveLength(8);
        for (const name of uncoded) {
            expect(getSpecifications(name)).toEqual([TacticalGraphicSpecification.FM1_02_2]);
        }
    });
});

describe('lookup by code', () => {
    it('round-trips every coded graphic', () => {
        for (const name of names()) {
            const code = getEntityCode(name);
            if (code === undefined) continue;
            expect(listNamesByEntityCode(code)).toContain(name);
        }
    });

    it('returns undefined for a graphic the standards do not code', () => {
        expect(getEntityCode(TacticalGraphicName.KillZone)).toBeUndefined();
    });

    it('reports both graphics that share APP-06 141100', () => {
        // "Line of Departure/Line of Contact" is one APP-06 entity that this library
        // draws as two graphics, so the code -> name mapping is not one-to-one. The
        // ambiguity is real and callers have to see it.
        expect(listNamesByEntityCode('141100')).toEqual([TacticalGraphicName.LineOfDepartureOrLineOfContact, TacticalGraphicName.LineOfContact]);
        expect(getNameByEntityCode('141100')).toBeUndefined();
    });

    it('resolves an unambiguous code to its one graphic', () => {
        expect(getNameByEntityCode('140300')).toBe(TacticalGraphicName.PhaseLine);
        expect(getNameByEntityCode(' 140300 ')).toBe(TacticalGraphicName.PhaseLine);
    });

    it('treats an unknown code as a miss, not an error', () => {
        expect(listNamesByEntityCode('999999')).toEqual([]);
        expect(getNameByEntityCode('999999')).toBeUndefined();
    });

    it('lists every code once, sorted', () => {
        const codes = listEntityCodes();
        expect(codes).toEqual([...codes].sort());
        expect(new Set(codes).size).toBe(codes.length);
        // 275 assignments over 274 distinct codes -- 141100 is the one shared pair.
        expect(codes).toHaveLength(274);
    });
});
