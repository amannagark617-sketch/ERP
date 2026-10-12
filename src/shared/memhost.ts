import { Host } from './core';

export interface Persist { load(): string | null; save(json: string): void }

/** In-memory Host with optional persistence. Used by the tests and the local dev server. */
export function createMemHost(persist?: Persist, now: () => string = () => new Date().toISOString()): Host {
  type Sheet = { headers: string[]; rows: Record<string, any>[] };
  let db: { sheets: Record<string, Sheet>; files: Record<string, { name: string; mime: string; base64: string }>; stamp: number } = { sheets: {}, files: {}, stamp: 0 };
  try { const raw = persist?.load(); if (raw) db = JSON.parse(raw); } catch { /* start empty */ }
  const cache = new Map<string, { v: string; exp: number }>();
  const save = () => { try { persist?.save(JSON.stringify(db)); } catch { /* storage full */ } };
  const sheet = (name: string) => { const s = db.sheets[name]; if (!s) throw new Error('No sheet ' + name); return s; };
  const rnd = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); });

  return {
    now,
    uuid: rnd,
    ensureSheet(name, headers) {
      const s = db.sheets[name] ?? (db.sheets[name] = { headers: [], rows: [] });
      headers.forEach(h => { if (s.headers.indexOf(h) < 0) s.headers.push(h); });
      save();
    },
    read(name) { const s = db.sheets[name]; return s ? s.rows.map((r, i) => ({ ...r, __row: i + 2 })) : []; },
    append(name, row) { const s = sheet(name); s.rows.push({ ...row }); save(); return s.rows.length + 1; },
    update(name, idx, row) { const s = sheet(name); s.rows[idx - 2] = { ...s.rows[idx - 2], ...row }; save(); },
    remove(name, idx) { sheet(name).rows.splice(idx - 2, 1); save(); },
    renameHeader(name, from, to) {
      const s = db.sheets[name];
      if (!s || !s.headers.includes(from) || s.headers.includes(to)) return;
      s.headers = s.headers.map(h => (h === from ? to : h));
      s.rows.forEach(r => { if (from in r) { r[to] = r[from]; delete r[from]; } });
      save();
    },
    withLock: fn => fn(),
    cacheGet(k) { const c = cache.get(k); if (!c || c.exp < Date.now()) { cache.delete(k); return null; } return c.v; },
    cachePut(k, v, ttl) { cache.set(k, { v, exp: Date.now() + ttl * 1000 }); },
    cacheRemove(k) { cache.delete(k); },
    saveFile(folderId, _sub, name, mime, base64) {
      const id = 'file-' + rnd().slice(0, 13);
      db.files[id] = { name, mime, base64 };
      save();
      return { id, folderId: folderId || 'local' };
    },
    readFile(id) { const f = db.files[id]; if (!f) throw new Error('File not found'); return f; },
    stamp: () => String(db.stamp),
    bumpStamp: () => { db.stamp += 1; },
  };
}
