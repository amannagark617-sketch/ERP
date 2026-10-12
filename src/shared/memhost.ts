import { Host } from './core';

export interface Persist { load(): string | null; save(json: string): void }

/** In-memory Host with optional persistence. Used by the tests and the local dev server. */
export function createMemHost(persist?: Persist, now: () => string = () => new Date().toISOString()): Host {
  type Sheet = { headers: string[]; rows: Record<string, any>[] };
  let db: { sheets: Record<string, Sheet>; files: Record<string, { name: string; mime: string; base64: string }> } = { sheets: {}, files: {} };
  try { const raw = persist?.load(); if (raw) db = JSON.parse(raw); } catch { /* start empty */ }
  const cache = new Map<string, { v: string; exp: number }>();
  let n = 0;
  const save = () => { try { persist?.save(JSON.stringify(db)); } catch { /* storage full */ } };
  const sheet = (book: string, name: string) => { const s = db.sheets[book + '/' + name]; if (!s) throw new Error('No sheet ' + name); return s; };
  const rnd = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); });

  return {
    now,
    uuid: () => rnd() + (n++ ? '' : ''),
    ensureSheet(book, name, headers) {
      const s = db.sheets[book + '/' + name] ?? (db.sheets[book + '/' + name] = { headers: [], rows: [] });
      headers.forEach(h => { if (!s.headers.includes(h)) s.headers.push(h); });
      save();
    },
    read(book, name) { const s = db.sheets[book + '/' + name]; return s ? s.rows.map((r, i) => ({ ...r, __row: i + 2 })) : []; },
    append(book, name, row) { const s = sheet(book, name); s.rows.push({ ...row }); save(); return s.rows.length + 1; },
    update(book, name, idx, row) { const s = sheet(book, name); s.rows[idx - 2] = { ...s.rows[idx - 2], ...row }; save(); },
    remove(book, name, idx) { sheet(book, name).rows.splice(idx - 2, 1); save(); },
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
  };
}
