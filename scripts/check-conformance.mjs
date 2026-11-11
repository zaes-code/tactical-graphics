#!/usr/bin/env node
/**
 * `npm run check:conformance`: runs the internal conformance report's staleness check.
 *
 * A wrapper so that the published package.json names no internal path: the scripts block
 * ships with every release, and this folder does not. Where the report is absent, as in a
 * copy of the repository without the internal notes, there is nothing to check.
 */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const report = path.join(root, 'ai', 'conformance', 'build-report.mjs');
if (!existsSync(report)) {
    console.log('conformance: no report in this copy; nothing to check');
    process.exit(0);
}
const r = spawnSync(process.execPath, [report, '--check', ...process.argv.slice(2)], {stdio: 'inherit'});
process.exit(r.status ?? 1);
