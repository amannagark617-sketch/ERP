import { Op } from './model';
import { User, ApprovalRule, RoleInfo } from './types';
import { SERVER_URL } from './serverUrl';

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
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/** Where the Google Apps Script web app lives: serverUrl.ts, else VITE_API_URL, else pasted on the first screen. */
export const getApiUrl = (): string => SERVER_URL || (import.meta as any).env?.VITE_API_URL || ls.get(URL_KEY) || '';
export const isConnected = () => !!getApiUrl();
export const saveApiUrl = (url: string) => ls.set(URL_KEY, url.trim());
export const disconnect = () => ls.del(URL_KEY);

async function call(req: Record<string, unknown>): Promise<any> {
  const url = getApiUrl();
  if (!url) throw new ApiError('No server connected', 'SETUP');
  let res: any;
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req) });
  } catch {
    throw new ApiError('Cannot reach the server. Check the internet connection and the Web app URL.', 'NETWORK');
  }
  try { res = await r.json(); } catch { throw new ApiError('The server did not return valid data. Is the Web app URL correct and access set to "Anyone"?', 'NETWORK'); }
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
