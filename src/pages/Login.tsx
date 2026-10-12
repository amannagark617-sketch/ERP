import { useState } from 'react';
import { api, disconnect, getApiUrl, saveApiUrl } from '../api';
import { goLogin, goSetup, login } from '../store';
import { Field } from '../ui';
import { SERVER_URL } from '../serverUrl';

/** Shown only when the server URL has not been set in src/serverUrl.ts. */
export function Setup() {
  const [url, setUrl] = useState(getApiUrl());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true); setErr('');
    try {
      saveApiUrl(url);
      await api.ping();
      goLogin();
    } catch (e) { disconnect(); setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="authbox">
      <h2>Connect to your Google Sheet</h2>
      <p className="mut">Paste the <b>Web app URL</b> you got when deploying the Apps Script (see README → "Connect Google Sheets").</p>
      <Field label="Web app URL"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" /></Field>
      {err && <div className="warn">{err}</div>}
      <div className="row">
        <button className="btn primary" disabled={!url.trim() || busy} onClick={connect}>{busy ? 'Connecting…' : 'Connect'}</button>
      </div>
      <p className="mut" style={{ marginTop: 12 }}>This is remembered in this browser only. To connect every user automatically, put the URL in <code>src/serverUrl.ts</code>.</p>
    </div>
  );
}

export function Login({ notice }: { notice?: string }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(notice ?? '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr('');
    try { await login(id, pw); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="authbox">
      <h2>Little Nap ERP</h2>
      <p className="mut">Sign in with your Login ID and password.</p>
      <Field label="Login ID"><input value={id} autoFocus autoCapitalize="off" onChange={e => setId(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></Field>
      <Field label="Password"><input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></Field>
      {err && <div className="warn">{err}</div>}
      <button className="btn primary" disabled={busy || !id || !pw} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {!SERVER_URL && <p style={{ marginTop: 14 }}><a href="#" onClick={e => { e.preventDefault(); goSetup(); }}>Change server connection</a></p>}
    </div>
  );
}
