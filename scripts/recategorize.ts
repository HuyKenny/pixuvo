/**
 * Backfills categories added to src/lib/taxonomy.ts for games that are already in the catalogue.
 *   tsx scripts/recategorize.ts --target local|remote --only sudoku,logic [--dry-run]
 *
 * The importer maps provider labels to categories only when a source's payload changes, so a new
 * category would otherwise stay empty for unchanged games. This recomputes the mapping from the stored
 * provider labels and ADDS rows for the listed categories (INSERT OR IGNORE, origin 'provider').
 * It never removes anything and skips games with an editorial category override.
 */
import { parseArgs } from 'node:util';
import { mapLabelsToCategories } from '../src/lib/taxonomy.ts';
import type { Stmt } from './import/db.ts';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'local' }, only: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } });
if (!values.only) throw new Error('--only <category slugs> is required');
const only = new Set(values.only.split(','));
const db = openTarget(values.target!, loadConfig());
const now = new Date().toISOString();

const cats = new Map((await db.all<{ id: number; slug: string }>('SELECT id, slug FROM categories')).rows.map((r) => [r.slug, r.id]));
for (const s of only) if (!cats.has(s)) throw new Error(`category ${s} is not in the categories table yet — run an import first (it syncs the taxonomy)`);

const { rows } = await db.all<{ game_id: number; labels: string; status: string; rank_score: number; added_at: string; text: string }>(
  `SELECT gs.game_id, gs.provider_labels AS labels, g.status, g.rank_score, g.added_at,
          g.title || ' ' || g.description || ' ' || coalesce(g.instructions, '') AS text
     FROM game_sources gs JOIN games g ON g.id = gs.game_id
    WHERE g.status IN ('published', 'pending_review')
      AND NOT EXISTS (SELECT 1 FROM editorial_overrides o WHERE o.game_id = g.id AND o.field = 'categories')`,
);
const stmts: Stmt[] = [];
const added = new Map<string, number>();
const seen = new Set<string>();
for (const r of rows) {
  let labels: string[] = [];
  try {
    labels = JSON.parse(r.labels) as string[];
  } catch {
    continue;
  }
  for (const slug of mapLabelsToCategories(labels, r.text)) {
    if (!only.has(slug) || seen.has(`${slug}:${r.game_id}`)) continue;
    seen.add(`${slug}:${r.game_id}`);
    stmts.push({
      sql: "INSERT OR IGNORE INTO game_categories (category_id, game_id, published, rank_score, added_at, origin) VALUES (?, ?, ?, ?, ?, 'provider')",
      params: [cats.get(slug)!, r.game_id, r.status === 'published' ? 1 : 0, r.rank_score, r.added_at],
    });
    added.set(slug, (added.get(slug) ?? 0) + 1);
  }
}
console.log([...added].map(([s, n]) => `${s}: ${n} games`).join(', ') || 'nothing to add');
if (!values['dry-run'] && stmts.length) {
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await db.batch([
    { sql: 'UPDATE categories SET game_count = (SELECT count(*) FROM game_categories gc WHERE gc.category_id = categories.id AND gc.published = 1), updated_at=?', params: [now] },
    { sql: "UPDATE site_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at=? WHERE key='data_version'", params: [now] },
  ]);
  console.log(`wrote ${stmts.length} rows`);
}
db.close?.();
