/**
 * The two layering rules, checked.
 *
 * 1. **The published library never imports a renderer or a map library.** That boundary is
 *    what keeps the geometry portable, and it is the reason the package splits into four
 *    entry points at all.
 * 2. **The sample app reaches the library through its published entry point**, so it
 *    exercises exactly the surface a consumer gets. A deep import means something is
 *    missing from `src/tacticalgraphics/index.ts` — export it rather than reaching around.
 *
 * ## Why this exists as a script
 *
 * Both rules lived only as inline `grep` steps in `.github/workflows/ci.yml`, which made
 * them unrunnable locally: `npm run typecheck` and `npm test` both pass with a deep import
 * in place, because the path resolves perfectly well and neither TypeScript nor Vitest has
 * an opinion about it. Only the grep sees it, and a grep inside a YAML step does not run
 * unless somebody copies it out by hand.
 *
 * Two deep imports reached the trunk on 2026-09-07 for exactly that reason, hours apart,
 * each caught by CI after the merge rather than before the push. The workflow now calls
 * this script instead of carrying its own copy of the patterns, so there is one statement
 * of each rule rather than two that can drift.
 *
 * `--json` prints machine-readable findings; the exit code is 1 on any violation.
 */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, sep} from 'node:path';

const ROOT = process.cwd();

/**
 * The rules, stated once.
 *
 * `exemptTests` differs between them and the asymmetry is deliberate. A test inside the
 * library may import a renderer to compare the two — that is what the parity suites do —
 * while a test under `src/components` reaching past the barrel is the same mistake as
 * production code doing it, because it then stops exercising the consumer's surface.
 */
const RULES = [
    {
        name: 'Library stays map-agnostic',
        roots: ['src/tacticalgraphics'],
        extensions: ['.ts'],
        exemptTests: true,
        // Only module specifiers in import/export statements. An earlier version matched
        // the bare word "components/" and tripped on a comment.
        pattern: /from ['"](ol($|[/'"])|[^'"]*components\/)/,
        failure: 'src/tacticalgraphics must not import OpenLayers or the sample app',
    },
    {
        name: 'Sample app imports the library via its public entry point',
        roots: ['src/components', 'src/utils'],
        extensions: ['.ts', '.tsx'],
        exemptTests: false,
        pattern: /from ['"][^'"]*tacticalgraphics\//,
        failure: "Import from '@zaes/tactical-graphics', not a deep path into src/tacticalgraphics/",
    },
];

function* walk(dir) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return; // a root that does not exist is not a violation
    }
    for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) yield* walk(full);
        else yield full;
    }
}

const findings = [];
for (const rule of RULES) {
    for (const root of rule.roots) {
        for (const file of walk(join(ROOT, root))) {
            if (!rule.extensions.some(ext => file.endsWith(ext))) continue;
            if (rule.exemptTests && file.endsWith('.test.ts')) continue;
            const lines = readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, i) => {
                if (rule.pattern.test(line)) {
                    findings.push({
                        rule: rule.name,
                        failure: rule.failure,
                        file: relative(ROOT, file).split(sep).join('/'),
                        line: i + 1,
                        text: line.trim(),
                    });
                }
            });
        }
    }
}

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(findings, null, 1));
} else if (findings.length === 0) {
    for (const rule of RULES) console.log(`OK — ${rule.name}`);
} else {
    for (const f of findings) {
        // GitHub Actions renders this as an annotation on the offending line.
        console.log(`::error file=${f.file},line=${f.line}::${f.failure}`);
        console.log(`  ${f.file}:${f.line}  ${f.text}`);
    }
    console.log(`\n${findings.length} layering violation(s).`);
}

process.exit(findings.length === 0 ? 0 : 1);
