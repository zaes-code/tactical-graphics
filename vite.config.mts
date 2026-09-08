import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

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

export default defineConfig(() => ({
    plugins: [react()],

    resolve: {
        alias: {[LIBRARY_NAME]: LIBRARY_ENTRY},
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
        alias: {[LIBRARY_NAME]: LIBRARY_ENTRY},
        include: ['src/**/*.test.{ts,tsx}'],
        // The Playwright drivers under `scripts/` and `tmp/` drive a running app and are not
        // unit tests; `dist/` holds built copies of the same suites.
        exclude: ['node_modules/**', 'dist/**', 'build/**', 'tmp/**'],
    },
}));
