// FIFO stock valuation: the Copper Wire example from the requirements.
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'erp-fifo-'));
writeFileSync(join(dir, 'e.ts'), `export * from '${process.cwd()}/src/domain';`);
await build({ entryPoints: [join(dir, 'e.ts')], bundle: true, format: 'esm', outfile: join(dir, 'b.mjs'), platform: 'node', logLevel: 'error' });
const { fifo, fifoValue } = await import(join(dir, 'b.mjs'));

const rc = (id, date, qty, price) => ({ id, grnNo: id, invoiceNo: 'INV-' + id, receivedDate: date, lines: [{ itemId: 'W', brand: '', qty, price, taxRate: 0 }] });
const s = {
  stockBase: {}, vendors: [], pos: [], items: [],
  receipts: [rc('R3', '2026-01-20', 15, 150), rc('R2', '2026-01-10', 20, 120)],   // deliberately out of order
  stock: [
    { id: 'A1', date: '2026-01-01', itemId: 'W', brand: '', type: 'ADJUST', qty: 10, price: 100, note: 'Opening stock' },
    { id: 'O1', date: '2026-01-25', itemId: 'W', brand: '', type: 'OUT', qty: 15, toDept: 'Production', note: '' },
  ],
};
const f = fifo(s);
assert.equal(f.cost.O1, 1600, 'issue of 15 = 10 x 100 + 5 x 120');
const v = fifoValue(f, 'W');
assert.equal(v.qty, 30); assert.equal(v.value, 4050); assert.equal(v.unknown, false);
assert.deepEqual(f.batches['W|'].map(b => b.remaining), [0, 15, 15]);

// brands are separate queues; opening stock without a cost is flagged
s.stock.push({ id: 'A2', date: '2026-02-01', itemId: 'W', brand: 'acme', type: 'ADJUST', qty: 5, note: 'x' });
const f2 = fifo(s);
assert.equal(fifoValue(f2, 'W', 'acme').unknown, true);
assert.equal(fifoValue(f2, 'W', '').value, 4050);

// a later receipt never jumps the queue
s.receipts.push(rc('R4', '2026-02-02', 10, 200));
s.stock.push({ id: 'O2', date: '2026-02-03', itemId: 'W', brand: '', type: 'OUT', qty: 20, toDept: 'P', note: '' });
const f3 = fifo(s);
assert.equal(f3.cost.O2, 15 * 120 + 5 * 150, '15 left of batch 2, then 5 from batch 3');
console.log('FIFO tests passed');
