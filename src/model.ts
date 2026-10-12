import { DATA_TABLES, TableKey } from './shared/schema';
import { AppState } from './types';

/** Flat rows exactly as stored in the Google Sheet tabs. */
export type Flat = Record<TableKey, any[]>;
export const emptyFlat = (): Flat => Object.fromEntries(DATA_TABLES.map(k => [k, []])) as unknown as Flat;

const by = <T extends Record<string, any>>(rows: T[], key: string, id: string) => rows.filter(r => r[key] === id);

/** Sheet rows → nested objects the screens work with. */
export function nest(f: Flat): AppState {
  return {
    items: f.items.map(x => ({ ...x })),
    vendors: f.vendors.map(v => ({
      ...v,
      items: by(f.vendorItems, 'vendorId', v.id).map(({ id: _i, vendorId: _v, ...rest }) => rest),
    })),
    pos: f.pos.map(p => ({
      ...p,
      route: p.route ? String(p.route).split(',') : [],
      lines: by(f.poLines, 'poId', p.id).map(({ id: _i, poId: _p, ...rest }) => rest),
      history: by(f.poHistory, 'poId', p.id).map(({ poId: _p, ...rest }) => rest),
    })),
    receipts: f.receipts.map(r => ({
      ...r,
      lines: by(f.receiptLines, 'receiptId', r.id).map(({ id: _i, receiptId: _r, ...rest }) => rest),
    })),
    payments: f.payments.map(x => ({ ...x })),
    openings: f.openings.map(x => ({ ...x })),
    queries: f.queries.map(x => ({ ...x })),
  } as AppState;
}

/** Nested objects → Sheet rows. */
export function flatten(s: AppState): Flat {
  const f = emptyFlat();
  f.items = s.items.map(x => ({ ...x }));
  for (const { items, ...v } of s.vendors) {
    f.vendors.push(v);
    items.forEach(i => f.vendorItems.push({ ...i, id: `${v.id}:${i.itemId}`, vendorId: v.id }));
  }
  for (const { lines, history, route, ...p } of s.pos) {
    f.pos.push({ ...p, route: route.join(',') });
    lines.forEach(l => f.poLines.push({ ...l, id: `${p.id}:${l.itemId}`, poId: p.id }));
    history.forEach(h => f.poHistory.push({ ...h, poId: p.id }));
  }
  for (const { lines, ...r } of s.receipts) {
    f.receipts.push(r);
    lines.forEach(l => f.receiptLines.push({ ...l, id: `${r.id}:${l.itemId}`, receiptId: r.id }));
  }
  f.payments = s.payments.map(x => ({ ...x }));
  f.openings = s.openings.map(x => ({ ...x }));
  f.queries = s.queries.map(x => ({ ...x }));
  return f;
}

export interface Op { t: 'upsert' | 'delete'; table: TableKey; row?: any; id?: string }

const strip = (r: any) => { const { _at, _by, _v, __row, ...rest } = r; return JSON.stringify(rest, Object.keys(rest).sort()); };

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
