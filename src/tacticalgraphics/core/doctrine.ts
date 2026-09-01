/**
 * # Doctrinal completeness
 *
 * Whether a graphic carries the amplifiers its publication says it must, and — where the
 * publication constrains the *value* rather than merely requiring one — whether that value
 * is of the right shape.
 *
 * This is a different question from the two the codebase already answers. `GRAPHIC_FIELDS`
 * says which inputs a graphic *offers*; the paint functions say which it *draws*. Neither
 * says whether a particular filled-in graphic is doctrinally complete, which is what a user
 * about to publish an overlay actually wants to know.
 *
 * ## Sparse on purpose
 *
 * Unlike `GRAPHIC_CATEGORIES`, `GRAPHIC_SPECIFICATIONS` and the rest, this is **not** an
 * exhaustive `Record<TacticalGraphicName, …>`. Almost every symbol in the standard has no
 * mandatory amplifier at all — a phase line with no name is a legal phase line — so an
 * exhaustive table would be 290 empty arrays maintained forever to say nothing. A graphic
 * absent from `DOCTRINAL_RULES` has no requirements, and {@link validateTacticalGraphic}
 * reports it complete.
 *
 * That also means adding a graphic here is a deliberate act with a citation attached,
 * rather than a compiler error someone fills in with a guess.
 *
 * ## Where the rules come from
 *
 * Every entry cites the APP-06 Chapter 8 row it was read from. These are stated in the
 * plate's prose — the Template's boxes say a field *exists*, and only the Draw Rules or the
 * row's Note say it is required — which is why none of them were enforced anywhere before:
 * nothing in the extractable text names them. @see docs/app6-field-validation.md
 */

import {TacticalGraphicEchelon, TacticalGraphicName} from './type';
import type {TacticalGraphicProperties} from './render';

/** Why a graphic is not doctrinally complete. */
export enum DoctrinalIssueKind {
    /** The publication requires this amplifier and it is empty. */
    missing = 'missing',
    /** The amplifier is filled in, but not with a value the publication allows. */
    format = 'format',
}

/** One thing wrong with a graphic, in terms a user can act on. */
export interface DoctrinalIssue {
    /** The property at fault, as named in {@link TacticalGraphicProperties}. */
    field: keyof TacticalGraphicProperties;
    /** The publication's own letter for it — `B`, `H` — for cross-referencing a plate. */
    amplifier: string;
    kind: DoctrinalIssueKind;
    /** What is wrong, phrased for display next to the field. */
    message: string;
    /** The row this was read from, e.g. `"APP-06 142100"`. */
    source: string;
}

export interface DoctrinalValidation {
    /** True when nothing is missing or malformed. Always true for an unruled graphic. */
    complete: boolean;
    issues: readonly DoctrinalIssue[];
}

interface DoctrinalRule {
    field: keyof TacticalGraphicProperties;
    amplifier: string;
    source: string;
    /** Absent or empty fails with {@link DoctrinalIssueKind.missing} and this message. */
    requiredBecause?: string;
    /** Runs only when a value is present; a returned string is the format complaint. */
    check?: (value: unknown) => string | undefined;
}

/**
 * An echelon is "set" only if it is a real one.
 *
 * `unknown` is the enum's own placeholder and what an unstamped feature reads as, so
 * treating it as a value would let the mobility corridor pass while displaying the very
 * glyph the plate calls mandatory.
 */
function echelonMissing(value: unknown): boolean {
    return value === undefined || value === null || value === TacticalGraphicEchelon.unknown;
}

/** The scatterable-mine marks APP-06 allows in field H, and nothing else. */
const SCATTERABLE_MINE_MARKS = ['S', '+S'];

const MINE_FIELD_H_RULE = (source: string): DoctrinalRule => ({
    field: 'additionalInfo',
    amplifier: 'H',
    source,
    check: value => {
        const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
        if (!text || SCATTERABLE_MINE_MARKS.includes(text)) return undefined;
        return `Field H carries "S" for scatterable mines only, or "+S" for a mix of scatterable and other mines.`;
    },
});

const RESTRICTED_TERRAIN_RULE = (source: string): DoctrinalRule => ({
    field: 'additionalInfo',
    amplifier: 'H',
    source,
    requiredBecause: 'Field H must be displayed and contain the cause of the restriction.',
});

/**
 * The graphics whose publication requires something of them. @see DOCTRINAL_RULES sparsity
 * note at the top of this file.
 */
const DOCTRINAL_RULES: Partial<Record<TacticalGraphicName, readonly DoctrinalRule[]>> = {
    [TacticalGraphicName.MobilityCorridor]: [
        {
            field: 'echelon',
            amplifier: 'B',
            source: 'APP-06 142100',
            requiredBecause:
                'Field B is mandatory to articulate the size of force that could exploit the mobility corridor.',
        },
    ],
    [TacticalGraphicName.RestrictedTerrain]: [RESTRICTED_TERRAIN_RULE('APP-06 152400')],
    [TacticalGraphicName.SeverelyRestrictedTerrain]: [RESTRICTED_TERRAIN_RULE('APP-06 152500')],
    [TacticalGraphicName.MinedAreaFenced]: [MINE_FIELD_H_RULE('APP-06 270801')],
    [TacticalGraphicName.MinefieldDynamicDepiction]: [MINE_FIELD_H_RULE('APP-06 270707')],
};

/** The rules for one graphic; empty for the great majority, which have none. */
export function getDoctrinalRequirements(name: TacticalGraphicName): readonly DoctrinalRule[] {
    return DOCTRINAL_RULES[name] ?? [];
}

/** Whether any publication constrains this graphic at all. */
export function hasDoctrinalRequirements(name: TacticalGraphicName): boolean {
    return getDoctrinalRequirements(name).length > 0;
}

/**
 * What is missing or malformed before this graphic is doctrinally complete.
 *
 * Takes the properties rather than a feature so a host can call it against a dialog's
 * pending edits, before anything is committed to the map.
 */
export function validateTacticalGraphic(
    name: TacticalGraphicName,
    properties: Partial<TacticalGraphicProperties> = {},
): DoctrinalValidation {
    const issues: DoctrinalIssue[] = [];

    for (const rule of getDoctrinalRequirements(name)) {
        const value = properties[rule.field];
        const empty = rule.field === 'echelon' ? echelonMissing(value) : value === undefined || value === null || String(value).trim() === '';

        if (empty) {
            if (rule.requiredBecause) {
                issues.push({
                    field: rule.field,
                    amplifier: rule.amplifier,
                    kind: DoctrinalIssueKind.missing,
                    message: rule.requiredBecause,
                    source: rule.source,
                });
            }
            // A `check` describes a value's shape and has nothing to say about its absence.
            continue;
        }

        const complaint = rule.check?.(value);
        if (complaint) {
            issues.push({
                field: rule.field,
                amplifier: rule.amplifier,
                kind: DoctrinalIssueKind.format,
                message: complaint,
                source: rule.source,
            });
        }
    }

    return {complete: issues.length === 0, issues};
}

/** Whether the graphic is doctrinally complete — {@link validateTacticalGraphic} without the detail. */
export function isTacticalGraphicComplete(
    name: TacticalGraphicName,
    properties: Partial<TacticalGraphicProperties> = {},
): boolean {
    return validateTacticalGraphic(name, properties).complete;
}
