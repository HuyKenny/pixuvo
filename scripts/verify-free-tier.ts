/**
 * verify:free-tier — compares real usage with the Workers/D1 FREE limits
 * (verified 2026-10-01 in Cloudflare docs; the account is on Workers Paid, but
 * Pixuvo is designed to stay inside free limits). Exit 1 on a hard breach.
 *   - static files in dist/client vs 20 000 (stop at 18 000)
 *   - D1 size (this DB vs 500 MB, account vs 5 GB)
 *   - last 24 h: Worker requests vs 100 000/day (account-wide), CPU p50/p99 vs 10 ms
 *   - last 24 h: D1 rows read vs 5 M, rows written vs 100 k (account-wide)
 *   - query plans of the hot queries (no full scans of games)
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'remote' }, 'skip-analytics': { type: 'boolean', default: false } } });
const cfg = loadConfig();
const LIMIT = { files: 20_000, fileStop: 18_000, dbBytes: 500e6, accountBytes: 5e9, requests: 100_000, cpuMs: 10, rowsRead: 5_000_000, rowsWritten: 100_000 };
const rows: Array<[string, string, string, 'ok' | 'warn' | 'FAIL']> = [];
const add = (what: string, value: string, limit: string, status: 'ok' | 'warn' | 'FAIL') => rows.push([what, value, limit, status]);
const lvl = (v: number, lim: number): 'ok' | 'warn' | 'FAIL' => (v > lim ? 'FAIL' : v > lim * 0.7 ? 'warn' : 'ok');

function count(dir: string): number {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? count(join(dir, e.name)) : e.name === '.assetsignore' ? 0 : 1;
  return n;
}
if (existsSync('dist/client')) {
  const n = count('dist/client');
  add('static files (this build)', String(n), `${LIMIT.fileStop} stop / ${LIMIT.files}`, n > LIMIT.fileStop ? 'FAIL' : lvl(n, LIMIT.fileStop));
}

const auth: Record<string, string> = cfg.CLOUDFLARE_API_TOKEN ? { authorization: `Bearer ${cfg.CLOUDFLARE_API_TOKEN}` } : { 'x-auth-email': cfg.CF_EMAIL ?? '', 'x-auth-key': cfg.CF_API_KEY ?? '' };
const acct = cfg.CF_ACCOUNT_ID!;
const api = async (path: string, init: RequestInit = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { ...auth, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  return (await r.json()) as { result?: unknown; data?: unknown; errors?: unknown };
};

if (values.target === 'remote') {
  const dbs = ((await api(`/accounts/${acct}/d1/database?per_page=100`)).result ?? []) as Array<{ name: string; uuid: string; file_size?: number }>;
  const me = dbs.find((d) => d.uuid === cfg.CF_D1_DATABASE_ID);
  let mine = me?.file_size ?? 0;
  if (!mine) mine = (((await api(`/accounts/${acct}/d1/database/${cfg.CF_D1_DATABASE_ID}`)).result ?? {}) as { file_size?: number }).file_size ?? 0;
  const total = dbs.reduce((a, d) => a + (d.file_size ?? 0), 0);
  add('D1 size pixuvo-production', `${(mine / 1e6).toFixed(1)} MB`, '500 MB', lvl(mine, LIMIT.dbBytes));
  add(`D1 size account (${dbs.length} DBs)`, `${(total / 1e6).toFixed(1)} MB`, '5 GB', lvl(total, LIMIT.accountBytes));

  if (!values['skip-analytics']) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const q = `query($a: String!, $since: Time!, $date: Date!) { viewer { accounts(filter: {accountTag: $a}) {
      all: workersInvocationsAdaptive(limit: 10000, filter: {datetime_geq: $since}) { sum { requests } }
      px: workersInvocationsAdaptive(limit: 10, filter: {datetime_geq: $since, scriptName: "pixuvo"}) { sum { requests errors } quantiles { cpuTimeP50 cpuTimeP99 } }
      d1: d1AnalyticsAdaptiveGroups(limit: 10000, filter: {date_geq: $date}) { sum { rowsRead rowsWritten } dimensions { databaseId } } } } }`;
    const res = (await api('/graphql', { method: 'POST', body: JSON.stringify({ query: q, variables: { a: acct, since, date: since.slice(0, 10) } }) })) as {
      data?: { viewer: { accounts: Array<{ all: Array<{ sum: { requests: number } }>; px: Array<{ sum: { requests: number; errors: number }; quantiles: { cpuTimeP50: number; cpuTimeP99: number } }>; d1: Array<{ sum: { rowsRead: number; rowsWritten: number }; dimensions: { databaseId: string } }> }> } };
      errors?: unknown;
    };
    const a = res.data?.viewer.accounts[0];
    if (!a) add('analytics', `unavailable: ${JSON.stringify(res.errors).slice(0, 120)}`, '-', 'warn');
    else {
      const reqAll = a.all.reduce((s, x) => s + x.sum.requests, 0);
      const reqPx = a.px.reduce((s, x) => s + x.sum.requests, 0);
      const errs = a.px.reduce((s, x) => s + x.sum.errors, 0);
      const p50 = Math.max(0, ...a.px.map((x) => x.quantiles.cpuTimeP50 / 1000));
      const p99 = Math.max(0, ...a.px.map((x) => x.quantiles.cpuTimeP99 / 1000));
      add('Worker requests 24 h (account)', String(reqAll), '100 000/day', lvl(reqAll, LIMIT.requests));
      add('Worker requests 24 h (pixuvo)', `${reqPx} (${errs} errors)`, '-', 'ok');
      add('Worker CPU p50 / p99 (pixuvo)', `${p50.toFixed(2)} / ${p99.toFixed(2)} ms`, '10 ms', p99 > LIMIT.cpuMs ? 'warn' : 'ok');
      const rr = a.d1.reduce((s, x) => s + x.sum.rowsRead, 0);
      const rw = a.d1.reduce((s, x) => s + x.sum.rowsWritten, 0);
      const mineRw = a.d1.filter((x) => x.dimensions.databaseId === cfg.CF_D1_DATABASE_ID).reduce((s, x) => s + x.sum.rowsWritten, 0);
      add('D1 rows read since yesterday (account)', String(rr), '5 M/day', lvl(rr, LIMIT.rowsRead * 2));
      add('D1 rows written since yesterday (account)', `${rw} (pixuvo ${mineRw})`, '100 k/day', lvl(rw, LIMIT.rowsWritten * 2));
    }
  }
}

const db = openTarget(values.target!, cfg);
const PLANS: Array<[string, string, Array<string | number>]> = [
  ['category page', "SELECT g.id FROM game_categories gc JOIN games g ON g.id = gc.game_id WHERE gc.category_id = 1 AND gc.published = 1 ORDER BY gc.rank_score DESC, gc.game_id LIMIT 48", []],
  ['featured', "SELECT id FROM games WHERE status = 'published' ORDER BY rank_score DESC, id DESC LIMIT 36", []],
  ['newest', "SELECT id FROM games WHERE status = 'published' ORDER BY added_at DESC, id DESC LIMIT 96", []],
  ['directory', "SELECT id FROM games WHERE dir_seq > 100 AND dir_seq <= 148 AND status = 'published' ORDER BY dir_seq DESC LIMIT 48", []],
  ['game by slug', "SELECT id FROM games WHERE slug = 'x' LIMIT 1", []],
  ['search', "SELECT g.id FROM games_fts f JOIN games g ON g.id = f.rowid WHERE games_fts MATCH '\"car\"*' AND g.status = 'published' LIMIT 8", []],
];
for (const [name, sql, p] of PLANS) {
  const plan = (await db.all<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, p)).rows.map((r) => r.detail).join(' | ');
  const bad = /SCAN g\b(?! USING)|SCAN games\b(?! USING)|USE TEMP B-TREE FOR ORDER BY/.test(plan) && name !== 'search';
  add(`plan: ${name}`, plan.slice(0, 110), 'index use', bad ? 'warn' : 'ok');
}
db.close?.();

const w = Math.max(...rows.map((r) => r[0].length));
for (const [a, b, c, d] of rows) console.log(`${d.padEnd(4)}  ${a.padEnd(w)}  ${b}  (limit ${c})`);
process.exit(rows.some((r) => r[3] === 'FAIL') ? 1 : 0);
