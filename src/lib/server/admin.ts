/**
 * Admin actions. Every action changes the real database, is bounded, writes an
 * audit entry and bumps data_version so caches and the next publish pick it up.
 */
import { CATEGORIES } from '../taxonomy';
import { htmlToText, cleanTitle } from '../text';
import type { D1Q } from './db';
import type { Param } from '../catalog';

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };
type Stmt = { sql: string; params?: Param[] };

const now = () => new Date().toISOString();
const audit = (actor: string, action: string, type: string, id: string | number, details: unknown): Stmt => ({
  sql: 'INSERT INTO admin_audit_log (at, actor, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
  params: [now(), actor, action, type, String(id), JSON.stringify(details).slice(0, 4000)],
});
const bump: Stmt = { sql: "UPDATE site_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now') WHERE key = 'data_version'" };
const recount = (gameIds: number[]): Stmt => ({
  sql: `UPDATE categories SET game_count = (SELECT count(*) FROM game_categories gc WHERE gc.category_id = categories.id AND gc.published = 1)
         WHERE id IN (SELECT category_id FROM game_categories WHERE game_id IN (${gameIds.map(() => '?').join(',')}))`,
  params: gameIds,
});

const GAME_STATUS = new Set(['published', 'hidden', 'pending_review', 'archived']);

