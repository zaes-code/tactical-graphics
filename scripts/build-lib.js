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
 * `@zaes/tactical-graphics/maplibre` — the MapLibre renderer, from
 * `src/components/maplibre`:
 *
 *   dist/mlb/cjs/   dist/mlb/esm/   dist/mlb/types/
 *
 * Order matters: both renderer halves import the root by package name, and their
 * tsconfigs point that at `dist/types`, so the root must be built first.
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

console.log('Resolving bare deep imports for Node ESM');
addBareEsmExtensions(path.join(ol, 'esm'));

// ── The MapLibre entry point ──────────────────────────────────────────────────

const mlb = path.join(dist, 'mlb');

console.log('\nBuilding the MapLibre renderer (CommonJS + declarations)');
run('-p', 'tsconfig.mlb.json', '--module', 'commonjs', '--outDir', 'dist/mlb/cjs', '--declarationDir', 'dist/mlb/types');

console.log('Building the MapLibre renderer (ES modules)');
run('-p', 'tsconfig.mlb.json', '--module', 'esnext', '--outDir', 'dist/mlb/esm', '--declaration', 'false', '--declarationMap', 'false');

console.log('Marking dist/mlb/esm as ESM');
fs.writeFileSync(path.join(mlb, 'esm', 'package.json'), JSON.stringify({type: 'module'}, null, 2) + '\n');

console.log('Adding .js extensions to ESM relative imports');
addEsmExtensions(path.join(mlb, 'esm'));

console.log('Resolving bare deep imports for Node ESM');
addBareEsmExtensions(path.join(mlb, 'esm'));

/**
 * The same problem as addEsmExtensions, one step out: `import ... from
 * 'ol/source/Vector'`.
 *
 * A bare specifier is normally none of our business — the target package's
 * `exports` map resolves it. `ol` has no `exports` map and is `"type": "module"`,
 * so Node applies plain file resolution and demands the extension:
 * `ERR_MODULE_NOT_FOUND ... Did you mean to import "ol/source/Vector.js"?`.
 * Bundlers and `require()` both resolve the short form, which is why this only
 * bites a consumer doing a native `import` under Node — the case 1.3.0 shipped
 * broken.
 *
 * Only packages *without* an `exports` map are rewritten; anything that declares
 * one (`@turf/turf`) is left exactly as written, because there the short
 * specifier is the correct — and sometimes only — way in.
 */
function addBareEsmExtensions(dir) {
    const SPECIFIER = /(\b(?:from|import)\s*)(['"])([^.'"][^'"]*)\2/g;
    const modules = path.join(root, 'node_modules');
    const exportsMap = new Map(); // package name → declares "exports"?
    let rewritten = 0;

    const declaresExports = pkg => {
        if (!exportsMap.has(pkg)) {
            const manifest = path.join(modules, pkg, 'package.json');
            let has = true; // unknown package: assume modern, leave it alone
            if (fs.existsSync(manifest)) has = !!JSON.parse(fs.readFileSync(manifest, 'utf8')).exports;
            exportsMap.set(pkg, has);
        }
        return exportsMap.get(pkg);
    };

    for (const file of walk(dir)) {
        if (!file.endsWith('.js')) continue;
        const before = fs.readFileSync(file, 'utf8');

        const after = before.replace(SPECIFIER, (match, head, quote, spec) => {
            if (/\.(js|mjs|cjs|json)$/.test(spec) || !spec.includes('/')) return match;
            const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
            if (declaresExports(pkg)) return match;

            const target = path.join(modules, spec);
            // `ol/geom` is a barrel file; `ol/style/Circle` is a module. Prefer
            // the file, fall back to the directory's index.
            const suffix = fs.existsSync(`${target}.js`) ? '.js' : fs.existsSync(path.join(target, 'index.js')) ? '/index.js' : null;
            if (!suffix) throw new Error(`${file}: bare import "${spec}" resolves to neither ${spec}.js nor ${spec}/index.js`);

            rewritten++;
            return `${head}${quote}${spec}${suffix}${quote}`;
        });

        if (after !== before) fs.writeFileSync(file, after);
    }
    console.log(`  rewrote ${rewritten} bare specifiers`);
}

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

/**
 * Ensures `node_modules/@zaes/tactical-graphics` points back at this repo, so
 * the built code's `import '@zaes/tactical-graphics'` resolves locally exactly
 * as it will for a consumer. A directory junction, because that is the symlink
 * flavour Windows allows without elevation.
 */
