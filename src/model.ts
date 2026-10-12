import { DATA_TABLES, TableKey } from './shared/schema';
import { AppState } from './types';
import { lineKey } from './shared/keys';

/** Flat rows exactly as stored in the Google Sheet tabs. */
export type Flat = Record<TableKey, any[]>;
export const emptyFlat = (): Flat => Object.fromEntries(DATA_TABLES.map(k => [k, []])) as unknown as Flat;

const by = (rows: any[], key: string, id: string) => rows.filter(r => r[key] === id);

/** Sheet rows → nested objects the screens work with. */
export function nest(f: Flat, stockBase: Record<string, number> = {}): AppState {
  const ins = f.stock.filter(s => s.type === 'IN');
  return {
    items: f.items.map(x => ({ ...x })),
    vendors: f.vendors.map(v => ({
      ...v,
      items: by(f.prices, 'vendorId', v.id).map(({ id: _i, vendorId: _v, vendorName: _n, itemName: _m, brand, ...rest }) => ({ ...rest, brand: brand ?? '' })),
    })),
    pos: f.pos.map(p => ({
      ...p,
      route: p.route ? String(p.route).split(',') : [],
      lines: by(f.poLines, 'poId', p.id).map(({ id: _i, poId: _p, poNo: _n, itemName: _m, brand, ...rest }) => ({ ...rest, brand: brand ?? '' })),
    })),
    receipts: f.receipts.map(r => ({
      ...r,
      lines: by(ins, 'receiptId', r.id).map(({ id: _i, receiptId: _r, date: _d, type: _t, itemName: _m, grnNo: _g, toDept: _x, note: _o, by: _b, brand, ...rest }) => ({ ...rest, brand: brand ?? '' })),
    })),
    payments: f.payments.map(x => ({ ...x })),
    stock: f.stock.filter(s => s.type !== 'IN').map(x => ({ ...x })),
    stockBase,
  } as AppState;
}

/** Nested objects → Sheet rows. */
export function flatten(s: AppState): Flat {
  const f = emptyFlat();
  f.items = s.items.map(x => ({ ...x }));
  for (const { items, ...v } of s.vendors) {
    f.vendors.push(v);
    items.forEach(i => f.prices.push({ ...i, id: lineKey(v.id, i.itemId, i.brand), vendorId: v.id }));
  }
  for (const { lines, route, ...p } of s.pos) {
    f.pos.push({ ...p, route: route.join(',') });
    lines.forEach(l => f.poLines.push({ ...l, id: lineKey(p.id, l.itemId, l.brand), poId: p.id }));
  }
  for (const { lines, ...r } of s.receipts) {
    f.receipts.push(r);
    lines.forEach(l => f.stock.push({ ...l, id: lineKey(r.id, l.itemId, l.brand), receiptId: r.id, type: 'IN', date: r.receivedDate, toDept: '', note: '' }));
  }
  f.payments = s.payments.map(x => ({ ...x }));
  f.stock.push(...s.stock.map(x => ({ ...x })));
  return f;
}

export interface Op { t: 'upsert' | 'delete'; table: TableKey; row?: any; id?: string }

// Helper / display columns are filled in by the server and must not count as changes.
const IGNORE = new Set(['_at', '_by', '_v', '__row', 'vendorName', 'itemName', 'poNo', 'grnNo', 'createdBy', 'department', 'paidBy', 'by', 'queryBy']);
const strip = (r: any) => {
  const o: any = {};
  Object.keys(r).filter(k => !IGNORE.has(k)).sort().forEach(k => { o[k] = r[k]; });
  return JSON.stringify(o);
};

/** Changes needed to turn `a` into `b`. */
export function diff(a: Flat, b: Flat): Op[] {
  const ops: Op[] = [];
  for (const k of DATA_TABLES) {
    const before = new Map<string, any>(a[k].map(r => [r.id, r]));
    const after = new Set<string>();
    for (const r of b[k]) {
      after.add(r.id);
      const old = before.get(r.id);
      if (!old || strip(old) !== strip(r)) ops.push({ t: 'upsert', table: k, row: r });
    }
    for (const id of before.keys()) if (!after.has(id)) ops.push({ t: 'delete', table: k, id });
  }
  return ops;
}
