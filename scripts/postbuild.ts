/**
 * Post-build guards (fail the build instead of shipping something wrong):
 *  - static asset count ≤ ASSET_STOP (free plan limit 20 000 per version, we stop at 18 000)
 *  - single asset ≤ 25 MiB
 *  - the Worker bundle must not contain the catalog snapshot
 *  - no run_worker_first / images / sessions in the generated wrangler.json
 * and writes dist/client/_headers with security headers for static files.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECURITY_HEADERS } from '../src/lib/security.ts';

const ASSET_STOP = Number(process.env.ASSET_STOP ?? 18_000);
const CLIENT = 'dist/client';
const SERVER = 'dist/server';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const errors: string[] = [];
const assets = walk(CLIENT).filter((p) => !p.endsWith('/.assetsignore'));
const big = assets.filter((p) => statSync(p).size > 25 * 1024 * 1024);
if (assets.length > ASSET_STOP) errors.push(`static assets: ${assets.length} > stop limit ${ASSET_STOP}`);
if (big.length) errors.push(`assets over 25 MiB: ${big.join(', ')}`);

let serverBytes = 0;
for (const f of walk(SERVER)) {
  if (f.includes('/.prerender/')) continue;
  const st = statSync(f);
  serverBytes += st.size;
  if (/\.m?js$/.test(f) && st.size > 200_000) {
    const txt = readFileSync(f, 'utf8');
    if (txt.includes('"categoryPages"') || txt.includes('"maxDirSeq"')) errors.push(`Worker bundle contains the catalog snapshot: ${f}`);
  }
}
if (existsSync(join(SERVER, '.prerender'))) errors.push('dist/server/.prerender left behind after build');

const wr = JSON.parse(readFileSync(join(SERVER, 'wrangler.json'), 'utf8')) as Record<string, unknown>;
const assetsCfg = (wr.assets ?? {}) as Record<string, unknown>;
if (assetsCfg.run_worker_first) errors.push('assets.run_worker_first is set — every static request would invoke the Worker');
if (wr.images) errors.push('Cloudflare Images binding present in generated config');
if (Array.isArray(wr.kv_namespaces) && wr.kv_namespaces.length) errors.push('KV namespace present (sessions?) in generated config');

const headerLines = Object.entries(SECURITY_HEADERS).map(([k, v]) => `  ${k}: ${v}`).join('\n');
const existing = existsSync(join(CLIENT, '_headers')) ? readFileSync(join(CLIENT, '_headers'), 'utf8') : '';
const preview = process.env.PUBLIC_NOINDEX === '1' ? '  X-Robots-Tag: noindex, nofollow\n' : '';
writeFileSync(join(CLIENT, '_headers'), `/*\n${headerLines}\n${preview}\n${existing}`);

const html = assets.filter((p) => p.endsWith('.html')).length;
console.log(`postbuild: ${assets.length} static files (${html} HTML pages), Worker bundle ${(serverBytes / 1024 / 1024).toFixed(2)} MB`);
if (errors.length) {
  console.error('postbuild FAILED:\n - ' + errors.join('\n - '));
  process.exit(1);
}
