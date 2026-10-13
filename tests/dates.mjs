// One date format: DD-MMM-YYYY shown and stored in the Sheet; any common way of typing is understood.
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'erp-dates-'));
writeFileSync(join(dir, 'e.ts'), `export * from '${process.cwd()}/src/shared/dates'; export * from '${process.cwd()}/src/shared/core'; export * from '${process.cwd()}/src/shared/memhost';`);
await build({ entryPoints: [join(dir, 'e.ts')], bundle: true, format: 'esm', outfile: join(dir, 'b.mjs'), platform: 'node', logLevel: 'error' });
const M = await import(join(dir, 'b.mjs'));

for (const typed of ['2026-10-05', '05-10-2026', '5/10/2026', '05.10.26', '05-Oct-2026', '5 oct 2026', '05/OCT/2026', '5 October 2026']) assert.equal(M.parseDate(typed), '2026-10-05', typed);
assert.equal(M.showDate('2026-10-05'), '05-Oct-2026'); assert.equal(M.showDate('05/10/2026'), '05-Oct-2026'); assert.equal(M.showDate(''), '');
assert.equal(M.parseDate('31-02-2026'), '31-02-2026', 'impossible dates are left alone, not guessed');
assert.equal(M.parseDate('soon'), 'soon');
// timestamps: shown in Indian time, round-trip exactly
const iso = '2026-10-05T20:30:15.000Z';
assert.equal(M.showDateTime(iso), '06-Oct-2026 02:00:15');
assert.equal(M.parseDateTime('06-Oct-2026 02:00:15'), '2026-10-05T20:30:15.000Z');
assert.equal(M.parseDateTime('06/10/2026 02:00'), '2026-10-05T20:30:00.000Z');

// an existing sheet with old-style dates is converted by setup(), and the app still reads it
const h = M.createMemHost();
M.setup(h);
h.append('Stock', { Date: '2026-03-04', 'Item ID': 'I1', Item: 'x', Type: 'ADJUST', Quantity: 5, Key: 's1', 'Updated At': '2026-03-04T10:00:00.000Z' });
h.append('Stock', { Date: '5/3/2026', 'Item ID': 'I1', Type: 'ADJUST', Quantity: 1, Key: 's2' });
M.setup(h);
const rows = h.read('Stock');
assert.equal(rows[0]['Date'], '04-Mar-2026'); assert.equal(rows[0]['Updated At'], '04-Mar-2026 15:30:00');
assert.equal(rows[1]['Date'], '05-Mar-2026', 'typed day-first, stored in the standard form');
const before = JSON.stringify(h.read('Stock')); M.setup(h);
assert.equal(JSON.stringify(h.read('Stock')), before, 'setup is repeatable');
console.log('Date tests passed');
