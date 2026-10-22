/**
 * Daily IndexNow ping (Bing, Seznam, Yandex, Naver) for hubs and games added/changed in the last days.
 * Runs in the sync workflow after deploy, from a GitHub runner (a Worker's egress IP gets throttled by IndexNow).
 * Google ignores IndexNow; it is fed by the priority sitemap and internal links.
 * The key is public by design: it is the name of the file in public/ (<key>.txt, content = key).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'remote' }, days: { type: 'string', default: '3' }, limit: { type: 'string', default: '5000' }, 'dry-run': { type: 'boolean', default: false } } });
const HOST = 'pixuvo.com';
const keyFile = readdirSync('public').find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('no IndexNow key file in public/');
const key = keyFile.replace('.txt', '');
if (readFileSync(`public/${keyFile}`, 'utf8').trim() !== key) throw new Error('key file content does not match its name');

const db = openTarget(values.target!, loadConfig());
const rows = (await db.all<{ slug: string }>(
  "SELECT slug FROM games WHERE status = 'published' AND (added_at >= datetime('now', ?) OR updated_at >= datetime('now', ?)) ORDER BY added_at DESC LIMIT ?",
  [`-${values.days} day`, `-${values.days} day`, Number(values.limit)],
)).rows;
const urls = [`https://${HOST}/`, `https://${HOST}/new-games/`, `https://${HOST}/popular-games/`, ...rows.map((r) => `https://${HOST}/games/${r.slug}/`)];
console.log(`indexnow: ${urls.length} URLs (${rows.length} games)`);
if (values['dry-run']) process.exit(0);
for (let i = 0; i < urls.length; i += 10_000) {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList: urls.slice(i, i + 10_000) }),
  });
  console.log('indexnow response', res.status, await res.text().catch(() => ''));
  if (res.status >= 400) process.exitCode = 1;
}
