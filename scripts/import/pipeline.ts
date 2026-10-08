/**
 * Import pipeline: fetch → validate → normalise → dedupe → categorise → store →
 * publication check → outputs. Idempotent per (provider_id, provider_game_id);
 * change detection by payload hash; editorial overrides always win; nothing is
 * removed unless a complete feed was read in one run, and even then only after
 * a grace period.
 */
import {
  CATEGORIES,
  TAG_STOPLIST,
  findBrandTerms,
  findSensitiveTerms,
  mapLabelsToCategories,
  normLabel,
  pickPrimaryCategory,
  titleTags,
} from '../../src/lib/taxonomy.ts';
import { contentWords, dedupeKey, hashString, inferControls, isDistinctiveTitle, jaccard, normTitle, shingles, slugify, stableStringify } from '../../src/lib/text.ts';
import { rankScore } from '../../src/lib/rank.ts';
import { DIR_BOUNDS_SQL } from '../../src/lib/catalog.ts';
import type { SqlDb, SqlValue, Stmt } from './db.ts';
import type { ProviderAdapter, SourceItem } from './types.ts';

export interface RunOptions {
  dryRun: boolean;
  /** Max rows_written this run may consume (D1 counts index rows too). */
  budgetRows: number;
  startPage?: number | undefined;
  resume?: boolean | undefined;
  graceDays?: number | undefined;
  now?: Date | undefined;
  config: Record<string, string | undefined>;
  fetchJson: (url: string, init?: { method?: 'GET' | 'POST'; body?: unknown }) => Promise<unknown>;
  log?: (msg: string) => void | undefined;
  /** Ignore provider publish_status (technical import only). Never publishes. */
  technicalOnly?: boolean | undefined;
  /** Override the adapter's minimum for a trustworthy complete feed (tests). */
  minCompleteItems?: number | undefined;
}

export interface RunReport {
  runId: number | null;
  provider: string;
  status: 'completed' | 'failed' | 'budget_stopped' | 'aborted' | 'dry_run';
  completeFeed: boolean;
  pagesFetched: number;
  itemsSeen: number;
  itemsInvalid: number;
  invalidSamples: string[];
  inserted: number;
  attached: number;
  updated: number;
  unchanged: number;
  reactivated: number;
  markedMissing: number;
  archived: number;
  reviewQueued: number;
  duplicateCandidates: number;
  rowsWritten: number;
  rowsRead: number;
  estimatedRows: number;
  checkpoint: { page: number } | null;
  error?: string;
  changed: boolean;
}

interface ExistingSource {
  id: number;
  gameId: number;
  hash: string;
  status: string;
  missingSince: string | null;
}
interface LightGame {
  id: number;
  key: string;
  norm: string;
  status: string;
  sh: Set<string>;
  words: Set<string>;
  providers: Set<string>;
  aspect: number | null;
  primarySourceId: number | null;
  rank: number;
  addedAt: string;
}

/** Rough rows_written per statement kind, incl. indexes (calibrated against D1 meta in COSTS-AND-LIMITS.md). */
const EST = { game: 5, source: 3, catRow: 4, tagRow: 2, tagNew: 2, fts: 6, update: 4 };
const FLUSH_AT = Number(process.env.IMPORT_FLUSH_AT ?? 40);

