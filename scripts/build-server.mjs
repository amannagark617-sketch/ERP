// Bundles src/shared/core.ts + apps-script/host.gs into one paste-able apps-script/Code.gs
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const out = await build({
  entryPoints: ['src/shared/core.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Core',
  target: 'es2019',
  legalComments: 'none',
});
const header = '// GENERATED FILE - do not edit by hand. Run `npm run build:server` after changing src/shared/*.\n';
const core = out.outputFiles[0].text;
const host = readFileSync('apps-script/host.gs', 'utf8');
writeFileSync('apps-script/Code.gs', header + host + '\n// ===================== bundled server logic (src/shared) =====================\n' + core);
console.log('apps-script/Code.gs written (' + Math.round((header.length + host.length + core.length) / 1024) + ' KB)');
