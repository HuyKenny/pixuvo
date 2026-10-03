/**
 * Moves already-published games whose TITLE names a brand from BRAND_TERMS to editorial review
 * (the importer does this for new games; this catches titles published before a term was added).
 *   tsx scripts/hold-brands.ts --target remote [--dry-run]
 */
import { parseArgs } from 'node:util';
import { DIR_BOUNDS_SQL } from '../src/lib/catalog.ts';
import { setGameStatus } from '../src/lib/server/admin.ts';
import type { D1Q } from '../src/lib/server/db.ts';
import { findBrandTerms } from '../src/lib/taxonomy.ts';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'local' }, 'dry-run': { type: 'boolean', default: false } } });
const db = openTarget(values.target!, loadConfig());
const q = {
  all: async <T>(sql: string, p: Array<string | number | null> = []) => (await db.all<T>(sql, p)).rows,
  run: async (sql: string, p: Array<string | number | null> = []) => db.all(sql, p),
  batch: async (stmts: Array<{ sql: string; params?: Array<string | number | null> }>) => {
    for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  },
} as unknown as D1Q;

const hits: Array<{ id: number; title: string; terms: string[] }> = [];
for (let after = 0; ; ) {
  const rows = (await db.all<{ id: number; title: string }>("SELECT id, title FROM games WHERE status = 'published' AND id > ? ORDER BY id LIMIT 5000", [after])).rows;
  if (!rows.length) break;
  for (const r of rows) { const t = findBrandTerms(r.title); if (t.length) hits.push({ id: r.id, title: r.title, terms: t }); }
  after = rows[rows.length - 1]!.id;
}
for (const h of hits) console.log(`${h.id}\t${h.title}\t${h.terms.join('|')}`);
if (!values['dry-run'] && hits.length) {
  // Same SQL as the admin "set status" action (audited, keeps game_categories.published in sync), 50 ids per call.
  for (let i = 0; i < hits.length; i += 50) await setGameStatus(q, 'claude:hold-brands', hits.slice(i, i + 50).map((h) => h.id), 'pending_review');
  await q.batch(hits.map((h) => ({ sql: 'UPDATE games SET review_reason = ? WHERE id = ?', params: [`brand_ip:${h.terms.slice(0, 3).join('|')}`, h.id] })));
  await db.batch([
    { sql: DIR_BOUNDS_SQL },
    { sql: 'UPDATE categories SET game_count = (SELECT count(*) FROM game_categories gc WHERE gc.category_id = categories.id AND gc.published = 1)' },
    { sql: "INSERT INTO site_settings (key, value, updated_at) VALUES ('published_count', (SELECT CAST(count(*) AS TEXT) FROM games WHERE status='published'), datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at" },
    { sql: "UPDATE site_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now') WHERE key = 'data_version'" },
  ]);
}
console.log(`${hits.length} published games name a brand${values['dry-run'] ? ' (dry run)' : ' → pending_review'}`);
db.close?.();
