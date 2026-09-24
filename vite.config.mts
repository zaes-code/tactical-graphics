import {defineConfig, type PluginOption} from 'vite';
import react from '@vitejs/plugin-react';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

/*
 * **`.mts`, and no `__dirname`.** Vite loads this file natively as ESM; as `vite.config.ts`
 * under a CommonJS `package.json` it warned that ESM syntax in a file loaded as CommonJS
 * stops working in a future major. Renaming is the fix that does not require setting
 * `"type": "module"` on the package, which every `require()` in `scripts/` depends on.
 */

/**
 * The sample app imports the library by its published name so it exercises the same entry
 * point a consumer gets. TypeScript resolves this through `paths` in tsconfig.json; the
 * bundler and the test runner need their own mapping. Keep all three in sync — this is the
 * bundler's and, via `test.alias` below, the runner's.
 */
const LIBRARY_NAME = '@zaes/tactical-graphics';
const LIBRARY_ENTRY = fileURLToPath(new URL('./src/tacticalgraphics/index.ts', import.meta.url));
const THUMBNAILS_ENTRY = fileURLToPath(new URL('./src/tacticalgraphics/assets/graphicThumbnails.ts', import.meta.url));

/**
 * Anchored, because a plain `{name: path}` alias is a prefix match: the root's entry would
 * swallow `@zaes/tactical-graphics/thumbnails` and resolve it to `index.ts/thumbnails`.
 * The subpath comes first for the same reason.
 */
const LIBRARY_ALIASES = [
    {find: new RegExp(`^${LIBRARY_NAME}/thumbnails$`), replacement: THUMBNAILS_ENTRY},
    {find: new RegExp(`^${LIBRARY_NAME}$`), replacement: LIBRARY_ENTRY},
];

/**
 * **Engines from outside this repo, on a developer's machine only.** @see src/components/demoAddons.ts
 *
 * `npm run start:addons` runs Vite in `addons` mode, which loads the Vite plugins named in
 * `demo-addons.local.json` (untracked, so each developer lists their own) and leaves
 * `@demo/addons` for one of them to answer. In every other mode `@demo/addons` is the empty
 * list. Nothing here names an add-on: this repo is MIT and an add-on's code stays in the add-on.
 */
const ADDONS_MODE = 'addons';
const ADDONS_FILE = fileURLToPath(new URL('./demo-addons.local.json', import.meta.url));
const NO_ADDONS = {find: /^@demo\/addons$/, replacement: fileURLToPath(new URL('./src/components/demoAddonsNone.ts', import.meta.url))};

async function addonPlugins(): Promise<PluginOption[]> {
    if (!existsSync(ADDONS_FILE)) {
        throw new Error(`addons mode needs demo-addons.local.json: {"plugins": ["<path to an add-on's Vite plugin>"]}`);
    }
    const {plugins = []} = JSON.parse(readFileSync(ADDONS_FILE, 'utf8')) as {plugins?: string[]};
    return Promise.all(plugins.map(async path => {
        const module = await import(pathToFileURL(resolve(fileURLToPath(new URL('.', import.meta.url)), path)).href);
        return (module.default ?? module.plugin)() as PluginOption;
    }));
}

export default defineConfig(async ({command, mode}) => {
    const addons = mode === ADDONS_MODE;
    // A build is what gets deployed, and the public sample must never carry an add-on.
    if (addons && command === 'build') throw new Error('addons mode is for the dev server only; it never builds');
    return {
        plugins: [react(), ...(addons ? await addonPlugins() : [])],

        resolve: {
            alias: addons ? LIBRARY_ALIASES : [NO_ADDONS, ...LIBRARY_ALIASES],
        },

        /**
         * **`PUBLIC_URL` is what the Pages workflow sets, and it is not a Vite name.**
         * Read here rather than renamed in the workflow so the deploy keeps working unchanged;
         * `base` is Vite's equivalent and has to end in a slash where CRA's did not.
         */
        base: process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/$/, '')}/` : '/',

        /**
         * **`outDir` is pinned, and this is the one setting that must never be left at its
         * default.** Vite's default is `dist/`, which in this repository is the *published
         * library* — three entry points, built by `scripts/build-lib.js` from tsc. A demo build
         * at the default would delete it and replace it with a bundled app, and `npm publish`
         * would ship that. CRA wrote to `build/`, the Pages workflow uploads `build/`, and
         * `.gitignore` covers both, so `build/` it stays.
         */
        build: {
            outDir: 'build',
            sourcemap: true,
        },

        /**
         * The library reads two environment values and both must survive bundling **as the exact
         * text a bundler matches**, which is why they are replaced here rather than rewritten to
         * `import.meta.env` in the source: `openlayerStyles.ts` and `maplibre/basemapStyle.ts`
         * ship inside the published package, where `import.meta.env` would be a Vite-ism baked
         * into a library that has no Vite. They read `process.env.REACT_APP_BASEMAP` inside a
         * try/catch, so a consumer whose bundler defines nothing gets the catch and the default.
         * @see ai/decisions.md, "No `process` at module load"
         */
        define: {
            'process.env.REACT_APP_BASEMAP': JSON.stringify(process.env.REACT_APP_BASEMAP ?? ''),
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
        },

        server: {port: 3000, strictPort: true},
        preview: {port: 3000},

        test: {
            // `describe`, `it` and `expect` without an import in all 165 suites, which is what
            // they were written against under CRA's Jest.
            globals: true,
            environment: 'jsdom',
            setupFiles: ['./src/setupTests.ts'],
            // Vite resolves ESM natively, so the ESM_DEPS allow-list `craco.config.js` carried
            // for turf v7, polyclip-ts and the rest is gone rather than translated. That list
            // existed only because CRA's Jest excluded node_modules from Babel.
            alias: [NO_ADDONS, ...LIBRARY_ALIASES],
            include: ['src/**/*.test.{ts,tsx}'],
            // The Playwright drivers under `scripts/` and `tmp/` drive a running app and are not
            // unit tests; `dist/` holds built copies of the same suites.
            exclude: ['node_modules/**', 'dist/**', 'build/**', 'tmp/**'],
        },
    };
});
