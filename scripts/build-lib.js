#!/usr/bin/env node
/**
 * Builds both published entry points.
 *
 * The root package — map-agnostic geometry, from `src/tacticalgraphics`:
 *
 *   dist/cjs/       CommonJS   (package.json "main")
 *   dist/esm/       ES modules (package.json "module" / "exports".import)
 *   dist/types/     .d.ts      (package.json "types")
 *
 * `@zaes/tactical-graphics/openlayers` — the OpenLayers renderer, from
 * `src/components/openlayers` plus the handful of `src/utils` modules and
 * `src/settings.ts` it reaches:
 *
 *   dist/ol/cjs/    dist/ol/esm/    dist/ol/types/
 *
 * Order matters: the OpenLayers half imports the root by package name, and
 * tsconfig.ol.json points that at `dist/types`, so the root must be built first.
 *
 * The React demo (`src/components/MapControls.tsx`, `OpenLayers.tsx`, the sample
 * gallery) is not built or published.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

const run = (...args) => {
    console.log(`  tsc ${args.join(' ')}`);
    execFileSync(process.execPath, [tsc, ...args], {cwd: root, stdio: 'inherit'});
};

console.log('Cleaning dist/');
fs.rmSync(dist, {recursive: true, force: true});

console.log('Building CommonJS + type declarations');
run('-p', 'tsconfig.lib.json', '--module', 'commonjs', '--outDir', 'dist/cjs', '--declarationDir', 'dist/types');

console.log('Building ES modules');
run('-p', 'tsconfig.lib.json', '--module', 'esnext', '--outDir', 'dist/esm', '--declaration', 'false', '--declarationMap', 'false');

// Node decides CJS-vs-ESM by the nearest package.json "type". The root package
// has no "type" (so dist/cjs/*.js are CommonJS); dist/esm needs its own marker
// or Node will read those .js files as CommonJS and choke on `import`.
console.log('Marking dist/esm as ESM');
fs.writeFileSync(path.join(dist, 'esm', 'package.json'), JSON.stringify({type: 'module'}, null, 2) + '\n');

console.log('Adding .js extensions to ESM relative imports');
addEsmExtensions(path.join(dist, 'esm'));

// ── The OpenLayers entry point ────────────────────────────────────────────────

const ol = path.join(dist, 'ol');

console.log('\nBuilding the OpenLayers renderer (CommonJS + declarations)');
run('-p', 'tsconfig.ol.json', '--module', 'commonjs', '--outDir', 'dist/ol/cjs', '--declarationDir', 'dist/ol/types');

console.log('Building the OpenLayers renderer (ES modules)');
run('-p', 'tsconfig.ol.json', '--module', 'esnext', '--outDir', 'dist/ol/esm', '--declaration', 'false', '--declarationMap', 'false');

console.log('Marking dist/ol/esm as ESM');
fs.writeFileSync(path.join(ol, 'esm', 'package.json'), JSON.stringify({type: 'module'}, null, 2) + '\n');

console.log('Adding .js extensions to ESM relative imports');
addEsmExtensions(path.join(ol, 'esm'));

/**
 * TypeScript emits relative specifiers exactly as written in the source —
 * `from './core/render'`, with no extension. Bundlers resolve that; Node's ESM
 * loader does not, and throws ERR_MODULE_NOT_FOUND. Rewrite them to
 * `'./core/render.js'` after emit.
 *
 * Safe because every relative specifier in this library resolves to a file, not
 * a directory (a directory would need `/index.js` instead). The build asserts
 * that rather than assuming it. Bare specifiers (`@turf/turf`) are left alone,
 * as are specifiers already carrying an extension.
 */