export async function setGameStatus(db: D1Q, actor: string, ids: number[], status: string): Promise<ActionResult> {
  const clean = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0))].slice(0, 50);
  if (!clean.length) return { ok: false, message: 'No games selected.' };
  if (!GAME_STATUS.has(status)) return { ok: false, message: 'Invalid status.' };
  const ph = clean.map(() => '?').join(',');
  await db.batch([
    { sql: `UPDATE games SET status = ?, review_reason = CASE WHEN ? = 'published' THEN NULL ELSE coalesce(review_reason, 'editorial') END,
              published_at = CASE WHEN ? = 'published' THEN coalesce(published_at, ?) ELSE published_at END, updated_at = ? WHERE id IN (${ph}) AND status != 'merged'`,
      params: [status, status, status, now(), now(), ...clean] },
    { sql: `UPDATE game_categories SET published = ? WHERE game_id IN (${ph})`, params: [status === 'published' ? 1 : 0, ...clean] },
    ...clean.map((id) => ({ sql: `INSERT INTO editorial_overrides (game_id, field, value, updated_by, updated_at) VALUES (?, 'status', ?, ?, ?)
              ON CONFLICT(game_id, field) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, params: [id, status, actor, now()] })),
    recount(clean),
    audit(actor, 'game.status', 'game', clean.join(','), { status }),
    bump,
  ]);
  return { ok: true, message: `${clean.length} game(s) set to ${status}.` };
}

export async function editGame(db: D1Q, actor: string, id: number, fields: { title?: string | undefined; description?: string | undefined; instructions?: string | undefined; categories?: string[] | undefined }): Promise<ActionResult> {
  const stmts: Stmt[] = [];
  const set: string[] = [];
  const params: Param[] = [];
  const ov = (field: string, value: string) =>
    stmts.push({ sql: `INSERT INTO editorial_overrides (game_id, field, value, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(game_id, field) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, params: [id, field, value, actor, now()] });
  if (fields.title !== undefined) {
    const t = cleanTitle(fields.title);
    if (t.length < 2) return { ok: false, message: 'Title too short.' };
    set.push('title = ?');
    params.push(t);
    ov('title', t);
  }
  if (fields.description !== undefined) {
    const d = htmlToText(fields.description, 4000);
    set.push('description = ?');
    params.push(d);
    ov('description', d);
  }
  if (fields.instructions !== undefined) {
    const d = htmlToText(fields.instructions, 2000);
    set.push('instructions = ?');
    params.push(d);
    ov('instructions', d);
  }
  if (set.length) stmts.unshift({ sql: `UPDATE games SET ${set.join(', ')}, updated_at = ? WHERE id = ?`, params: [...params, now(), id] });
  if (fields.categories) {
    const valid = fields.categories.filter((s) => CATEGORIES.some((c) => c.slug === s)).slice(0, 12);
    ov('categories', JSON.stringify(valid));
    stmts.push({ sql: 'DELETE FROM game_categories WHERE game_id = ?', params: [id] });
    if (valid.length)
      stmts.push({ sql: `INSERT INTO game_categories (category_id, game_id, published, rank_score, added_at, origin)
              SELECT c.id, g.id, g.status = 'published', g.rank_score, g.added_at, 'editorial' FROM categories c, games g WHERE g.id = ? AND c.slug IN (${valid.map(() => '?').join(',')})`, params: [id, ...valid] });
    stmts.push({ sql: `UPDATE categories SET game_count = (SELECT count(*) FROM game_categories gc WHERE gc.category_id = categories.id AND gc.published = 1)` });
  }
  if (fields.title !== undefined) {
    stmts.push({ sql: 'UPDATE games_fts SET title = ? WHERE rowid = ?', params: [cleanTitle(fields.title), id] });
  }
  if (!stmts.length) return { ok: false, message: 'Nothing to change.' };
  stmts.push(audit(actor, 'game.edit', 'game', id, Object.keys(fields)), bump);
  await db.batch(stmts);
  return { ok: true, message: 'Saved. Provider syncs will keep these edits.' };
}

export async function clearOverride(db: D1Q, actor: string, id: number, field: string): Promise<ActionResult> {
  await db.batch([{ sql: 'DELETE FROM editorial_overrides WHERE game_id = ? AND field = ?', params: [id, field] }, audit(actor, 'game.override.clear', 'game', id, { field }), bump]);
  return { ok: true, message: `Override “${field}” removed; the next sync restores the provider value.` };
}

export async function setSourceStatus(db: D1Q, actor: string, sourceId: number, status: 'active' | 'disabled'): Promise<ActionResult> {
  await db.batch([{ sql: 'UPDATE game_sources SET status = ?, verified_at = ? WHERE id = ?', params: [status, now(), sourceId] }, audit(actor, 'source.status', 'source', sourceId, { status }), bump]);
  return { ok: true, message: `Source ${sourceId} is now ${status}. New plays use this immediately.` };
}

export async function setPrimarySource(db: D1Q, actor: string, gameId: number, sourceId: number): Promise<ActionResult> {
  const [s] = await db.all<{ id: number }>('SELECT id FROM game_sources WHERE id = ? AND game_id = ?', [sourceId, gameId]);
  if (!s) return { ok: false, message: 'Source does not belong to this game.' };
  await db.batch([{ sql: 'UPDATE games SET primary_source_id = ?, updated_at = ? WHERE id = ?', params: [sourceId, now(), gameId] }, audit(actor, 'game.primary_source', 'game', gameId, { sourceId }), bump]);
  return { ok: true, message: 'Primary source changed.' };
}

const PROVIDER_FIELDS = {
  publish_status: new Set(['approved', 'pending', 'awaiting_approval', 'rejected', 'disabled']),
  monetize_status: new Set(['approved', 'pending', 'not_approved', 'disabled']),
  consent_mode: new Set(['partner_handles', 'owner_accepted', 'blocked']),
};
export async function updateProvider(db: D1Q, actor: string, id: string, f: { publish_status: string; monetize_status: string; consent_mode: string; notes: string }): Promise<ActionResult> {
  if (!PROVIDER_FIELDS.publish_status.has(f.publish_status) || !PROVIDER_FIELDS.monetize_status.has(f.monetize_status) || !PROVIDER_FIELDS.consent_mode.has(f.consent_mode)) {
    return { ok: false, message: 'Invalid provider status.' };
  }
  await db.batch([
    { sql: 'UPDATE providers SET publish_status = ?, monetize_status = ?, consent_mode = ?, notes = ?, verified_at = ?, updated_at = ? WHERE id = ?',
      params: [f.publish_status, f.monetize_status, f.consent_mode, htmlToText(f.notes, 2000), now(), now(), id] },
    audit(actor, 'provider.update', 'provider', id, f),
    bump,
  ]);
  // Listings follow the permission: hide games that have no other usable source, restore them when re-enabled.
  const usable = f.publish_status === 'approved' && f.consent_mode !== 'blocked';
  const otherUsable = `EXISTS (SELECT 1 FROM game_sources s2 JOIN providers p2 ON p2.id = s2.provider_id
      WHERE s2.game_id = games.id AND s2.provider_id != ? AND s2.status IN ('active','missing') AND p2.publish_status = 'approved' AND p2.consent_mode != 'blocked')`;
  if (!usable) {
    await db.batch([
      { sql: `UPDATE games SET status = 'hidden', review_reason = 'provider_disabled', updated_at = ? WHERE status = 'published'
               AND id IN (SELECT game_id FROM game_sources WHERE provider_id = ?) AND NOT ${otherUsable}`, params: [now(), id, id] },
      { sql: `UPDATE game_categories SET published = 0 WHERE published = 1 AND game_id IN (SELECT id FROM games WHERE review_reason = 'provider_disabled')` },
      { sql: `UPDATE categories SET game_count = (SELECT count(*) FROM game_categories gc WHERE gc.category_id = categories.id AND gc.published = 1)` },
    ]);
  } else {
    await db.batch([
      { sql: `UPDATE games SET status = 'published', review_reason = NULL, updated_at = ? WHERE status = 'hidden' AND review_reason = 'provider_disabled'
               AND id IN (SELECT game_id FROM game_sources WHERE provider_id = ?)`, params: [now(), id] },
      { sql: `UPDATE game_categories SET published = 1 WHERE published = 0 AND game_id IN (SELECT game_id FROM game_sources WHERE provider_id = ?) AND (SELECT status FROM games WHERE id = game_categories.game_id) = 'published'`, params: [id] },
      { sql: `UPDATE categories SET game_count = (SELECT count(*) FROM game_categories gc WHERE gc.category_id = categories.id AND gc.published = 1)` },
    ]);
  }
  return { ok: true, message: `Provider ${id} updated. Plays are checked immediately; listings ${usable ? 'restored' : 'hidden'} (static pages follow with the next publish).` };
}

/** Merge game `dup` into `keep`: sources move, categories union, old slug 301s to the survivor. */
export async function mergeGames(db: D1Q, actor: string, keep: number, dup: number, candidateId: number | null): Promise<ActionResult> {
  if (keep === dup) return { ok: false, message: 'Cannot merge a game into itself.' };
  const rows = await db.all<{ id: number; slug: string; status: string }>('SELECT id, slug, status FROM games WHERE id IN (?, ?)', [keep, dup]);
  const k = rows.find((r) => r.id === keep);
  const d = rows.find((r) => r.id === dup);
  if (!k || !d || k.status === 'merged' || d.status === 'merged') return { ok: false, message: 'Both games must exist and not be merged already.' };
  await db.batch([
    { sql: 'UPDATE game_sources SET game_id = ? WHERE game_id = ?', params: [keep, dup] },
    { sql: `INSERT OR IGNORE INTO game_categories (category_id, game_id, published, rank_score, added_at, origin)
            SELECT category_id, ?, (SELECT status = 'published' FROM games WHERE id = ?), rank_score, added_at, origin FROM game_categories WHERE game_id = ?`, params: [keep, keep, dup] },
    { sql: 'DELETE FROM game_categories WHERE game_id = ?', params: [dup] },
    { sql: 'INSERT OR IGNORE INTO game_tags (game_id, tag_id) SELECT ?, tag_id FROM game_tags WHERE game_id = ?', params: [keep, dup] },
    { sql: 'DELETE FROM game_tags WHERE game_id = ?', params: [dup] },
    { sql: "UPDATE games SET status = 'merged', merged_into = ?, updated_at = ? WHERE id = ?", params: [keep, now(), dup] },
    { sql: 'INSERT OR REPLACE INTO slug_redirects (old_slug, game_id, created_at) VALUES (?, ?, ?)', params: [d.slug, keep, now()] },
    { sql: 'UPDATE slug_redirects SET game_id = ? WHERE game_id = ?', params: [keep, dup] },
    { sql: 'DELETE FROM games_fts WHERE rowid = ?', params: [dup] },
    { sql: "UPDATE duplicate_candidates SET status = 'merged', resolved_at = ?, resolved_by = ? WHERE (game_a = ? AND game_b = ?) OR (game_a = ? AND game_b = ?)", params: [now(), actor, keep, dup, dup, keep] },
    { sql: "UPDATE duplicate_candidates SET status = 'rejected', resolved_at = ?, resolved_by = 'merge' WHERE status = 'open' AND (game_a = ? OR game_b = ?)", params: [now(), dup, dup] },
    { sql: `UPDATE categories SET game_count = (SELECT count(*) FROM game_categories gc WHERE gc.category_id = categories.id AND gc.published = 1)` },
    audit(actor, 'game.merge', 'game', keep, { merged: dup, candidateId, oldSlug: d.slug }),
    bump,
  ]);
  return { ok: true, message: `Merged “${d.slug}” into game ${keep}; /games/${d.slug}/ now redirects (301).` };
}

export async function rejectDuplicate(db: D1Q, actor: string, candidateId: number): Promise<ActionResult> {
  await db.batch([{ sql: "UPDATE duplicate_candidates SET status = 'rejected', resolved_at = ?, resolved_by = ? WHERE id = ?", params: [now(), actor, candidateId] }, audit(actor, 'duplicate.reject', 'duplicate', candidateId, {})]);
  return { ok: true, message: 'Marked as not a duplicate.' };
}

export async function setReportStatus(db: D1Q, actor: string, id: number, status: 'resolved' | 'dismissed' | 'open'): Promise<ActionResult> {
  await db.batch([{ sql: 'UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?', params: [status, status === 'open' ? null : now(), id] }, audit(actor, 'report.status', 'report', id, { status })]);
  return { ok: true, message: `Report ${id} ${status}.` };
}

export async function saveLanding(db: D1Q, actor: string, f: { slug: string; h1: string; title: string; description: string; intro: string; all: string[]; status: string; indexable: boolean }): Promise<ActionResult> {
  if (!/^[a-z0-9-]{3,60}$/.test(f.slug)) return { ok: false, message: 'Slug must be 3–60 lowercase letters, digits or dashes.' };
  if (CATEGORIES.some((c) => c.slug === f.slug)) return { ok: false, message: 'Slug collides with a category.' };
  const all = f.all.filter((s) => CATEGORIES.some((c) => c.slug === s)).slice(0, 3);
  if (all.length < 2) return { ok: false, message: 'Pick at least two categories to intersect.' };
  if (!['draft', 'published'].includes(f.status)) return { ok: false, message: 'Invalid status.' };
  const t = (s: string, n: number) => htmlToText(s, n);
  await db.batch([
    { sql: `INSERT INTO seo_landings (slug, h1, title, description, intro, filter, status, indexable, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET h1 = excluded.h1, title = excluded.title, description = excluded.description, intro = excluded.intro,
              filter = excluded.filter, status = excluded.status, indexable = excluded.indexable, updated_at = excluded.updated_at`,
      params: [f.slug, t(f.h1, 90), t(f.title, 70), t(f.description, 170), t(f.intro, 600), JSON.stringify({ all }), f.status, f.indexable ? 1 : 0, now()] },
    audit(actor, 'landing.save', 'landing', f.slug, { all, status: f.status }),
    bump,
  ]);
  return { ok: true, message: 'Landing saved. It goes live (or disappears) with the next catalog publish.' };
}

export async function addRedirect(db: D1Q, actor: string, oldSlug: string, targetSlug: string): Promise<ActionResult> {
  if (!/^[a-z0-9-]{1,90}$/.test(oldSlug)) return { ok: false, message: 'Invalid old slug.' };
  const [t] = await db.all<{ id: number }>("SELECT id FROM games WHERE slug = ? AND status = 'published'", [targetSlug]);
  if (!t) return { ok: false, message: 'Target game not found or not published.' };
  const [clash] = await db.all<{ id: number }>('SELECT id FROM games WHERE slug = ?', [oldSlug]);
  if (clash) return { ok: false, message: 'The old slug still belongs to a game.' };
  await db.batch([{ sql: 'INSERT OR REPLACE INTO slug_redirects (old_slug, game_id, created_at) VALUES (?, ?, ?)', params: [oldSlug, t.id, now()] }, audit(actor, 'redirect.add', 'redirect', oldSlug, { targetSlug })]);
  return { ok: true, message: `/games/${oldSlug}/ → /games/${targetSlug}/ (301).` };
}

const SETTINGS = new Set(['ads_enabled']);
export async function saveSetting(db: D1Q, actor: string, key: string, value: string): Promise<ActionResult> {
  if (!SETTINGS.has(key)) return { ok: false, message: 'This setting cannot be edited here.' };
  if (key === 'ads_enabled' && !['true', 'false'].includes(value)) return { ok: false, message: 'Use true or false.' };
  await db.batch([{ sql: 'INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', params: [key, value, now()] }, audit(actor, 'setting.save', 'setting', key, { value })]);
  return { ok: true, message: `${key} = ${value}` };
}
