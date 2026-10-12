import { handle } from './shared/core';
import { createMemHost } from './shared/memhost';
import { setup } from './shared/core';
import { Op } from './model';
import { User, ApprovalRule, RoleInfo } from './types';
import { today } from './utils';

export class ApiError extends Error {
  constructor(message: string, public code = 'ERROR') { super(message); }
}

export interface Boot {
  user: User;
  config: { settings: Record<string, string>; roles: RoleInfo[]; approvalRules: ApprovalRule[] };
  data: Record<string, any[]>;
}
export interface Applied { applied: { table: string; row: any }[]; deleted: { table: string; id: string }[] }

const URL_KEY = 'littlenap-api-url';
const MODE_KEY = 'littlenap-mode';
const DEMO_DB = 'littlenap-demo-db';

export type Mode = 'remote' | 'local' | 'unset';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export function getMode(): Mode {
  if (ls.get(MODE_KEY) === 'local') return 'local';
  if (ls.get(URL_KEY) || (import.meta as any).env?.VITE_API_URL) return 'remote';
  return 'unset';
}
export const getApiUrl = () => ls.get(URL_KEY) || (import.meta as any).env?.VITE_API_URL || '';
export function useRemote(url: string) { ls.set(URL_KEY, url.trim()); ls.del(MODE_KEY); }
export function useDemo() { ls.set(MODE_KEY, 'local'); }
export function disconnect() { ls.del(URL_KEY); ls.del(MODE_KEY); }
export function resetDemo() { ls.del(DEMO_DB); localHost = null; }

let localHost: ReturnType<typeof createMemHost> | null = null;
function demoHost() {
  if (!localHost) {
    localHost = createMemHost({ load: () => ls.get(DEMO_DB), save: s => ls.set(DEMO_DB, s) }, () => new Date().toISOString());
    if (!localHost.read('Users').length) setup(localHost, true, today());
  }
  return localHost;
}

async function call(req: Record<string, unknown>): Promise<any> {
  let res: any;
  if (getMode() === 'local') {
    res = handle(demoHost(), JSON.parse(JSON.stringify(req)));
  } else {
    const url = getApiUrl();
    if (!url) throw new ApiError('No server connected', 'SETUP');
    let r: Response;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req) });
    } catch {
      throw new ApiError('Cannot reach the server. Check the internet connection and the Web app URL.', 'NETWORK');
    }
    try { res = await r.json(); } catch { throw new ApiError('The server did not return valid data. Is the Web app URL correct and set to "Anyone"?', 'NETWORK'); }
  }
  if (!res.ok) throw new ApiError(res.error || 'Request failed', res.code);
  return res;
}

export const api = {
  ping: () => call({ action: 'ping' }),
  login: (loginId: string, password: string): Promise<{ token: string; user: User }> => call({ action: 'login', loginId, password }),
  logout: (token: string) => call({ action: 'logout', token }).catch(() => undefined),
  bootstrap: (token: string): Promise<Boot> => call({ action: 'bootstrap', token }),
  commit: (token: string, name: string, ops: Op[]): Promise<Applied> => call({ action: 'commit', token, name, ops }),
  upload: (token: string, folder: string, f: { name: string; mime: string; base64: string }): Promise<{ fileId: string }> =>
    call({ action: 'upload', token, folder, name: f.name, mime: f.mime, data: f.base64 }),
  file: (token: string, fileId: string): Promise<{ name: string; mime: string; base64: string }> => call({ action: 'file', token, fileId }),
  changePassword: (token: string, oldPassword: string, newPassword: string) => call({ action: 'changePassword', token, oldPassword, newPassword }),
  usersList: (token: string): Promise<{ users: any[]; roles: RoleInfo[] }> => call({ action: 'users.list', token }),
  usersSave: (token: string, user: any): Promise<{ users: any[]; roles: RoleInfo[] }> => call({ action: 'users.save', token, user }),
};
