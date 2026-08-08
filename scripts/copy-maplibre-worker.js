#!/usr/bin/env node
/**
 * Copies MapLibre's worker bundle into `public/` so the demo can serve it.
 *
 * ## Why this is needed
 *
 * maplibre-gl v6 is ESM-only and works out where its worker lives by reading
 * `import.meta.url`:
 *
 *     function () {
 *         let e = import.meta.url;
 *         if (!/^https?:/.test(e)) return '';        // ← this branch
 *         ...
 *         return new URL('./maplibre-gl-worker.mjs', e).href;
 *     }
 *
 * Bundled by CRA / webpack 5, `import.meta.url` is not an `http(s):` URL, so that
 * guard returns the empty string — and `new Worker('')` cheerfully spawns a
 * worker pointing at **the document itself**. It starts, it never errors, and it
 * answers nothing.
 *
 * The failure is completely silent. The map renders, the basemap tiles load
 * (raster is decoded on the main thread), `map.on('error')` stays quiet, and
 * `addSource`/`addLayer` both succeed. What does not happen is any GeoJSON source
 * ever parsing: `isSourceLoaded` sits at `false` forever and every vector layer
 * renders empty. Diagnosing it took a control test — one hardcoded GeoJSON line,
 * added by hand, which also failed to draw and so cleared the application code.
 *
 * Note the canvas-overlay renderer is **immune**, because it never touches
 * MapLibre's data pipeline. Only the native-layer path needs this.
 *
 * ## Both files, not one
 *
 * `maplibre-gl-worker.mjs` opens with `import ... from "./maplibre-gl-shared.mjs"`,
 * so the sibling has to sit beside it. Copying only the worker fails in the most
 * misleading way available: CRA's dev server answers any unknown path with
 * `index.html` and a **200**, so the worker's import resolves to a page of HTML,
 * the module fails to parse, and the worker dies without a single console entry.
 * A `curl` of the missing file returning 200 is what finally gave it away.
 *
 * Run by `prestart` and `prebuild:demo`. The copies are gitignored — they are
 * build artefacts, and vendoring a dependency's bundle would go stale on upgrade.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'node_modules', 'maplibre-gl', 'dist');
const publicDir = path.join(root, 'public');
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!fs.existsSync(dist)) {
    // Not an error: maplibre-gl is an optional peer dependency, so a consumer who
    // only wants the geometry will not have it installed.
    console.log('maplibre-gl not installed — skipping worker copy');
    process.exit(0);
}

fs.mkdirSync(publicDir, {recursive: true});
for (const file of FILES) {
    const source = path.join(dist, file);
    if (!fs.existsSync(source)) throw new Error(`maplibre-gl is installed but dist/${file} is missing`);
    const target = path.join(publicDir, file);
    fs.copyFileSync(source, target);
    console.log(`copied ${file} → public/ (${(fs.statSync(target).size / 1024).toFixed(0)} kB)`);
}
