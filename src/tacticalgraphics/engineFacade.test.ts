/**
 * # The two engines expose the same verbs
 *
 * The claim `createTacticalGraphics` makes is that a consumer changes the import line
 * and nothing else. That is a claim about **both** subpaths at once, and neither one's
 * own tests can check it — which is exactly how the two drifted into needing a façade
 * in the first place.
 *
 * These read the **barrels** rather than importing the modules, because the promise is
 * about what a consumer can import: a function that exists but is missing from a barrel
 * is invisible to them, and passes a grep of the source. Reading text rather than
 * importing also keeps this suite free of both map libraries, which is the same
 * property it is asserting about the root.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = __dirname;

const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');

/** The names a barrel re-exports, as written in its `export {...}` clauses. */
function exportedNames(barrel: string): Set<string> {
    const names = new Set<string>();
    // `Array.from`, not a for-of over the iterator: the build targets es5, where
    // iterating one needs --downlevelIteration.
    for (const clause of Array.from(barrel.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g))) {
        for (const raw of clause[1].split(',')) {
            const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
            if (name) names.add(name);
        }
    }
    return names;
}

const openlayers = exportedNames(read('../components/openlayers/index.ts'));
const maplibre = exportedNames(read('../components/maplibre/index.ts'));
const root = exportedNames(read('index.ts'));

describe('the shared façade', () => {
    it('is exported under the same name by both engines', () => {
        expect(openlayers.has('createTacticalGraphics')).toBe(true);
        expect(maplibre.has('createTacticalGraphics')).toBe(true);
    });

    it('has its type in the root, where neither engine owns it', () => {
        // In an engine's barrel it would be a type a consumer imports *from* a renderer,
        // which is the coupling the façade exists to remove.
        for (const name of ['TacticalGraphicsEngine', 'EditMode', 'EngineCapabilities', 'EngineCallbacks']) {
            expect(root.has(name)).toBe(true);
        }
    });

    it('gives each engine an options type, since construction is what differs', () => {
        expect(openlayers.has('OpenLayersEngineOptions')).toBe(true);
        expect(maplibre.has('MapLibreEngineOptions')).toBe(true);
    });

    it('implements every verb the interface declares, in both engines', () => {
        const engine = read('core/engine.ts');
        const body = engine.slice(engine.indexOf('export interface TacticalGraphicsEngine'));
        const verbs = Array.from(body.matchAll(/^\s{4}(?:readonly\s+)?(\w+)[(:?]/gm)).map(m => m[1]);

        // A guard on the guard: if the interface stops parsing, this test must fail
        // loudly rather than quietly verify nothing.
        expect(verbs).toContain('startDrawing');
        expect(verbs.length).toBeGreaterThanOrEqual(10);

        for (const file of ['../components/openlayers/createTacticalGraphics.ts', '../components/maplibre/createTacticalGraphics.ts']) {
            const source = read(file);
            for (const verb of verbs) {
                expect(source.includes(verb)).toBe(true);
            }
        }
    });

    it('offers the library own names from both subpaths, or from neither', () => {
        // Configuration, the palette, the property key and the center-symbol controls
        // describe the symbology rather than a renderer, so which engine you picked must
        // not change how you import them. OpenLayers re-exported 27 of these and MapLibre
        // none, so the same program needed different import lines for things that have
        // nothing to do with either engine.
        const fromRoot = (barrel: Set<string>) => new Set(Array.from(barrel).filter(name => root.has(name)));
        const olRoot = fromRoot(openlayers);
        const mlbRoot = fromRoot(maplibre);

        const onlyOpenLayers = Array.from(olRoot).filter(name => !mlbRoot.has(name)).sort();
        const onlyMapLibre = Array.from(mlbRoot).filter(name => !olRoot.has(name)).sort();
        expect({onlyOpenLayers, onlyMapLibre}).toEqual({onlyOpenLayers: [], onlyMapLibre: []});
    });

    it('keeps the root free of both map libraries, which is what makes it shared', () => {
        const engine = read('core/engine.ts');
        expect(engine).not.toMatch(/from ['"](ol|maplibre-gl)/);
        expect(engine).not.toMatch(/require\(['"](ol|maplibre-gl)/);
    });
});
