/**
 * # The published renderers never touch browser storage
 *
 * A library that reads or writes its host's `localStorage` is keeping state behind the
 * host's back, under a key the host never chose. It happened: the demo's record of which
 * graphics show their name only (`amplifierVisibility.ts`, key
 * `tacticalGraphics.hiddenAmplifiers`) was imported by both renderers' `restore()`, so it
 * compiled into `/openlayers` and `/maplibre` and shipped. A host that set the choice any
 * other way lost it on the next restore unless it wrote that private key.
 *
 * So this reads what the two renderer builds actually compile: every file their tsconfig
 * includes, plus everything those files import by relative path, which `tsc` pulls in
 * whatever the include list says. That second half is exactly how the demo file got in.
 * View state belongs to the host; the engines hold it in memory.
 * @see TacticalGraphicsEngine.setAmplifiersHidden
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

/** What a renderer's tsconfig lists, minus what it excludes. Mirrors tsconfig.{ol,mlb}.json. */
function listed(tsconfig: string): string[] {
    // The tsconfigs carry `//` comments, which JSON does not.
    const raw = fs.readFileSync(path.join(ROOT, tsconfig), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const config = JSON.parse(raw) as {include: string[]; exclude?: string[]};
    const excluded = new Set((config.exclude ?? []).filter(p => !p.includes('*')).map(p => path.join(ROOT, p)));
    const files: string[] = [];
    for (const pattern of config.include) {
        if (!pattern.includes('*')) {
            files.push(path.join(ROOT, pattern));
            continue;
        }
        // Every include glob here is `<dir>/**/*.ts`.
        const dir = path.join(ROOT, pattern.slice(0, pattern.indexOf('/**')));
        const walk = (at: string) => {
            for (const entry of fs.readdirSync(at, {withFileTypes: true})) {
                const full = path.join(at, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(full);
            }
        };
        walk(dir);
    }
    return files.filter(f => !excluded.has(f));
}

/** The file a relative import names, as `tsc` would find it. */
function resolve(from: string, specifier: string): string | undefined {
    const base = path.resolve(path.dirname(from), specifier);
    return [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(candidate => fs.existsSync(candidate));
}

/** `files` and everything they import by relative path, transitively. */
function compiled(files: string[]): Set<string> {
    const seen = new Set<string>();
    const queue = [...files];
    while (queue.length) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        const source = fs.readFileSync(file, 'utf8');
        for (const match of Array.from(source.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g))) {
            const target = resolve(file, match[1]);
            if (target) queue.push(target);
        }
    }
    return seen;
}

/** The source with its comments removed, so prose about storage is not mistaken for use. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const STORAGE = /\b(localStorage|sessionStorage|indexedDB)\b/;

describe.each(['tsconfig.ol.json', 'tsconfig.mlb.json'])('%s compiles nothing that touches browser storage', tsconfig => {
    const files = Array.from(compiled(listed(tsconfig)));

    it('reads the build it is about, not an empty list', () => {
        expect(files.length).toBeGreaterThan(10);
        expect(files.some(f => f.endsWith('createTacticalGraphics.ts'))).toBe(true);
    });

    it('does not compile the demo\'s own record of "name only"', () => {
        const demoStore = path.join(ROOT, 'src', 'components', 'amplifierVisibility.ts');
        expect(files).not.toContain(demoStore);
    });

    it('names no storage API anywhere in the code', () => {
        const offenders = files
            .filter(file => STORAGE.test(code(fs.readFileSync(file, 'utf8'))))
            .map(file => path.relative(ROOT, file));
        expect(offenders).toEqual([]);
    });
});
