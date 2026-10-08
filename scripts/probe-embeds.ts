/**
 * Finds games whose embed is dead and takes them offline.
 *   tsx scripts/probe-embeds.ts --target local|remote [--limit 1500] [--dry-run] [--concurrency 6]
 *
 * GameMonetize embeds are tiny wrapper pages (`var gameUrl = '<developer URL>'`) that load the real game from the
 * developer's own domain; when that domain dies the page is blank (Line Rider: tinyleafgames.com, no DNS).
 * Per source we fetch the wrapper, pull out gameUrl and check its host (DNS) and the URL itself (404/410).
 * Other providers: the embed URL itself must not be 404/410.
 * Dead = NXDOMAIN, 404/410, or a refused connection. 403/429/5xx/timeouts are NOT dead (WAFs, rate limits).
 * A source is disabled (game archived, review_reason='dead_embed') only after it fails on two runs: the first
 * failure writes `verified_at` as NULL-safe marker via missing_since prefix 'probe:'. Rolling: oldest verified_at first.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';
import type { Stmt } from './import/db.ts';

export type Verdict = 'ok' | 'dead' | 'unknown';

export function extractGameUrl(html: string): string | null {
  const m = /var\s+gameUrl\s*=\s*(['"])(https:\/\/[^'"\s]+)\1/.exec(html);
  if (!m) return null;
  try {
    const u = new URL(m[2]!);
    if (isIP(u.hostname) || !u.hostname.includes('.') || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function verdictForStatus(status: number): Verdict {
  if (status === 404 || status === 410) return 'dead';
  return status < 400 || status === 403 || status === 401 ? 'ok' : 'unknown';
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function get(url: string): Promise<{ status: number; body: string } | 'refused' | 'timeout'> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
    const body = res.status < 400 ? (await res.text()).slice(0, 200_000) : '';
    return { status: res.status, body };
  } catch (e) {
    const code = String((e as { cause?: { code?: string } }).cause?.code ?? '');
    return /ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(code) ? 'refused' : 'timeout';
  }
}

const hostCache = new Map<string, Promise<Verdict>>();
function hostVerdict(host: string): Promise<Verdict> {
  let p = hostCache.get(host);
  if (!p) {
    p = lookup(host).then(() => 'ok' as Verdict, (e: { code?: string }) => (e.code === 'ENOTFOUND' ? 'dead' : 'unknown'));
    hostCache.set(host, p);
  }
  return p;
}

export async function probe(embedUrl: string): Promise<{ verdict: Verdict; why: string }> {
  const first = await get(embedUrl);
  if (first === 'timeout') return { verdict: 'unknown', why: 'timeout' };
  if (first === 'refused') return { verdict: 'dead', why: 'wrapper host unreachable' };
  const v = verdictForStatus(first.status);
  if (v !== 'ok') return { verdict: v, why: `wrapper HTTP ${first.status}` };
  const inner = extractGameUrl(first.body);
  if (!inner) return { verdict: 'ok', why: 'no wrapper' };
  const host = new URL(inner).hostname;
  const hv = await hostVerdict(host);
  if (hv !== 'ok') return { verdict: hv, why: hv === 'dead' ? `no DNS for ${host}` : `DNS error ${host}` };
  const second = await get(inner);
  if (second === 'timeout') return { verdict: 'unknown', why: 'inner timeout' };
  if (second === 'refused') return { verdict: 'dead', why: `${host} refused` };
  return { verdict: verdictForStatus(second.status), why: `inner HTTP ${second.status}` };
}

async function main() {
  const { values } = parseArgs({
    options: { target: { type: 'string', default: 'local' }, limit: { type: 'string', default: '1500' }, concurrency: { type: 'string', default: '6' }, 'dry-run': { type: 'boolean', default: false } },
  });
  const db = openTarget(values.target!, loadConfig());
  const now = new Date().toISOString();
  const { rows } = await db.all<{ id: number; game_id: number; embed_url: string; missing_since: string | null }>(
    `SELECT s.id, s.game_id, s.embed_url, s.missing_since FROM game_sources s JOIN games g ON g.id = s.game_id
      WHERE s.status = 'active' AND g.status = 'published' ORDER BY s.verified_at IS NOT NULL, s.verified_at LIMIT ?`,
    [Number(values.limit)],
  );
  const stmts: Stmt[] = [];
  const dead: string[] = [];
  let ok = 0, unknown = 0, next = 0;
  async function worker() {
    while (next < rows.length) {
      const r = rows[next++]!;
      const { verdict, why } = await probe(r.embed_url);
      if (verdict === 'dead') {
        dead.push(`${r.id} ${r.embed_url} — ${why}`);
        // Second strike (marker from an earlier run) → offline; first strike only leaves the marker.
        if (r.missing_since?.startsWith('probe:')) {
          stmts.push(
            { sql: "UPDATE game_sources SET status='disabled', verified_at=? WHERE id=?", params: [now, r.id] },
            { sql: "UPDATE games SET status='archived', review_reason='dead_embed', updated_at=? WHERE id=? AND status='published' AND NOT EXISTS (SELECT 1 FROM game_sources s WHERE s.game_id = games.id AND s.status='active')", params: [now, r.game_id] },
            { sql: "UPDATE game_categories SET published=0 WHERE game_id=? AND (SELECT status FROM games WHERE id=?) != 'published'", params: [r.game_id, r.game_id] },
          );
        } else stmts.push({ sql: 'UPDATE game_sources SET missing_since=?, verified_at=? WHERE id=?', params: [`probe:${now}`, now, r.id] });
      } else if (verdict === 'ok') {
        ok++;
        stmts.push({ sql: "UPDATE game_sources SET verified_at=?, missing_since=CASE WHEN missing_since LIKE 'probe:%' THEN NULL ELSE missing_since END WHERE id=?", params: [now, r.id] });
      } else unknown++;
    }
  }
  await Promise.all(Array.from({ length: Number(values.concurrency) }, worker));
  console.log(`probed ${rows.length}: ok ${ok}, dead ${dead.length}, unknown ${unknown}`);
  dead.forEach((d) => console.log('DEAD', d));
  if (values['dry-run']) return;
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  if (stmts.some((s) => s.sql.includes("'disabled'")))
    await db.batch([{ sql: "UPDATE site_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at=? WHERE key='data_version'", params: [now] }]);
}

if (process.argv[1]?.endsWith('probe-embeds.ts')) await main();