export async function runImport(db: SqlDb, adapter: ProviderAdapter, opts: RunOptions): Promise<RunReport> {
  const log = opts.log ?? (() => {});
  const now = (opts.now ?? new Date()).toISOString();
  const graceDays = opts.graceDays ?? 7;
  const rep: RunReport = {
    runId: null, provider: adapter.id, status: opts.dryRun ? 'dry_run' : 'completed', completeFeed: false, pagesFetched: 0,
    itemsSeen: 0, itemsInvalid: 0, invalidSamples: [], inserted: 0, attached: 0, updated: 0, unchanged: 0, reactivated: 0,
    markedMissing: 0, archived: 0, reviewQueued: 0, duplicateCandidates: 0, rowsWritten: 0, rowsRead: 0, estimatedRows: 0,
    checkpoint: null, changed: false,
  };

  const ready = adapter.ready(opts.config);
  if (!ready.ok) throw new Error(`${adapter.id} not ready: ${ready.reason}`);

  const q = async <T>(sql: string, params: SqlValue[] = []) => {
    const r = await db.all<T>(sql, params);
    rep.rowsRead += r.meta.rows_read;
    return r.rows;
  };

  // ── Provider permission ──────────────────────────────────────────────────
  const [prov] = await q<{ publish_status: string }>('SELECT publish_status FROM providers WHERE id = ?', [adapter.id]);
  if (!prov) throw new Error(`provider ${adapter.id} missing in providers table`);
  const mayPublish = prov.publish_status === 'approved' && !opts.technicalOnly;
  if (!mayPublish && !opts.technicalOnly && !opts.dryRun) {
    throw new Error(`provider ${adapter.id} publish_status=${prov.publish_status}; refusing to import (use --technical-only)`);
  }

  // ── Run lock + run row ───────────────────────────────────────────────────
  if (!opts.dryRun) {
    await db.batch([{ sql: "UPDATE import_runs SET status='aborted', finished_at=?, error='stale lock' WHERE status='running' AND started_at < ?", params: [now, isoMinus(now, 3 * 3600)] }]);
    const running = await q<{ id: number }>("SELECT id FROM import_runs WHERE status='running' LIMIT 1");
    if (running.length) throw new Error(`another import is running (run ${running[0]!.id})`);
  }
  let startPage = opts.startPage ?? 1;
  if (opts.resume) {
    const [last] = await q<{ checkpoint: string; status: string }>('SELECT checkpoint, status FROM import_runs WHERE provider_id=? ORDER BY id DESC LIMIT 1', [adapter.id]);
    if (last && last.status !== 'completed') startPage = Math.max(1, Number(JSON.parse(last.checkpoint || '{}').page ?? 1));
  }
  if (!opts.dryRun) {
    const ins = await db.all<{ id: number }>(
      "INSERT INTO import_runs (provider_id, mode, status, started_at, budget_rows, checkpoint) VALUES (?, 'sync', 'running', ?, ?, ?) RETURNING id",
      [adapter.id, now, opts.budgetRows, JSON.stringify({ page: startPage })],
    );
    rep.runId = ins.rows[0]!.id;
  }

  // ── Load state ───────────────────────────────────────────────────────────
  await syncTaxonomy(db, q, opts.dryRun, now);
  const catIds = new Map((await q<{ id: number; slug: string }>('SELECT id, slug FROM categories')).map((r) => [r.slug, r.id]));
  const tagIds = new Map((await q<{ id: number; slug: string }>('SELECT id, slug FROM tags')).map((r) => [r.slug, r.id]));
  const sources = new Map<string, ExistingSource>();
  for (const r of await q<{ id: number; provider_game_id: string; game_id: number; payload_hash: string; status: string; missing_since: string | null }>(
    'SELECT id, provider_game_id, game_id, payload_hash, status, missing_since FROM game_sources WHERE provider_id = ?',
    [adapter.id],
  )) sources.set(r.provider_game_id, { id: r.id, gameId: r.game_id, hash: r.payload_hash, status: r.status, missingSince: r.missing_since });

  const slugs = new Set<string>();
  const byKey = new Map<string, LightGame[]>();
  const games = new Map<number, LightGame>();
  for (const r of await q<{ id: number; slug: string; title_norm: string; status: string; d: string; providers: string | null; w: number | null; h: number | null; ps: number | null; rank_score: number; added_at: string }>(
    `SELECT g.id, g.slug, g.title_norm, g.status, substr(g.description, 1, 400) AS d, g.primary_source_id AS ps, g.rank_score, g.added_at,
            (SELECT group_concat(provider_id) FROM game_sources s WHERE s.game_id = g.id) AS providers,
            (SELECT width FROM game_sources s WHERE s.id = g.primary_source_id) AS w,
            (SELECT height FROM game_sources s WHERE s.id = g.primary_source_id) AS h
       FROM games g`,
  )) {
    slugs.add(r.slug);
    const lg: LightGame = { id: r.id, key: dedupeKey(r.title_norm), norm: r.title_norm, status: r.status, sh: shingles(r.d), words: contentWords(r.title_norm + ' ' + r.d), providers: new Set((r.providers ?? '').split(',').filter(Boolean)), aspect: r.w && r.h ? r.w / r.h : null, primarySourceId: r.ps, rank: r.rank_score, addedAt: r.added_at };
    games.set(r.id, lg);
    if (lg.key) (byKey.get(lg.key) ?? byKey.set(lg.key, []).get(lg.key)!).push(lg);
  }
  for (const r of await q<{ old_slug: string }>('SELECT old_slug FROM slug_redirects')) slugs.add(r.old_slug);
  const overrides = new Map<number, Map<string, string>>();
  for (const r of await q<{ game_id: number; field: string; value: string }>('SELECT game_id, field, value FROM editorial_overrides')) {
    (overrides.get(r.game_id) ?? overrides.set(r.game_id, new Map()).get(r.game_id)!).set(r.field, r.value);
  }
  const [mx] = await q<{ g: number | null; s: number | null; t: number | null; d: number | null }>(
    'SELECT (SELECT max(id) FROM games) g, (SELECT max(id) FROM game_sources) s, (SELECT max(id) FROM tags) t, (SELECT max(dir_seq) FROM games) d',
  );
  let nextGame = (mx?.g ?? 0) + 1;
  let nextSource = (mx?.s ?? 0) + 1;
  let nextTag = (mx?.t ?? 0) + 1;
  let nextSeq = (mx?.d ?? 0) + 1;

  // ── Write buffer with budget ─────────────────────────────────────────────
  let pending: Stmt[] = [];
  let pendingEst = 0;
  let stopForBudget = false;
  const push = (est: number, ...stmts: Stmt[]) => {
    pending.push(...stmts);
    pendingEst += est;
    rep.estimatedRows += est;
    rep.changed = true;
  };
  const flush = async () => {
    if (!pending.length) return;
    if (!opts.dryRun) {
      const meta = await db.batch(pending);
      // SQLite reports changed rows only (no index rows) — budget with the larger estimate there.
      rep.rowsWritten += db.kind === 'sqlite' ? Math.max(meta.rows_written || 0, pendingEst) : meta.rows_written || 0;
      rep.rowsRead += meta.rows_read || 0;
    }
    pending = [];
    pendingEst = 0;
  };
  const used = () => (opts.dryRun ? rep.estimatedRows : rep.rowsWritten + pendingEst);
  const budgetLeft = () => opts.budgetRows - used();

  const seen = new Set<string>();
  let lastPage = startPage;
  let reachedEnd = false;

  try {
    for await (const page of adapter.pages({ fetchJson: opts.fetchJson, startPage, config: opts.config })) {
      rep.pagesFetched++;
      lastPage = page.page;
      for (const raw of page.items) {
        rep.itemsSeen++;
        const parsed = adapter.parse(raw, opts.config);
        if (!parsed.ok) {
          rep.itemsInvalid++;
          if (rep.invalidSamples.length < 20) rep.invalidSamples.push(`${parsed.id ?? '?'}: ${parsed.error}`);
          continue;
        }
        const item = parsed.item;
        if (seen.has(item.providerGameId)) continue; // duplicate row inside the feed
        seen.add(item.providerGameId);
        // Budget check BEFORE planning writes for this item (worst case ~60 rows).
        if (budgetLeft() < 80) {
          stopForBudget = true;
          break;
        }
        await handleItem(item);
        if (pending.length >= FLUSH_AT) await flush();
      }
      if (stopForBudget) break;
      await flush();
      if (rep.runId) await db.batch([{ sql: 'UPDATE import_runs SET checkpoint=?, pages_fetched=?, items_seen=?, rows_written=? WHERE id=?', params: [JSON.stringify({ page: page.page + 1 }), rep.pagesFetched, rep.itemsSeen, rep.rowsWritten, rep.runId] }]);
      log(`${adapter.id}: page ${page.page} done (${rep.itemsSeen} seen, +${rep.inserted} new, ${rep.updated} upd, ~${used()} rows)`);
      if (page.isLast) reachedEnd = true;
    }
    await flush();

    if (stopForBudget) {
      rep.status = opts.dryRun ? 'dry_run' : 'budget_stopped';
      rep.checkpoint = { page: lastPage };
    } else {
      rep.completeFeed = reachedEnd && startPage === 1 && rep.itemsSeen - rep.itemsInvalid >= (opts.minCompleteItems ?? adapter.minCompleteItems);
      if (rep.completeFeed) await detectMissing();
      else log(`${adapter.id}: feed not complete in this run — missing-detection skipped`);
    }

    if (rep.changed && !opts.dryRun) await refreshOutputs(db, now);
    await flush();
  } catch (e) {
    rep.status = 'failed';
    rep.error = String((e as Error)?.message ?? e).slice(0, 500);
    rep.checkpoint = { page: lastPage };
    try {
      await flush();
    } catch {
      /* the run row below records the failure */
    }
  }

  if (rep.runId) {
    await db.batch([{
      sql: `UPDATE import_runs SET status=?, finished_at=?, complete_feed=?, checkpoint=?, pages_fetched=?, items_seen=?, items_invalid=?,
              inserted=?, updated=?, unchanged=?, marked_missing=?, archived=?, rows_written=?, rows_read=?, error=? WHERE id=?`,
      params: [rep.status, new Date().toISOString(), rep.completeFeed ? 1 : 0, JSON.stringify(rep.checkpoint ?? {}), rep.pagesFetched, rep.itemsSeen,
        rep.itemsInvalid, rep.inserted + rep.attached, rep.updated, rep.unchanged, rep.markedMissing, rep.archived, rep.rowsWritten, rep.rowsRead,
        rep.error ?? null, rep.runId],
    }]);
  }
  return rep;

  // ── Per item ─────────────────────────────────────────────────────────────
  async function handleItem(item: SourceItem) {
    const hash = hashString(stableStringify(item));
    const ex = sources.get(item.providerGameId);
    if (ex) {
      if (ex.hash === hash && ex.status === 'active') {
        rep.unchanged++;
        return;
      }
      if (ex.status === 'disabled') {
        // Admin disabled this source: keep it disabled, only refresh the hash.
        push(1, { sql: 'UPDATE game_sources SET payload_hash=?, last_seen_at=? WHERE id=?', params: [hash, now, ex.id] });
        ex.hash = hash;
        return;
      }
      if (ex.hash === hash) {
        rep.reactivated++;
        push(EST.update, { sql: "UPDATE game_sources SET status='active', missing_since=NULL, last_seen_at=? WHERE id=?", params: [now, ex.id] });
        push(EST.update, { sql: "UPDATE games SET status='published', review_reason=NULL, updated_at=? WHERE id=? AND status='archived' AND review_reason='source_missing'", params: [now, ex.gameId] });
        push(EST.catRow * 3, { sql: "UPDATE game_categories SET published=1 WHERE game_id=? AND (SELECT status FROM games WHERE id=?)='published'", params: [ex.gameId, ex.gameId] });
        ex.status = 'active';
        return;
      }
      await updateExisting(item, ex, hash);
      return;
    }
    await insertNew(item, hash);
  }

  function decideStatus(item: SourceItem): { status: string; reason: string | null } {
    if (!mayPublish) return { status: 'pending_review', reason: 'provider_not_approved' };
    const brands = findBrandTerms(item.title);
    if (brands.length) return { status: 'pending_review', reason: `brand_ip:${brands.slice(0, 3).join('|')}` };
    // Titles are checked for every sensitive term; partner tags only for gambling — GameMonetize uses "Adult"
    // as a loose audience label on ordinary casual games (verified on 290 samples, 2026-10-02).
    const sens = [...findSensitiveTerms(item.title), ...findSensitiveTerms(item.labels.join(' ')).filter((t) => t !== 'adult' && t !== 'kiss' && t !== 'kissing')];
    if (sens.length) return { status: 'pending_review', reason: `sensitive:${sens.slice(0, 3).join('|')}` };
    return { status: 'published', reason: null };
  }

  function cleanTags(item: SourceItem, categorySlugs: string[]): Array<{ slug: string; name: string }> {
    const catSet = new Set(categorySlugs);
    const out: Array<{ slug: string; name: string }> = [];
    const seenT = new Set<string>();
    for (const l of item.labels) {
      const n = normLabel(l);
      if (!n || n.length < 2 || TAG_STOPLIST.has(n) || findBrandTerms(n).length || findSensitiveTerms(n).length) continue;
      const slug = slugify(n, 40);
      if (catSet.has(slug) || seenT.has(slug) || /^\d+$/.test(slug)) continue;
      seenT.add(slug);
      out.push({ slug, name: l.length <= 30 ? titleCase(l) : titleCase(l.slice(0, 30)) });
      if (out.length >= 8) break;
    }
    // Title-derived tags (landing pages) come on top of the 8 partner tags.
    for (const t of titleTags(item.title)) if (!seenT.has(t.slug) && !catSet.has(t.slug)) { seenT.add(t.slug); out.push(t); }
    return out;
  }

  function tagStatements(gameId: number, tags: Array<{ slug: string; name: string }>): { stmts: Stmt[]; est: number } {
    const stmts: Stmt[] = [];
    let est = 0;
    const ids: number[] = [];
    for (const t of tags) {
      let id = tagIds.get(t.slug);
      if (!id) {
        id = nextTag++;
        tagIds.set(t.slug, id);
        stmts.push({ sql: 'INSERT OR IGNORE INTO tags (id, slug, name) VALUES (?, ?, ?)', params: [id, t.slug, t.name] });
        est += EST.tagNew;
      }
      ids.push(id);
    }
    if (ids.length) {
      stmts.push({ sql: `INSERT OR IGNORE INTO game_tags (game_id, tag_id) VALUES ${ids.map(() => '(?, ?)').join(', ')}`, params: ids.flatMap((id) => [gameId, id]) });
      est += ids.length * EST.tagRow;
    }
    return { stmts, est };
  }

  function categoryStatements(gameId: number, slugsList: string[], published: boolean, rank: number, addedAt: string): { stmts: Stmt[]; est: number } {
    const ids = slugsList.map((s) => catIds.get(s)).filter((x): x is number => !!x);
    if (!ids.length) return { stmts: [], est: 0 };
    return {
      stmts: [{
        sql: `INSERT OR IGNORE INTO game_categories (category_id, game_id, published, rank_score, added_at, origin) VALUES ${ids.map(() => "(?, ?, ?, ?, ?, 'provider')").join(', ')}`,
        params: ids.flatMap((id) => [id, gameId, published ? 1 : 0, rank, addedAt]),
      }],
      est: ids.length * EST.catRow,
    };
  }

  function ftsLabels(categorySlugs: string[], tags: Array<{ name: string }>): string {
    const names = categorySlugs.map((s) => CATEGORIES.find((c) => c.slug === s)?.name ?? s);
    return [...names, ...tags.map((t) => t.name)].join(' ');
  }

  function uniqueSlug(title: string): string {
    const base = slugify(title, 70);
    let s = base;
    for (let i = 2; slugs.has(s); i++) s = `${base}-${i}`;
    slugs.add(s);
    return s;
  }

  async function insertNew(item: SourceItem, hash: string) {
    const key = dedupeKey(item.title);
    const sh = shingles(item.description.slice(0, 400));
    const words = contentWords(item.title + ' ' + item.description.slice(0, 400));
    const norm = normTitle(item.title);
    const aspect = item.width && item.height ? item.width / item.height : null;
    const candidates = key ? byKey.get(key) ?? [] : [];
    const categorySlugs = mapLabelsToCategories(item.labels, categoryText(item));

    // Duplicate check: auto-attach only with ≥2 strong signals and a different provider.
    let attachTo: LightGame | null = null;
    const weak: Array<{ g: LightGame; score: number; signals: Record<string, unknown> }> = [];
    // A title shared by several games of one provider ("Snake", "2048") is ambiguous.
    const live = candidates.filter((g) => g.status !== 'merged');
    const uniqueTitle = isDistinctiveTitle(item.title) && live.length === 1;
    for (const g of live) {
      const sim = jaccard(sh, g.sh);
      const topical = jaccard(words, g.words);
      const aspectMatch = aspect !== null && g.aspect !== null && Math.abs(aspect / g.aspect - 1) < 0.03;
      const crossProvider = !g.providers.has(item.providerId);
      const exactTitle = g.norm === norm;
      const signals = {
        title_key: true, exact_title: exactTitle, distinctive_unique_title: uniqueTitle, description_jaccard: Math.round(sim * 100) / 100,
        topical_jaccard: Math.round(topical * 100) / 100, aspect_match: aspectMatch, cross_provider: crossProvider,
      };
      // Auto-merge needs: different provider + exact title + (near-identical text, or a distinctive unique title backed by topic/aspect overlap).
      const strongText = sim >= 0.5;
      const supported = uniqueTitle && (topical >= 0.12 || aspectMatch);
      if (crossProvider && exactTitle && (strongText || supported)) {
        attachTo = g;
        break;
      }
      weak.push({ g, score: Math.round((0.5 + sim / 2 + (aspectMatch ? 0.1 : 0)) * 100) / 100, signals });
    }

    const sourceId = nextSource++;
    const sourceStmt: Stmt = {
      sql: `INSERT INTO game_sources (id, game_id, provider_id, provider_game_id, embed_url, width, height, status, restrictions, provider_labels, payload_hash, first_seen_at, last_seen_at, verified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
      params: [sourceId, 0, item.providerId, item.providerGameId, item.embedUrl, item.width, item.height, JSON.stringify(item.restrictions), JSON.stringify(item.labels), hash, now, now, now],
    };

    if (attachTo) {
      sourceStmt.params![1] = attachTo.id;
      push(EST.source, sourceStmt);
      const pub = attachTo.status === 'published';
      const cats = categoryStatements(attachTo.id, categorySlugs, pub, 0, now);
      // Keep existing rank for new memberships: copy from games.rank_score.
      if (cats.stmts.length) {
        cats.stmts[0]!.sql = cats.stmts[0]!.sql.replace(/VALUES[\s\S]*$/, '') + `SELECT c.id, g.id, g.status='published', g.rank_score, g.added_at, 'provider' FROM categories c, games g WHERE g.id = ? AND c.slug IN (${categorySlugs.map(() => '?').join(',')})`;
        cats.stmts[0]!.params = [attachTo.id, ...categorySlugs];
        push(cats.est, ...cats.stmts);
      }
      attachTo.providers.add(item.providerId);
      sources.set(item.providerGameId, { id: sourceId, gameId: attachTo.id, hash, status: 'active', missingSince: null });
      rep.attached++;
      return;
    }

    const gameId = nextGame++;
    sourceStmt.params![1] = gameId;
    const { status, reason } = decideStatus(item);
    if (status !== 'published') rep.reviewQueued++;
    const primary = pickPrimaryCategory(categorySlugs);
    const rank = rankScore({ qualityScore: item.qualityScore, plays7d: 0, ratingUp: 0, ratingDown: 0 });
    const slug = uniqueSlug(item.title);
    const controls = inferControls(item.instructions);
    const tags = cleanTags(item, categorySlugs);
    push(
      EST.game,
      {
        sql: `INSERT INTO games (id, slug, title, title_norm, description, instructions, thumb_url, thumb_w, thumb_h, status, review_reason,
                primary_source_id, primary_category_id, source_release_date, added_at, updated_at, published_at, mobile_friendly, orientation,
                players_max, multiplayer_mode, technology, visual_style, controls_inferred, dir_seq, quality_score, rank_score, content_hash)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [gameId, slug, item.title, normTitle(item.title), item.description, item.instructions, item.thumbUrl, item.thumbW, item.thumbH, status, reason,
          sourceId, primary ? catIds.get(primary) ?? null : null, item.releaseDate, now, now, status === 'published' ? now : null, item.mobileFriendly,
          item.orientation, item.playersMax, item.multiplayerMode, item.technology, item.visualStyle, controls.length ? JSON.stringify(controls) : null,
          nextSeq++, item.qualityScore, rank, hash],
      },
    );
    push(EST.source, sourceStmt);
    const cats = categoryStatements(gameId, categorySlugs, status === 'published', rank, now);
    push(cats.est, ...cats.stmts);
    const t = tagStatements(gameId, tags);
    push(t.est, ...t.stmts);
    push(EST.fts, { sql: 'INSERT INTO games_fts (rowid, title, aliases, developer, labels) VALUES (?, ?, ?, ?, ?)', params: [gameId, item.title, '', '', ftsLabels(categorySlugs, tags)] });

    for (const w of weak.slice(0, 3)) {
      const [a, b] = w.g.id < gameId ? [w.g.id, gameId] : [gameId, w.g.id];
      push(3, { sql: 'INSERT OR IGNORE INTO duplicate_candidates (game_a, game_b, score, signals, created_at) VALUES (?, ?, ?, ?, ?)', params: [a, b, w.score, JSON.stringify(w.signals), now] });
      rep.duplicateCandidates++;
    }

    const lg: LightGame = { id: gameId, key, norm: normTitle(item.title), status, sh, words, providers: new Set([item.providerId]), aspect, primarySourceId: sourceId, rank, addedAt: now };
    games.set(gameId, lg);
    if (key) (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(lg);
    sources.set(item.providerGameId, { id: sourceId, gameId, hash, status: 'active', missingSince: null });
    rep.inserted++;
  }

  async function updateExisting(item: SourceItem, ex: ExistingSource, hash: string) {
    rep.updated++;
    push(EST.update, {
      sql: "UPDATE game_sources SET embed_url=?, width=?, height=?, provider_labels=?, payload_hash=?, last_seen_at=?, status='active', missing_since=NULL WHERE id=?",
      params: [item.embedUrl, item.width, item.height, JSON.stringify(item.labels), hash, now, ex.id],
    });
    ex.hash = hash;
    ex.status = 'active';
    // Only the primary source drives the game record.
    const lg = games.get(ex.gameId);
    if (!lg || lg.primarySourceId !== ex.id) return;
    const g = { status: lg.status, rank_score: lg.rank, added_at: lg.addedAt };
    const ov = overrides.get(ex.gameId) ?? new Map<string, string>();
    const sets: string[] = [];
    const params: SqlValue[] = [];
    const set = (col: string, field: string | null, val: SqlValue) => {
      if (field && ov.has(field)) return;
      sets.push(`${col}=?`);
      params.push(val);
    };
    set('title', 'title', item.title);
    set('title_norm', 'title', normTitle(item.title));
    set('description', 'description', item.description);
    set('instructions', 'instructions', item.instructions);
    set('thumb_url', 'thumb_url', item.thumbUrl);
    set('mobile_friendly', 'mobile_friendly', item.mobileFriendly);
    set('players_max', 'players_max', item.playersMax);
    set('multiplayer_mode', 'multiplayer_mode', item.multiplayerMode);
    set('visual_style', 'visual_style', item.visualStyle);
    set('orientation', null, item.orientation);
    set('technology', null, item.technology);
    set('quality_score', null, item.qualityScore);
    set('source_release_date', null, item.releaseDate);
    const controls = inferControls(item.instructions);
    set('controls_inferred', null, controls.length ? JSON.stringify(controls) : null);
    set('content_hash', null, hash);
    set('updated_at', null, now);
    params.push(ex.gameId);
    push(EST.update, { sql: `UPDATE games SET ${sets.join(', ')} WHERE id=?`, params });

    const categorySlugs = ov.has('categories') ? (JSON.parse(ov.get('categories')!) as string[]) : mapLabelsToCategories(item.labels, categoryText(item));
    const pub = g.status === 'published';
    if (!ov.has('categories')) {
      push(EST.catRow * 3, { sql: "DELETE FROM game_categories WHERE game_id=? AND origin='provider'", params: [ex.gameId] });
      const cats = categoryStatements(ex.gameId, categorySlugs, pub, g.rank_score, g.added_at);
      push(cats.est, ...cats.stmts);
      const primary = pickPrimaryCategory(categorySlugs);
      push(EST.update, { sql: 'UPDATE games SET primary_category_id=? WHERE id=?', params: [primary ? catIds.get(primary) ?? null : null, ex.gameId] });
    }
    const tags = cleanTags(item, categorySlugs);
    push(EST.tagRow * 4, { sql: 'DELETE FROM game_tags WHERE game_id=?', params: [ex.gameId] });
    const t = tagStatements(ex.gameId, tags);
    push(t.est, ...t.stmts);
    const title = ov.get('title') ?? item.title;
    push(EST.fts * 2,
      { sql: 'DELETE FROM games_fts WHERE rowid=?', params: [ex.gameId] },
      { sql: `INSERT INTO games_fts (rowid, title, aliases, developer, labels)
              VALUES (?, ?, coalesce((SELECT group_concat(alias, ' ') FROM game_aliases WHERE game_id=?), ''), '', ?)`, params: [ex.gameId, title, ex.gameId, ftsLabels(categorySlugs, tags)] });
  }

  async function detectMissing() {
    const activeBefore = [...sources.values()].filter((s) => s.status === 'active').length;
    const notSeen = [...sources.entries()].filter(([pid, s]) => !seen.has(pid) && (s.status === 'active' || s.status === 'missing'));
    // Safety valve: a feed that suddenly lost >30 % of its items is treated as broken.
    if (activeBefore > 0 && notSeen.filter(([, s]) => s.status === 'active').length > activeBefore * 0.3) {
      throw new Error(`refusing missing-detection: ${notSeen.length} of ${activeBefore} active items absent from feed`);
    }
    const toMark = notSeen.filter(([, s]) => s.status === 'active').map(([, s]) => s.id);
    for (const chunk of chunks(toMark, 90)) {
      push(chunk.length * EST.update, { sql: `UPDATE game_sources SET status='missing', missing_since=? WHERE id IN (${chunk.map(() => '?').join(',')})`, params: [now, ...chunk] });
    }
    rep.markedMissing = toMark.length;
    const cutoff = isoMinus(now, graceDays * 86400);
    const expired = notSeen.filter(([, s]) => s.status === 'missing' && s.missingSince && s.missingSince < cutoff).map(([, s]) => s);
    for (const chunk of chunks(expired, 90)) {
      push(chunk.length * EST.update, { sql: `UPDATE game_sources SET status='removed' WHERE id IN (${chunk.map(() => '?').join(',')})`, params: chunk.map((s) => s.id) });
    }
    const gameIds = [...new Set(expired.map((s) => s.gameId))];
    for (const chunk of chunks(gameIds, 90)) {
      const ph = chunk.map(() => '?').join(',');
      // Archive only games left without any active source.
      push(chunk.length * EST.update * 2,
        { sql: `UPDATE games SET status='archived', review_reason='source_missing', updated_at=? WHERE id IN (${ph}) AND status='published'
                 AND NOT EXISTS (SELECT 1 FROM game_sources s WHERE s.game_id = games.id AND s.status='active')`, params: [now, ...chunk] },
        { sql: `UPDATE game_categories SET published=0 WHERE game_id IN (${ph}) AND (SELECT status FROM games WHERE id = game_categories.game_id) != 'published'`, params: chunk });
    }
    rep.archived = gameIds.length;
  }
}

