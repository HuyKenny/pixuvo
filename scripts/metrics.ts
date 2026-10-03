/**
 * Daily metrics job (runs in the sync workflow, never in a request):
 *  - plays_7d per game from aggregate_metrics (real Play clicks)
 *  - rank_score refresh for games whose inputs changed (bounded writes)
 *  - list:popular  = top games by plays_7d (≥ 5 plays)
 *  - list:trending = biggest rise: plays in last 3 days vs. the 7 days before (≥ 5 recent plays)
 *  - retention: aggregate_metrics 120 days, reports 365 days, import_runs 180 days
 */
import { parseArgs } from 'node:util';
import { rankScore } from '../src/lib/rank.ts';
import { DIR_BOUNDS_SQL } from '../src/lib/catalog.ts';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'local' }, 'max-writes': { type: 'string', default: '20000' } } });
const db = openTarget(values.target!, loadConfig());
const MIN_PLAYS = 5;

const plays = (await db.all<{ game_id: number; p7: number; p3: number; prev: number }>(
  `SELECT game_id,
          sum(CASE WHEN day >= date('now', '-7 day') THEN play_clicks ELSE 0 END) AS p7,
          sum(CASE WHEN day >= date('now', '-3 day') THEN play_clicks ELSE 0 END) AS p3,
          sum(CASE WHEN day < date('now', '-3 day') AND day >= date('now', '-10 day') THEN play_clicks ELSE 0 END) AS prev
     FROM aggregate_metrics WHERE game_id > 0 AND day >= date('now', '-10 day') GROUP BY game_id`,
)).rows;
const current = new Map((await db.all<{ id: number; plays_7d: number; quality_score: number | null; rating_up: number; rating_down: number; rank_score: number; search_volume: number }>(
  "SELECT id, plays_7d, quality_score, rating_up, rating_down, rank_score, search_volume FROM games WHERE status = 'published' AND (plays_7d > 0 OR rating_up + rating_down > 0 OR search_volume > 0)",
)).rows.map((r) => [r.id, r]));
const byId = new Map(plays.map((p) => [p.game_id, p]));
const ids = new Set([...current.keys(), ...byId.keys()]);
const updates: Array<{ sql: string; params: Array<number> }> = [];
for (const id of ids) {
  const p7 = byId.get(id)?.p7 ?? 0;
  const cur = current.get(id);
  let g = cur;
  if (!g) {
    const r = (await db.all<{ id: number; plays_7d: number; quality_score: number | null; rating_up: number; rating_down: number; rank_score: number; search_volume: number }>('SELECT id, plays_7d, quality_score, rating_up, rating_down, rank_score, search_volume FROM games WHERE id = ?', [id])).rows[0];
    if (!r) continue;
    g = r;
  }
  const rank = rankScore({ qualityScore: g.quality_score, plays7d: p7, ratingUp: g.rating_up, ratingDown: g.rating_down, searchVolume: g.search_volume });
  if (g.plays_7d === p7 && Math.abs(g.rank_score - rank) < 1e-6) continue;
  updates.push({ sql: 'UPDATE games SET plays_7d = ?, rank_score = ? WHERE id = ?', params: [p7, rank, id] });
  updates.push({ sql: 'UPDATE game_categories SET rank_score = ? WHERE game_id = ?', params: [rank, id] });
}
const maxWrites = Number(values['max-writes']);
const limited = updates.slice(0, Math.max(0, Math.floor(maxWrites / 6) * 2));
for (let i = 0; i < limited.length; i += 100) await db.batch(limited.slice(i, i + 100));

const popular = plays.filter((p) => p.p7 >= MIN_PLAYS).sort((a, b) => b.p7 - a.p7 || a.game_id - b.game_id).slice(0, 90).map((p) => p.game_id);
const trending = plays
  .filter((p) => p.p3 >= MIN_PLAYS)
  .map((p) => ({ id: p.game_id, score: (p.p3 / 3) / Math.max(1, p.prev / 7) }))
  .filter((x) => x.score > 1.2)
  .sort((a, b) => b.score - a.score || a.id - b.id)
  .slice(0, 90)
  .map((x) => x.id);
const now = new Date().toISOString();
await db.batch([
  { sql: "INSERT INTO site_settings (key, value, updated_at) VALUES ('list:popular', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", params: [JSON.stringify(popular), now] },
  { sql: "INSERT INTO site_settings (key, value, updated_at) VALUES ('list:trending', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", params: [JSON.stringify(trending), now] },
  { sql: DIR_BOUNDS_SQL },
  { sql: "DELETE FROM aggregate_metrics WHERE day < date('now', '-120 day')" },
  { sql: "DELETE FROM reports WHERE created_at < datetime('now', '-365 day')" },
  { sql: "DELETE FROM import_runs WHERE started_at < datetime('now', '-180 day')" },
  ...(limited.length ? [{ sql: "UPDATE site_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = 'data_version'", params: [now] }] : []),
]);
console.log(`metrics: ${plays.length} games with plays, ${limited.length / 2} rank updates${updates.length > limited.length ? ` (capped, ${updates.length / 2} wanted)` : ''}, popular ${popular.length}, trending ${trending.length}`);
db.close?.();
