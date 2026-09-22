#!/usr/bin/env node
/**
 * Export a map from one engine and import it into each engine, in all four directions, through
 * the panel's own Export and Import buttons.
 *
 *   npm start
 *   npm run sweep:import-export        (exits 1 on any failure)
 *
 * For every graphic in the sample gallery it asserts that the imported map holds the same
 * graphics, that no **amplifier bag** (`properties.tacticalGraphic`) value came back
 * different, and that no base coordinate moved more than `TOLERANCE_M`. Then it exports the imported map
 * again and requires the second file to match the first, so the reader and the writer are
 * checked against each other rather than against themselves.
 *
 * **Both origins, both destinations** (user's rule, 2026-09-04): the two engines do not stamp
 * the same keys for the same fact, and a trip tested from one side only is half an answer.
 * `tmp/probe-crossengine-roundtrip.mjs` walks the same path through `restore`, geometry only.
 */
import {chromium} from 'playwright';
import {mkdirSync, readFileSync, writeFileSync} from 'fs';
import {join} from 'path';

const URL = process.env.APP_URL ?? 'http://localhost:3000/';
const OUT = join(process.cwd(), '.playwright-out');
const TOLERANCE_M = 1;

/** Sizes and angles one engine files and the other re-derives from the geometry. */
const DERIVED_STAMPS = new Set(['labelGapDegrees', 'labelGap', 'decorationSize', 'radius', 'rotation', 'bend', 'startRange', 'stopRange']);
mkdirSync(OUT, {recursive: true});

const browser = await chromium.launch();

async function open(engine) {
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}, acceptDownloads: true});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(e => localStorage.setItem('tg_mapEngine', e), engine);
    await page.goto(URL, {waitUntil: 'networkidle'});
    // The panel, not `__tacticalEngine`: a production build strips the hook, and this has to
    // run against the published demo too, which is the baseline a change is compared with.
    await page.getByRole('button', {name: /draw samples/i}).waitFor({timeout: 30000});
    await page.waitForTimeout(2500);
    return {engine, page, errors};
}

async function exportFile({page, engine}, tag) {
    const [download] = await Promise.all([
        page.waitForEvent('download', {timeout: 30000}),
        page.getByRole('button', {name: /^export$/i}).click(),
    ]);
    const path = join(OUT, `ie-${tag}-${engine}.geojson`);
    await download.saveAs(path);
    return {path, fc: JSON.parse(readFileSync(path, 'utf8'))};
}

async function importFile({page}, path) {
    await page.getByRole('button', {name: /clear all/i}).click();
    await page.waitForTimeout(1200);
    await page.locator('input[type="file"]').setInputFiles(path);
    await page.waitForTimeout(5000);
}

/**
 * Canonical JSON, so key order cannot make two equal bags differ, and neither can two ways of
 * saying nothing: an empty string, `false` and an absent key all read as "not set", and a
 * number is compared to nine significant figures (a rebuild moves the fourteenth).
 */
const canonical = value =>
    JSON.stringify(value, (_, v) => {
        if (typeof v === 'number') return Number(v.toPrecision(9));
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.fromEntries(
                Object.keys(v)
                    .filter(k => v[k] !== '' && v[k] !== false && v[k] !== undefined && v[k] !== null)
                    .sort()
                    .map(k => [k, v[k]]),
            );
        }
        return v;
    });
const isUnset = v => v === '' || v === false || v === undefined || v === null;

const keyOf = (f, i) => f.properties?.symbolId ?? `${f.properties?.tacticalGraphic?.name}#${i}`;
const byKey = fc => new Map(fc.features.map((f, i) => [keyOf(f, i), f]));

function positions(geometry) {
    const out = [];
    (function walk(n) {
        if (!Array.isArray(n)) return;
        if (typeof n[0] === 'number') out.push(n);
        else n.forEach(walk);
    })(geometry?.coordinates);
    return out;
}