function selfLink() {
    const link = path.join(root, 'node_modules', '@zaes', 'tactical-graphics');
    try {
        if (fs.existsSync(link)) {
            if (fs.realpathSync(link) === fs.realpathSync(root)) return;
            fs.rmSync(link, {recursive: true, force: true});
        }
        fs.mkdirSync(path.dirname(link), {recursive: true});
        fs.symlinkSync(root, link, 'junction');
        console.log('  linked node_modules/@zaes/tactical-graphics → .');
    } catch (e) {
        console.log(`  could not self-link (${e.code ?? e.message}); the ESM smoke load may not resolve the root entry`);
    }
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
for (const dir of ['cjs', 'esm', 'types']) {
    const entry = path.join(mlb, dir, 'components', 'maplibre', dir === 'types' ? 'index.d.ts' : 'index.js');
    console.log(`  ${fs.existsSync(entry) ? 'OK  ' : 'MISS'} dist/mlb/${dir}/components/maplibre/${path.basename(entry)}`);
}

/**
 * Each entry point may import exactly one map library, and the root may import
 * none. That separation is the whole point of the split — it is what keeps the
 * geometry portable and what lets both renderers be optional peers — so it is
 * asserted rather than trusted to the tsconfig include lists.
 *
 * Four checks, not one. The two renderers now share a paint layer, so an
 * accidental import across them would make each drag in the other's peer
 * dependency — a consumer who installed `maplibre-gl` alone would get a module
 * that cannot resolve `ol`. Checking only the root would not catch that.
 */
const assertNoImport = (dirs, pkg, what) => {
    const pattern = new RegExp(`(?:from|require\\()\\s*['"]${pkg}[/'"]`);
    const leaked = dirs
        .flatMap(dir => (fs.existsSync(dir) ? [...walk(dir)] : []))
        .filter(f => f.endsWith('.js') && pattern.test(fs.readFileSync(f, 'utf8')));
    if (leaked.length) {
        throw new Error(`${pkg} leaked into ${what}:\n  ${leaked.map(f => path.relative(dist, f)).join('\n  ')}`);
    }
    console.log(`  verified: ${what} imports no ${pkg}`);
};

const rootDirs = [path.join(dist, 'cjs'), path.join(dist, 'esm')];
const olDirs = [path.join(ol, 'cjs'), path.join(ol, 'esm')];
const mlbDirs = [path.join(mlb, 'cjs'), path.join(mlb, 'esm')];

assertNoImport(rootDirs, 'ol', 'the root entry point');
assertNoImport(rootDirs, 'maplibre-gl', 'the root entry point');
assertNoImport(mlbDirs, 'ol', 'the MapLibre entry point');
assertNoImport(olDirs, 'maplibre-gl', 'the OpenLayers entry point');

// Load every emitted entry the way a consumer would. Static checks missed a
// whole broken build once: 1.3.0's ESM output imported `ol/source/Vector`
// without the extension, which CJS and bundlers resolve and Node's ESM loader
// does not, so the package shipped unimportable under `import`. Four smoke
// loads cost a second and cover what greps cannot.
//
// The OpenLayers half imports the root by package name. A consumer resolves that
// through their node_modules; inside this repo there is nothing to resolve, and
// Node cannot fall back to self-reference because dist/*/esm/package.json (the
// `{"type": "module"}` marker) becomes the nearest package scope and carries no
// name. A junction to ourselves makes the check see what a consumer sees.
selfLink();
console.log('\nSmoke-loading both entry points');
for (const [label, spec, esm] of [
    ['root  cjs', './dist/cjs/index.js', false],
    ['root  esm', './dist/esm/index.js', true],
    ['ol    cjs', './dist/ol/cjs/components/openlayers/index.js', false],
    ['ol    esm', './dist/ol/esm/components/openlayers/index.js', true],
    ['mlb   cjs', './dist/mlb/cjs/components/maplibre/index.js', false],
    ['mlb   esm', './dist/mlb/esm/components/maplibre/index.js', true],
]) {
    const code = esm
        ? `import(${JSON.stringify(spec)}).then(m => { if (!Object.keys(m).length) throw new Error('no exports'); })`
        : `if (!Object.keys(require(${JSON.stringify(spec)})).length) throw new Error('no exports')`;
    try {
        execFileSync(process.execPath, ['--input-type=module', '-e', esm ? code : `import {createRequire} from 'module'; const require = createRequire(${JSON.stringify(path.join(root, 'x.js'))}); ${code}`], {
            cwd: root,
            stdio: 'pipe',
        });
        console.log(`  OK   ${label}`);
    } catch (e) {
        throw new Error(`${label} (${spec}) failed to load as a consumer would:\n${e.stderr?.toString().split('\n').slice(0, 6).join('\n')}`);
    }
}