function addEsmExtensions(dir) {
    const SPECIFIER = /(\b(?:from|import)\s*)(['"])(\.{1,2}\/[^'"]+)\2/g;
    let rewritten = 0;
    const skipped = [];

    for (const file of walk(dir)) {
        if (!file.endsWith('.js')) continue;
        const before = fs.readFileSync(file, 'utf8');

        const after = before.replace(SPECIFIER, (match, head, quote, spec) => {
            if (/\.(js|mjs|cjs|json)$/.test(spec)) return match;

            const target = path.resolve(path.dirname(file), spec);

            if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
                throw new Error(
                    `${file}: relative import "${spec}" points at a directory. ` +
                        `addEsmExtensions() only handles file imports — it would need to append /index.js here.`,
                );
            }

            // A specifier whose target was never emitted cannot be live code —
            // tsc would have failed to compile it. It is a preserved comment,
            // e.g. TacticalGraphicsRegistry.ts's commented-out SearchArea
            // import. Leave it alone.
            //
            // Matching on "the target exists" rather than "the line starts with
            // import" is what makes this correct for multi-line import
            // statements, which tsc emits whenever the source's specifier list
            // contains a comment.
            if (!fs.existsSync(`${target}.js`)) {
                skipped.push(`${path.relative(dist, file)} → ${spec}`);
                return match;
            }

            rewritten++;
            return `${head}${quote}${spec}.js${quote}`;
        });

        if (after !== before) fs.writeFileSync(file, after);
    }

    console.log(`  rewrote ${rewritten} specifiers`);
    if (skipped.length) {
        console.log(`  skipped ${skipped.length} (target not emitted — commented out):`);
        skipped.forEach(s => console.log(`    ${s}`));
    }

    assertNoBareRelativeImports(dir);
}

/**
 * Belt and braces: after rewriting, no *live* relative specifier may lack an
 * extension. Anything still bare must point at a file that does not exist —
 * i.e. it is inside a comment. If one points at a real file, the rewrite missed
 * it and Node would throw ERR_MODULE_NOT_FOUND at import time.
 */
function assertNoBareRelativeImports(dir) {
    const SPECIFIER = /(?:\bfrom|\bimport)\s*['"](\.{1,2}\/[^'"]+)['"]/g;
    const broken = [];

    for (const file of walk(dir)) {
        if (!file.endsWith('.js')) continue;
        const src = fs.readFileSync(file, 'utf8');
        for (const [, spec] of src.matchAll(SPECIFIER)) {
            if (/\.(js|mjs|cjs|json)$/.test(spec)) continue;
            if (fs.existsSync(path.resolve(path.dirname(file), `${spec}.js`))) {
                broken.push(`${path.relative(dist, file)} → ${spec}`);
            }
        }
    }

    if (broken.length) {
        throw new Error(`ESM emit still has extensionless imports of real modules:\n  ${broken.join('\n  ')}`);
    }
    console.log('  verified: no live extensionless relative imports remain');
}

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else yield full;
    }
}

console.log('\nBuilt:');
for (const dir of ['cjs', 'esm', 'types']) {
    const entry = path.join(dist, dir, dir === 'types' ? 'index.d.ts' : 'index.js');
    console.log(`  ${fs.existsSync(entry) ? 'OK  ' : 'MISS'} dist/${dir}/${path.basename(entry)}`);
}
for (const dir of ['cjs', 'esm', 'types']) {
    const entry = path.join(ol, dir, 'components', 'openlayers', dir === 'types' ? 'index.d.ts' : 'index.js');
    console.log(`  ${fs.existsSync(entry) ? 'OK  ' : 'MISS'} dist/ol/${dir}/components/openlayers/${path.basename(entry)}`);
}

// The published root must never import `ol` — that is the whole point of the
// split. Assert it rather than trusting tsconfig.lib.json's include list.
const leaked = [...walk(path.join(dist, 'cjs')), ...walk(path.join(dist, 'esm'))].filter(
    f => f.endsWith('.js') && /(?:from|require\()\s*['"]ol[/'"]/.test(fs.readFileSync(f, 'utf8')),
);
if (leaked.length) {
    throw new Error(`OpenLayers leaked into the map-agnostic entry point:\n  ${leaked.map(f => path.relative(dist, f)).join('\n  ')}`);
}
console.log('  verified: the root entry point imports no OpenLayers');