/** Everything that differs between two exported files, one line per graphic. */
function compare(a, b, stamped) {
    const problems = [];
    if (a.tacticalGraphicsVersion !== b.tacticalGraphicsVersion) problems.push(`version ${a.tacticalGraphicsVersion} vs ${b.tacticalGraphicsVersion}`);
    const [A, B] = [byKey(a), byKey(b)];
    for (const [key, fa] of A) {
        const fb = B.get(key);
        const name = fa.properties?.tacticalGraphic?.name ?? key;
        if (!fb) {
            problems.push(`${name}: missing after import`);
            continue;
        }
        if (canonical(fa.properties?.tacticalGraphic) !== canonical(fb.properties?.tacticalGraphic)) {
            const [ba, bb] = [fa.properties.tacticalGraphic, fb.properties.tacticalGraphic ?? {}];
            const keys = [...new Set([...Object.keys(ba), ...Object.keys(bb)])].filter(k => !(isUnset(ba[k]) && isUnset(bb[k])) && canonical(ba[k]) !== canonical(bb[k]));
            // **A value that changed is a loss; a value only one side files is not.** Across
            // engines every difference measured on 2026-09-21 was one-sided: a size or angle one
            // engine stamps from the geometry and the other re-derives from it (`decorationSize`,
            // `radius`, `rotation`, `labelGapDegrees`). The published demo shows the identical
            // list, so it predates the dash work. Those are counted, not failed.
            //
            // **Only those keys.** Any other field present on one side only is a loss: a
            // designation dropped on import is exactly that shape, and the control run caught
            // the first version of this rule letting it through.
            const changed = keys.filter(k => !DERIVED_STAMPS.has(k) || (!isUnset(ba[k]) && !isUnset(bb[k])));
            const oneSided = keys.filter(k => !changed.includes(k));
            if (changed.length) problems.push(`${name}: bag differs in ${changed.map(k => `${k} (${canonical(ba[k])} -> ${canonical(bb[k])})`).join(', ')}`);
            for (const k of oneSided) stamped.set(k, (stamped.get(k) ?? 0) + 1);
        }
        if (fa.geometry?.type !== fb.geometry?.type) {
            problems.push(`${name}: ${fa.geometry?.type} -> ${fb.geometry?.type}`);
            continue;
        }
        const [pa, pb] = [positions(fa.geometry), positions(fb.geometry)];
        if (pa.length !== pb.length) {
            problems.push(`${name}: ${pa.length} -> ${pb.length} points`);
            continue;
        }
        const worst = Math.max(0, ...pa.map((p, i) => Math.hypot((p[0] - pb[i][0]) * Math.cos((p[1] * Math.PI) / 180), p[1] - pb[i][1]) * 111320));
        if (worst > TOLERANCE_M) problems.push(`${name}: moved ${worst.toFixed(2)} m`);
    }
    for (const key of B.keys()) if (!A.has(key)) problems.push(`${B.get(key).properties?.tacticalGraphic?.name ?? key}: appeared from nowhere`);
    return problems;
}

const engines = {openlayers: await open('openlayers'), maplibre: await open('maplibre')};
let failures = 0;

for (const from of ['openlayers', 'maplibre']) {
    const source = engines[from];
    await source.page.getByRole('button', {name: /draw samples/i}).click();
    await source.page.waitForTimeout(6000);
    const original = await exportFile(source, 'original');
    const count = original.fc.features.length;

    /*
     * **A control, so a clean run is evidence.** With TG_PERTURB set, the file imported is not
     * the one exported: the first graphic's first point moves ~500 m and its designation
     * changes. Every direction has to report both.
     */
    let importPath = original.path;
    if (process.env.TG_PERTURB) {
        const tampered = JSON.parse(JSON.stringify(original.fc));
        const victim = tampered.features[0];
        const first = positions(victim.geometry)[0];
        first[0] += 0.005;
        victim.properties.tacticalGraphic.designation = 'TAMPERED';
        importPath = join(OUT, `ie-tampered-${from}.geojson`);
        writeFileSync(importPath, JSON.stringify(tampered));
    }

    for (const to of ['openlayers', 'maplibre']) {
        const target = engines[to];
        await importFile(target, importPath);
        const again = await exportFile(target, `from-${from}`);
        const stamped = new Map();
        const problems = compare(original.fc, again.fc, stamped);
        const label = `${from} -> ${to}`.padEnd(26);
        console.log(`${label} ${count} graphics exported, ${again.fc.features.length} came back, ${problems.length} failing`);
        if (stamped.size) console.log(`    one-sided stamps (not failures): ${[...stamped].map(([k, n]) => `${k} x${n}`).join(', ')}`);
        writeFileSync(join(OUT, `ie-${process.env.TG_TAG ?? 'run'}-${from}-to-${to}.txt`), problems.sort().join(String.fromCharCode(10)) + String.fromCharCode(10));
        problems.slice(0, 20).forEach(p => console.log(`    ${p}`));
        if (problems.length > 20) console.log(`    ... and ${problems.length - 20} more`);
        if (count < 300 || problems.length) failures++;
    }
    await source.page.getByRole('button', {name: /clear all/i}).click();
    await source.page.waitForTimeout(1200);
}

for (const {engine, errors} of Object.values(engines)) {
    if (errors.length) {
        failures++;
        console.log(`${engine}: ${errors.length} page errors, first: ${errors[0]}`);
    }
}
await browser.close();

console.log(failures ? `\nFAIL (${failures})` : '\nOK');
process.exit(failures ? 1 : 0);
