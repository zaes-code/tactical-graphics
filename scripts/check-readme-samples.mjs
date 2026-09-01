/**
 * # Do the README's code samples still compile?
 *
 * Every ```ts / ```tsx fence in `README.md`, checked against the **built** `dist/` types —
 * not against `src/`. What a reader copies is compiled against the published package, and
 * an export that vanished from a barrel passes a source typecheck *and* a grep: the only
 * thing that catches it is asking the built types.
 *
 * Two passes, because the two failures are not the same kind of thing:
 *
 * 1. **Imports.** Every module a sample imports must resolve and every name it imports must
 *    exist. This is the pass that catches rot, and a failure here is always real.
 * 2. **Types.** The whole sample, minus the errors that are an artefact of a documentation
 *    excerpt rather than a defect: a snippet that says `source.addFeature(...)` is showing
 *    you a call, not declaring `source`. So "cannot find name" is ignored and everything
 *    else — a wrong argument type, a property that does not exist on a real type — is not.
 *
 * A third pass checks the **`tacticalGraphic` object**, which no compiler sees: it is a
 * fragment of JSON-shaped prose, and `properties` on a GeoJSON `Feature` is typed
 * `{[name: string]: any}`, so a wrong amplifier value there type-checks whatever it says.
 * Two of them were wrong — `confidence: 'confirmed'` and `echelon: 'battalion'`, neither a
 * member of its enum. Each documented literal is matched against the enum the property's
 * type names.
 *
 * **What it does not check.** A fence with no `import` in it: there is nothing to resolve
 * against `dist/`, and what remains is a fragment whose every identifier the prose supplied.
 * The count is printed so the exclusion is visible rather than assumed.
 *
 *     npm run build && npm run check:readme-samples
 */
import {mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync} from 'fs';
import {tmpdir} from 'os';
import {join, resolve} from 'path';
import {execFileSync} from 'child_process';

const ROOT = resolve(process.argv[2] ?? '.');
const p = (...parts) => join(ROOT, ...parts).replace(/\\/g, '/');

/** Errors a documentation excerpt legitimately produces. @see the header */
const EXCERPT_NOISE = new Set([
    'TS2304', // Cannot find name — context the prose supplies
    'TS2552', // Cannot find name … did you mean
    'TS2300', // Duplicate identifier — two samples deliberately show the same import
    'TS7006', // Implicit any on a parameter of an undeclared callback
    'TS7053', // Implicit any index, same cause
    'TS2571', // Object is of type unknown
]);

/**
 * An undeclared identifier that happens to name a DOM global.
 *
 * A sample calling `status.setActive(false)` is showing you a call on something the prose
 * introduced; TypeScript resolves `status` to `window.status`, a `BarProp`, and reports a
 * missing property rather than a missing name. Same for `name`, `length`, `event` and the
 * rest of the accidental globals. It is the "cannot find name" case wearing another code.
 */
const DOM_GLOBAL_SHADOW = /does not exist on type '(BarProp|Window|Location|History|Navigator|Screen)'/;

/** Every fenced block, with its language and the line the fence opened on. */
function fences(markdown) {
    const out = [];
    const lines = markdown.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const open = /^```(\w+)?\s*$/.exec(lines[i]);
        if (!open) continue;
        const body = [];
        let j = i + 1;
        for (; j < lines.length && !/^```\s*$/.test(lines[j]); j++) body.push(lines[j]);
        out.push({lang: open[1] ?? '', line: i + 1, code: body.join('\n')});
        i = j;
    }
    return out;
}

function tsconfig(dir) {
    return JSON.stringify({
        compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            moduleResolution: 'node',
            jsx: 'react-jsx',
            strict: true,
            noImplicitAny: false,
            noEmit: true,
            skipLibCheck: true,
            esModuleInterop: true,
            // The samples compile in a temp directory, so nothing resolves by walking up to a
            // `node_modules`. Both halves of the mapping are deliberate: the package itself
            // resolves to **`dist/`, which is what a reader installs**, and everything else
            // to this repo's real `node_modules`, so `ol` and `maplibre-gl` and `milsymbol`
            // are the versions the peer ranges name.
            baseUrl: p('.'),
            paths: {
                '@zaes/tactical-graphics': [p('dist/types/index.d.ts')],
                '@zaes/tactical-graphics/openlayers': [p('dist/ol/types/components/openlayers/index.d.ts')],
                '@zaes/tactical-graphics/maplibre': [p('dist/mlb/types/components/maplibre/index.d.ts')],
                '@zaes/tactical-graphics/thumbnails': [p('dist/types/assets/graphicThumbnails.d.ts')],
                '*': [p('node_modules/*')],
            },
        },
        include: ['src'],
    }, null, 2);
}

/** Compile a directory of samples and return the diagnostics, parsed. */
function diagnose(dir) {
    try {
        execFileSync(process.execPath, [p('node_modules/typescript/bin/tsc'), '-p', dir], {
            stdio: 'pipe', encoding: 'utf8',
        });
        return [];
    } catch (e) {
        const out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
        return out.split('\n').flatMap(line => {
            const m = /^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim());
            return m ? [{file: m[1], line: Number(m[2]), code: m[4], text: m[5]}] : [];
        });
    }
}

const typed = fences(readFileSync(join(ROOT, 'README.md'), 'utf8')).filter(b => b.lang === 'ts' || b.lang === 'tsx');
const blocks = typed.filter(b => /^\s*import\s/m.test(b.code));

