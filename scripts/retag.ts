/**
 * Backfills the title-derived tags (TITLE_TAGS in src/lib/taxonomy.ts) for games that are already in the catalogue.
 *   tsx scripts/retag.ts --target local|remote [--dry-run]
 *
 * The importer adds these tags for every game it writes, but unchanged games are skipped, so this adds the missing
 * rows (INSERT OR IGNORE). It also prunes rows that a tag's `exclude` rule rejects (title matches `re` AND `exclude`).
 */
import { parseArgs } from 'node:util';
import { TITLE_TAGS, titleTags } from '../src/lib/taxonomy.ts';
import type { Stmt } from './import/db.ts';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'local' }, 'dry-run': { type: 'boolean', default: false } } });
const db = openTarget(values.target!, loadConfig());
const now = new Date().toISOString();

const existing = new Map((await db.all<{ id: number; slug: string }>('SELECT id, slug FROM tags')).rows.map((r) => [r.slug, r.id]));
let nextId = Math.max(0, ...existing.values()) + 1;
const stmts: Stmt[] = [];
for (const t of TITLE_TAGS) {
  if (!existing.has(t.slug)) {
    existing.set(t.slug, nextId);
    stmts.push({ sql: 'INSERT OR IGNORE INTO tags (id, slug, name) VALUES (?, ?, ?)', params: [nextId++, t.slug, t.name] });
  }
}
const { rows } = await db.all<{ id: number; title: string }>(`SELECT id, title FROM games WHERE status IN ('published', 'pending_review')`);
const counts = new Map<string, number>();
for (const g of rows) {
  for (const t of titleTags(g.title)) {
    stmts.push({ sql: 'INSERT OR IGNORE INTO game_tags (game_id, tag_id) VALUES (?, ?)', params: [g.id, existing.get(t.slug)!] });
    counts.set(t.slug, (counts.get(t.slug) ?? 0) + 1);
  }
}
// Prune: a title that matches a tag's `re` but also its `exclude` must not carry the tag.
const pruned: Record<string, number> = {};
for (const t of TITLE_TAGS) {
  if (!t.exclude) continue;
  const tagId = existing.get(t.slug)!;
  for (const g of rows) {
    if (t.re.test(g.title) && t.exclude.test(g.title)) {
      stmts.push({ sql: 'DELETE FROM game_tags WHERE game_id = ? AND tag_id = ?', params: [g.id, tagId] });
      pruned[t.slug] = (pruned[t.slug] ?? 0) + 1;
    }
  }
}
console.log([...counts].map(([s, n]) => `${s}: ${n}`).join(', ') || 'nothing to add', '| pruned', JSON.stringify(pruned));
if (!values['dry-run'] && stmts.length) {
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await db.batch([{ sql: "UPDATE site_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at=? WHERE key='data_version'", params: [now] }]);
  console.log(`wrote ${stmts.length} statements`);
}
db.close?.();
