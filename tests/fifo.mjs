// FIFO stock valuation: the Copper Wire example from the requirements.
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'erp-fifo-'));
writeFileSync(join(dir, 'e.ts'), `export * from '${process.cwd()}/src/domain';`);
await build({ entryPoints: [join(dir, 'e.ts')], bundle: true, format: 'esm', outfile: join(dir, 'b.mjs'), platform: 'node', logLevel: 'error' });
const { fifo, fifoValue, fifoPreview } = await import(join(dir, 'b.mjs'));

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

// stock added WITHOUT a typed cost is priced automatically: latest purchase price, else the price list
const s2 = {
  stockBase: {}, items: [], pos: [],
  vendors: [{ id: 'V1', active: true, items: [{ itemId: 'N', brand: '', price: 90 }, { itemId: 'W', brand: '', price: 999 }] }],
  receipts: [rc('R1', '2026-01-10', 20, 120)],
  stock: [
    { id: 'A0', date: '2026-01-01', itemId: 'N', brand: '', type: 'ADJUST', qty: 4, note: 'Opening stock' },          // nothing bought yet -> price list (90)
    { id: 'A1', date: '2026-01-15', itemId: 'W', brand: '', type: 'ADJUST', qty: 5, note: 'count correction' },      // latest purchase of W = 120
    { id: 'O1', date: '2026-01-20', itemId: 'W', brand: '', type: 'OUT', qty: 22, toDept: 'P', note: '' },
    { id: 'O2', date: '2026-01-21', itemId: 'N', brand: '', type: 'OUT', qty: 3, toDept: 'P', note: '' },
  ],
};
const f4 = fifo(s2);
assert.equal(fifoValue(f4, 'N').unknown, false); assert.equal(f4.cost.O2, 270, 'opening stock without a cost uses the price list');
assert.equal(f4.cost.O1, 20 * 120 + 2 * 120, 'adjustment took the latest purchase price (120)');
const f5 = fifo({ ...s2, vendors: [] });
assert.equal(fifoValue(f5, 'N').unknown, true, 'no purchase and no price list: flagged, never invented');
assert.equal(fifoPreview(f4, 'N', '', 1).cost, 90); assert.equal(fifoPreview(f4, 'N', '', 5).short, 4);
console.log('FIFO tests passed');
