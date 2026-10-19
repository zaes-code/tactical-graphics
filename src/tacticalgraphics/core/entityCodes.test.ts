import {readFileSync} from 'fs';
import {join} from 'path';
import {GRAPHIC_ENTITY_CODES, getEntityCode, getNameByEntityCode, listEntityCodes, listEntityVariantCodes, listNamesByEntityCode, resolveEntityCode} from './entityCodes';
import {TacticalGraphicSpecification, getSpecifications, hasSpecification} from './specifications';
import {RouteDirection, TacticalGraphicName} from './type';

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
    /*
     * **A commented-out entry is not an entry.** An excluded graphic keeps its line here,
     * commented, so the exclusion is a switch rather than a deletion — see
     * `ai/excluded-graphics.md`. A parser that reads the line anyway then demands a code
     * from a registry the graphic has left, which is a failure about nothing.
     *
     * `^\s*` with the `m` flag is what makes "at the start of the line" the test, so a
     * commented entry is skipped while a live one with its trailing comment still matches.
     */
    const pattern = /^\s*\[TacticalGraphicName\.(\w+)\]:[^\n]*?\/\/ APP-06 (\d{6})/gm;
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
        // Nine when `gap` was untagged from 290600 -- that code is APP-06's "safe lane or
        // gap", a different symbol. **Eight since 2026-09-05**: `FightingPosition` was
        // retired as a duplicate of `FortifiedPosition`, which draws the same bracket and
        // is in both publications. @see ai/excluded-graphics.md, specifications.test.ts
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
        // 310 assignments over 309 distinct codes -- 141100 is the one shared pair. It was
        // 309 over 308 while 271204 was switched off; it is back as the picture 3.4.0
        // shipped, its own construction still unsettled. @see ai/excluded-graphics.md
        expect(codes).toHaveLength(309);
    });
});

describe('supply-route traffic codes', () => {
    // APP-06 Table 8-21 codes each traffic pattern as a subtype of its route; this library
    // draws them as the parent graphic plus the direction amplifier.
    const VARIANTS: [string, TacticalGraphicName, RouteDirection][] = [
        ['330301', TacticalGraphicName.MainSupplyRoute, RouteDirection.oneWay],
        ['330302', TacticalGraphicName.MainSupplyRoute, RouteDirection.twoWay],
        ['330303', TacticalGraphicName.MainSupplyRoute, RouteDirection.alternating],
        ['330401', TacticalGraphicName.AlternateSupplyRoute, RouteDirection.oneWay],
        ['330402', TacticalGraphicName.AlternateSupplyRoute, RouteDirection.twoWay],
        ['330403', TacticalGraphicName.AlternateSupplyRoute, RouteDirection.alternating],
        ['330501', TacticalGraphicName.Route, RouteDirection.oneWay],
        ['330502', TacticalGraphicName.Route, RouteDirection.alternating],
    ];

    it.each(VARIANTS)('resolves %s to its route and direction, and back', (code, name, direction) => {
        expect(resolveEntityCode(code)).toEqual({name, direction});
        expect(getNameByEntityCode(code)).toBe(name);
        expect(listNamesByEntityCode(code)).toEqual([name]);
        expect(getEntityCode(name, {direction})).toBe(code);
    });

    it('keeps the parent code where the standard has no subtype', () => {
        expect(getEntityCode(TacticalGraphicName.MainSupplyRoute)).toBe('330300');
        expect(getEntityCode(TacticalGraphicName.MainSupplyRoute, {direction: RouteDirection.general})).toBe('330300');
        // Table 8-21 gives Route no two-way subtype.
        expect(getEntityCode(TacticalGraphicName.Route, {direction: RouteDirection.twoWay})).toBe('330500');
        // A direction on a graphic that takes none changes nothing.
        expect(getEntityCode(TacticalGraphicName.PhaseLine, {direction: RouteDirection.oneWay})).toBe('140300');
    });

    it('resolves a plain code with no amplifier, and a shared one to nothing', () => {
        expect(resolveEntityCode('330300')).toEqual({name: TacticalGraphicName.MainSupplyRoute});
        expect(resolveEntityCode('141100')).toBeUndefined();
        expect(resolveEntityCode('999999')).toBeUndefined();
    });

    it('lists the variants apart from the graphics own codes', () => {
        expect(listEntityVariantCodes()).toEqual(VARIANTS.map(([code]) => code));
        for (const code of listEntityVariantCodes()) expect(listEntityCodes()).not.toContain(code);
    });
});
