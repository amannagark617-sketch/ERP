// Local stand-in for the Apps Script web app (same protocol, in-memory sheets). For browser tests only.
//   node tests/devserver.mjs [--empty] [port]
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const empty = process.argv.includes('--empty') || process.argv.includes('--sample');
const sample = process.argv.includes('--sample');
const port = Number(process.argv.find(a => /^\d+$/.test(a))) || 8787;
const dir = mkdtempSync(join(tmpdir(), 'erp-dev-'));
writeFileSync(join(dir, 'e.ts'), `export * from '${process.cwd()}/src/shared/core'; export * from '${process.cwd()}/src/shared/memhost'; export * from '${process.cwd()}/tests/fixture';`);
await build({ entryPoints: [join(dir, 'e.ts')], bundle: true, format: 'esm', outfile: join(dir, 'b.mjs'), platform: 'node', logLevel: 'error' });
const M = await import(join(dir, 'b.mjs'));
const host = M.createMemHost();
M.setup(host, empty ? undefined : M.fixture(new Date().toISOString().slice(0, 10)));
if (empty) host.update('Users', host.read('Users')[0].__row, { Password: 'admin-pass' });
if (sample) console.log(M.loadSample(host, new Date().toISOString().slice(0, 10)));

createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.method === 'POST' ? M.handle(host, JSON.parse(body || '{}')) : { ok: true }));
  });
}).listen(port, () => console.log('dev server on ' + port));