const dir = mkdtempSync(join(tmpdir(), 'readme-samples-'));
const imports = join(dir, 'imports');
const whole = join(dir, 'whole');
for (const d of [imports, whole]) mkdirSync(join(d, 'src'), {recursive: true});
writeFileSync(join(imports, 'tsconfig.json'), tsconfig(imports), 'utf8');
writeFileSync(join(whole, 'tsconfig.json'), tsconfig(whole), 'utf8');

const named = new Map();
blocks.forEach((b, i) => {
    const stem = `sample${String(i).padStart(2, '0')}`;
    // Pass 1: the import statements alone, each name referenced so an unused one is still
    // resolved. Pass 2: the sample entire.
    // **Whole statements, not lines that begin with `import`.** A multi-line import truncated
    // to its first line is a syntax error the README does not have.
    const lines = b.code.split('\n');
    const statements = [];
    for (let k = 0; k < lines.length; k++) {
        if (!/^\s*import\s/.test(lines[k])) continue;
        const start = k;
        while (k < lines.length && !/['"];?\s*$/.test(lines[k])) k++;
        statements.push(lines.slice(start, k + 1).join('\n'));
    }
    writeFileSync(join(imports, 'src', `${stem}.ts`), `${statements.join('\n')}\nexport {};\n`, 'utf8');
    writeFileSync(join(whole, 'src', `${stem}.${b.lang}`), `${b.code}\nexport {};\n`, 'utf8');
    named.set(stem, b);
});

const where = d => {
    const stem = /(sample\d+)/.exec(d.file)?.[1];
    const b = stem && named.get(stem);
    return b ? `README.md:${b.line + d.line}` : d.file;
};

let failures = 0;
console.log(`Checking ${blocks.length} of ${typed.length} typed samples — the ${typed.length - blocks.length} with no import are fragments.\n`);

const importErrors = diagnose(imports).filter(d => !EXCERPT_NOISE.has(d.code));
if (importErrors.length) {
    console.log('IMPORTS');
    for (const d of importErrors) {
        failures++;
        console.log(`  FAIL ${where(d)}  ${d.code}: ${d.text}`);
    }
} else {
    console.log('IMPORTS  ok — every module resolves and every imported name exists in dist/');
}

const typeErrors = diagnose(whole)
    .filter(d => !EXCERPT_NOISE.has(d.code))
    .filter(d => !DOM_GLOBAL_SHADOW.test(d.text));
if (typeErrors.length) {
    console.log('\nTYPES');
    const seen = new Set();
    for (const d of typeErrors) {
        const key = `${where(d)} ${d.code} ${d.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        failures++;
        console.log(`  FAIL ${where(d)}  ${d.code}: ${d.text}`);
    }
} else {
    console.log('TYPES    ok — no type error that is not an artefact of an excerpt');
}

// ---------------------------------------------------------------------------------
// Pass 3: the amplifier literals in the `tacticalGraphic` object.
// ---------------------------------------------------------------------------------

/** Property name -> the exported enum its values must come from. */
const ENUM_OF = {
    hostility: 'TacticalGraphicHostility',
    status: 'TacticalGraphicStatus',
    confidence: 'TacticalGraphicConfidence',
    echelon: 'TacticalGraphicEchelon',
    direction: 'RouteDirection',
    mineType: 'TacticalGraphicMineType',
    mobility: 'TacticalGraphicMobility',
    terrain: 'TacticalGraphicTerrain',
    altitudeDatum: 'AltitudeDatum',
};

const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
// **The block that lists the fields, not the first `tacticalGraphic: {` in the file.**
// An earlier snippet shows the object as `tacticalGraphic: {/* every field below */}` on
// one line; anchoring on that gave a body of forty characters, a body that matched nothing,
// and a pass that reported "ok" for a README with two wrong values in it.
const objectStart = readme.indexOf('tacticalGraphic: {\n    // Required');
const enumErrors = [];
if (objectStart === -1) {
    enumErrors.push('README.md  the annotated `tacticalGraphic` object is gone — this pass checks nothing');
} else {
    const lib = await import(`file://${p('dist/cjs/index.js')}`);
    const body = readme.slice(objectStart, readme.indexOf('\n```', objectStart));
    const before = readme.slice(0, objectStart).split('\n').length;
    for (const m of body.matchAll(/^\s*([a-zA-Z][A-Za-z0-9]*): '([^']*)',/gm)) {
        const enumName = ENUM_OF[m[1]];
        if (!enumName) continue;
        const members = lib[enumName] ?? lib.default?.[enumName];
        if (!members) { enumErrors.push(`README.md  \`${enumName}\` is not exported from dist/`); continue; }
        const values = Object.values(members);
        if (values.includes(m[2])) continue;
        const line = before + body.slice(0, m.index).split('\n').length - 1;
        enumErrors.push(`README.md:${line}  ${m[1]}: '${m[2]}' is not a ${enumName} — ${values.join(' | ')}`);
    }
}
if (enumErrors.length) {
    console.log('\nAMPLIFIERS');
    for (const e of enumErrors) { failures++; console.log(`  FAIL ${e}`); }
} else {
    console.log('AMPLIFIERS ok — every documented amplifier literal is a member of its enum');
}

rmSync(dir, {recursive: true, force: true});
console.log(failures ? `\n${failures} problem(s).` : '\nAll good.');
process.exit(failures ? 1 : 0);
