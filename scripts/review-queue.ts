/**
 * Bulk editorial pass over the review queues (same SQL as the admin actions, audited):
 *  1. games held only because a partner TAG said "adult" (title clean) → published
 *  2. duplicate candidates:
 *     - different providers + identical normalised title          → merge (keep the older game)
 *     - same provider + identical title + description jaccard ≥ .5 → merge
 *     - everything else (only the title key matches)               → "not a duplicate"
 *   tsx scripts/review-queue.ts --target remote [--dry-run]
 */
import { parseArgs } from 'node:util';
import { mergeGames, rejectDuplicate, setGameStatus } from '../src/lib/server/admin.ts';
import type { D1Q } from '../src/lib/server/db.ts';
import { findSensitiveTerms } from '../src/lib/taxonomy.ts';
import { jaccard, shingles } from '../src/lib/text.ts';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'local' }, 'dry-run': { type: 'boolean', default: false } } });
const db = openTarget(values.target!, loadConfig());
const dry = values['dry-run'];
const actor = 'claude:review-queue';
const q = {
  all: async <T>(sql: string, p: Array<string | number | null> = []) => (await db.all<T>(sql, p)).rows,
  run: async (sql: string, p: Array<string | number | null> = []) => db.all(sql, p),
  batch: async (stmts: Array<{ sql: string; params?: Array<string | number | null> }>) => {
    for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  },
} as unknown as D1Q;

// 1. adult-tag-only holds
const held = await q.all<{ id: number; title: string }>("SELECT id, title FROM games WHERE status = 'pending_review' AND review_reason = 'sensitive:adult'");
const ok = held.filter((g) => findSensitiveTerms(g.title).length === 0).map((g) => g.id);
console.log(`adult-tag holds: ${held.length}, publish ${ok.length}`);
if (!dry) for (let i = 0; i < ok.length; i += 50) await setGameStatus(q, actor, ok.slice(i, i + 50), 'published');

// 2. duplicates
const cands = await q.all<{ id: number; a: number; b: number; ta: string; tb: string; da: string; db_: string; pa: string; pb: string; sa: string; sb: string }>(
  `SELECT d.id, d.game_a AS a, d.game_b AS b, ga.title_norm AS ta, gb.title_norm AS tb, substr(ga.description,1,500) AS da, substr(gb.description,1,500) AS db_,
          (SELECT group_concat(provider_id) FROM game_sources WHERE game_id = ga.id) AS pa, (SELECT group_concat(provider_id) FROM game_sources WHERE game_id = gb.id) AS pb,
          ga.status AS sa, gb.status AS sb
     FROM duplicate_candidates d JOIN games ga ON ga.id = d.game_a JOIN games gb ON gb.id = d.game_b WHERE d.status = 'open' ORDER BY d.id`,
);
let merged = 0, rejected = 0, skipped = 0;
const gone = new Set<number>();
for (const c of cands) {
  if (gone.has(c.a) || gone.has(c.b) || c.sa === 'merged' || c.sb === 'merged') { skipped++; continue; }
  const exact = c.ta === c.tb;
  const cross = !(c.pa ?? '').split(',').some((p) => (c.pb ?? '').split(',').includes(p));
  const sim = jaccard(shingles(c.da), shingles(c.db_));
  const merge = exact && (cross || sim >= 0.5);
  if (dry) {
    if (merge) merged++;
    else rejected++;
    continue;
  }
  if (merge) {
    // Keep the published one; if both are, keep the older (lower id).
    const [keep, dup] = c.sa === 'published' && c.sb !== 'published' ? [c.a, c.b] : c.sb === 'published' && c.sa !== 'published' ? [c.b, c.a] : [Math.min(c.a, c.b), Math.max(c.a, c.b)];
    const r = await mergeGames(q, actor, keep, dup, c.id, { recount: false });
    if (r.ok) { merged++; gone.add(dup); } else { skipped++; }
  } else {
    await rejectDuplicate(q, actor, c.id);
    rejected++;
  }
  if ((merged + rejected) % 200 === 0) process.stdout.write(`\r${merged} merged, ${rejected} rejected`);
}
if (!dry && merged) await db.batch([
  { sql: 'UPDATE categories SET game_count = (SELECT count(*) FROM game_categories gc WHERE gc.category_id = categories.id AND gc.published = 1)' },
  { sql: "INSERT INTO site_settings (key, value, updated_at) VALUES ('published_count', (SELECT CAST(count(*) AS TEXT) FROM games WHERE status='published'), datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at" },
]);
console.log(`\nduplicates: ${cands.length} open → merged ${merged}, not duplicates ${rejected}, skipped ${skipped}${dry ? ' (dry run)' : ''}`);
db.close?.();