/** What a category's `evidence` is checked against. */
function categoryText(item: SourceItem): string {
  return `${item.title} ${item.description} ${item.instructions}`;
}

/** Keep the categories table in sync with src/lib/taxonomy.ts (writes only differences). */
async function syncTaxonomy(db: SqlDb, q: <T>(sql: string, p?: SqlValue[]) => Promise<T[]>, dryRun: boolean, now: string) {
  const existing = new Map((await q<{ id: number; slug: string; name: string; kind: string; parent_id: number | null; blurb: string; is_nav: number; sort: number }>(
    'SELECT id, slug, name, kind, parent_id, blurb, is_nav, sort FROM categories')).map((r) => [r.slug, r]));
  const stmts: Stmt[] = [];
  let nextId = Math.max(0, ...[...existing.values()].map((r) => r.id)) + 1;
  const ids = new Map<string, number>([...existing].map(([k, v]) => [k, v.id]));
  for (const c of CATEGORIES) if (!ids.has(c.slug)) ids.set(c.slug, nextId++);
  CATEGORIES.forEach((c, i) => {
    const id = ids.get(c.slug)!;
    const parent = c.parent ? ids.get(c.parent) ?? null : null;
    const cur = existing.get(c.slug);
    if (!cur) {
      stmts.push({ sql: 'INSERT INTO categories (id, slug, name, kind, parent_id, blurb, is_nav, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', params: [id, c.slug, c.name, c.kind, parent, c.blurb, c.nav ? 1 : 0, i, now] });
    } else if (cur.name !== c.name || cur.kind !== c.kind || cur.parent_id !== parent || cur.blurb !== c.blurb || cur.is_nav !== (c.nav ? 1 : 0) || cur.sort !== i) {
      stmts.push({ sql: 'UPDATE categories SET name=?, kind=?, parent_id=?, blurb=?, is_nav=?, sort=?, updated_at=? WHERE id=?', params: [c.name, c.kind, parent, c.blurb, c.nav ? 1 : 0, i, now, id] });
    }
  });
  if (stmts.length && !dryRun) await db.batch(stmts);
}

/** After a changing run: category counts, popular/trending lists stay to the metrics job; bump data_version. */
export async function refreshOutputs(db: SqlDb, now: string) {
  await db.batch([
    { sql: "UPDATE categories SET game_count = (SELECT count(*) FROM game_categories gc WHERE gc.category_id = categories.id AND gc.published = 1), updated_at=?", params: [now] },
    { sql: "INSERT INTO site_settings (key, value, updated_at) VALUES ('published_count', (SELECT CAST(count(*) AS TEXT) FROM games WHERE status='published'), ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", params: [now] },
    { sql: "INSERT INTO site_settings (key, value, updated_at) VALUES ('max_dir_seq', (SELECT CAST(coalesce(max(dir_seq),0) AS TEXT) FROM games), ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", params: [now] },
    { sql: DIR_BOUNDS_SQL },
    { sql: "UPDATE site_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at=? WHERE key='data_version'", params: [now] },
  ]);
}

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function isoMinus(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() - seconds * 1000).toISOString();
}

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
