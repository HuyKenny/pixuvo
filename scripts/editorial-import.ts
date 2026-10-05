/**
 * Loads Pixuvo's own game texts (hero games) into D1 game_editorial and the title search demand into
 * games.search_volume (+ recomputed rank_score), also for the GameZipper allowlist (data/providers/gamezipper-allowlist.json).
 *   tsx scripts/editorial-import.ts --target remote|local [--langs en,cs] [--dry-run]
 * Sources:
 *   data/editorial/<lang>.json    { "<game slug>": { "summary": "", "how_to": "", "tips": [""], "faq": [{"q":"","a":""}] } }
 *   data/hero-games.csv           rank,game_id,slug,title,keyword,us_volume,global_volume,source
 * Idempotent: rows are upserted; a game missing from a language file keeps its existing row.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { rankScore } from '../src/lib/rank.ts';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';
import type { Stmt } from './import/db.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'local' }, langs: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } });
const db = openTarget(values.target!, loadConfig());
const now = new Date().toISOString();
const stmts: Stmt[] = [];

// 1. Search demand → games.search_volume + rank_score (game_categories mirrors rank_score).
if (existsSync('data/hero-games.csv')) {
  const rows = readFileSync('data/hero-games.csv', 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  for (const r of rows) {
    const slug = r[2]!;
    const vol = Number(r[6]) || 0;
    const [g] = (await db.all<{ id: number; quality_score: number | null; plays_7d: number; rating_up: number; rating_down: number }>(
      'SELECT id, quality_score, plays_7d, rating_up, rating_down FROM games WHERE slug = ? LIMIT 1', [slug])).rows;
    if (!g) { console.warn(`hero: unknown slug ${slug}`); continue; }
    const rank = rankScore({ qualityScore: g.quality_score, plays7d: g.plays_7d, ratingUp: g.rating_up, ratingDown: g.rating_down, searchVolume: vol });
    stmts.push({ sql: 'UPDATE games SET search_volume = ?, rank_score = ? WHERE id = ?', params: [vol, rank, g.id] });
    stmts.push({ sql: 'UPDATE game_categories SET rank_score = ? WHERE game_id = ?', params: [rank, g.id] });
  }
}

// 1b. GameZipper allowlist demand. Generic titles (Chess, Hearts, Sudoku…) only count when no other
//     published game carries the keyword, so the boost goes to the one game the query can mean.
if (existsSync('data/providers/gamezipper-allowlist.json')) {
  const allow = JSON.parse(readFileSync('data/providers/gamezipper-allowlist.json', 'utf8')) as { games: Array<{ slug: string; keyword: string; global_volume: number }> };
  let applied = 0;
  for (const a of allow.games) {
    if (!a.global_volume) continue;
    const [g] = (await db.all<{ id: number; quality_score: number | null; plays_7d: number; rating_up: number; rating_down: number; search_volume: number }>(
      `SELECT g.id, g.quality_score, g.plays_7d, g.rating_up, g.rating_down, g.search_volume FROM game_sources s JOIN games g ON g.id = s.game_id
        WHERE s.provider_id = 'gamezipper' AND s.provider_game_id = ? AND g.status = 'published' LIMIT 1`, [a.slug])).rows;
    if (!g) continue;
    const [{ n }] = (await db.all<{ n: number }>(
      "SELECT count(*) AS n FROM games WHERE status = 'published' AND id != ? AND (' ' || title_norm || ' ') LIKE ?", [g.id, `% ${a.keyword} %`])).rows as [{ n: number }];
    const vol = n === 0 ? a.global_volume : 0;
    if (vol === g.search_volume) continue;
    const rank = rankScore({ qualityScore: g.quality_score, plays7d: g.plays_7d, ratingUp: g.rating_up, ratingDown: g.rating_down, searchVolume: vol });
    stmts.push({ sql: 'UPDATE games SET search_volume = ?, rank_score = ? WHERE id = ?', params: [vol, rank, g.id] });
    stmts.push({ sql: 'UPDATE game_categories SET rank_score = ? WHERE game_id = ?', params: [rank, g.id] });
    applied++;
  }
  console.log(`gamezipper demand: ${applied} games updated`);
}

// 2. Editorial texts per language.
const langs = values.langs?.split(',') ?? readdirSync('data/editorial').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const ids = new Map<string, number>();
let texts = 0;
for (const lang of langs) {
  const file = `data/editorial/${lang}.json`;
  if (!existsSync(file)) continue;
  const data = JSON.parse(readFileSync(file, 'utf8')) as Record<string, { summary: string; how_to?: string; tips?: string[]; faq?: Array<{ q: string; a: string }> }>;
  for (const [slug, e] of Object.entries(data)) {
    if (!e?.summary?.trim()) continue;
    if (!ids.has(slug)) {
      const [g] = (await db.all<{ id: number }>('SELECT id FROM games WHERE slug = ? LIMIT 1', [slug])).rows;
      ids.set(slug, g?.id ?? 0);
    }
    const id = ids.get(slug)!;
    if (!id) { console.warn(`${lang}: unknown slug ${slug}`); continue; }
    stmts.push({
      sql: `INSERT INTO game_editorial (game_id, lang, summary, how_to, tips_json, faq_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(game_id, lang) DO UPDATE SET summary = excluded.summary, how_to = excluded.how_to, tips_json = excluded.tips_json,
              faq_json = excluded.faq_json, updated_at = excluded.updated_at`,
      params: [id, lang, e.summary.trim(), (e.how_to ?? '').trim(), JSON.stringify(e.tips ?? []), JSON.stringify(e.faq ?? []), now],
    });
    texts++;
  }
}
console.log(`${texts} editorial texts, ${stmts.length} statements${values['dry-run'] ? ' (dry run)' : ''}`);
if (!values['dry-run']) {
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await db.batch([{ sql: "UPDATE site_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now') WHERE key = 'data_version'" }]);
}
db.close?.();
