/**
 * watchdog — independent of the Worker cron: fails (exit 1) when the catalog has gone stale or the site is down.
 *   - every provider has a completed import within MAX_AGE_H hours (the daily sync should leave ≤ 26 h)
 *   - no failed/aborted import in the last 48 h
 *   - key pages answer 200
 * Run by .github/workflows/watchdog.yml, which re-dispatches the sync when this fails.
 */
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'remote' }, 'max-age-h': { type: 'string', default: '200' }, site: { type: 'string', default: 'https://pixuvo.com' } } });
const maxAgeH = Number(values['max-age-h']);
const problems: string[] = [];

const db = openTarget(values.target!, loadConfig());
const last = await db.all<{ provider_id: string; t: string }>("SELECT provider_id, MAX(finished_at) t FROM import_runs WHERE status IN ('completed','budget_stopped') GROUP BY provider_id");
const ids = (await db.all<{ id: string }>("SELECT id FROM providers WHERE id IN (SELECT DISTINCT provider_id FROM game_sources)")).rows.map((r) => r.id);
for (const id of ids) {
  const t = last.rows.find((r) => r.provider_id === id)?.t;
  const age = t ? (Date.now() - Date.parse(t)) / 3600_000 : Infinity;
  console.log(`${id.padEnd(13)} last import ${t ?? 'never'} (${Number.isFinite(age) ? age.toFixed(1) + ' h' : '—'})`);
  if (age > maxAgeH) problems.push(`${id}: last completed import is ${Number.isFinite(age) ? age.toFixed(0) + ' h' : 'unknown'} old (limit ${maxAgeH} h)`);
}
const failed = await db.all<{ provider_id: string; n: number }>("SELECT provider_id, COUNT(*) n FROM import_runs WHERE status IN ('failed','aborted') AND started_at > ? GROUP BY provider_id", [new Date(Date.now() - 48 * 3600_000).toISOString()]);
for (const f of failed.rows) problems.push(`${f.provider_id}: ${f.n} failed import run(s) in the last 48 h`);

for (const path of ['/', '/new-games/', '/popular-games/', '/sitemap.xml', '/cs/']) {
  try {
    const r = await fetch(values.site + path, { headers: { 'accept-language': 'en', 'user-agent': 'pixuvo-watchdog' }, redirect: 'follow' });
    console.log(`${path.padEnd(16)} ${r.status}`);
    if (r.status !== 200) problems.push(`${path} answers ${r.status}`);
  } catch (e) {
    problems.push(`${path} unreachable: ${(e as Error).message}`);
  }
}
if (problems.length) {
  console.error('\nWATCHDOG FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('\nwatchdog ok');
