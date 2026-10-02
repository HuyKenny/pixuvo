/**
 * Catalog queries. Runtime-agnostic: the Worker passes a D1 wrapper, offline
 * scripts (snapshot export) pass the REST/SQLite client. Every query is
 * parameterised, selects explicit columns and is bounded by LIMIT.
 */
import { MIN_CATEGORY_GAMES, SEARCH_SYNONYMS, THEMES, THEME_SLUGS, type ThemeDef } from './taxonomy';
import { normTitle } from './text';
import type { CategoryInfo, CategoryRef, GameCard, GameDetail, ListSort, Paged } from './types';
import { SITE } from './site';

export type Param = string | number | null;
export interface Q {
  all<T>(sql: string, params?: Param[]): Promise<T[]>;
}

interface CardRow {
  id: number;
  slug: string;
  title: string;
  thumb_url: string;
  mobile_friendly: number | null;
  players_max: number | null;
  plays_7d: number | null;
  cat: string | null;
}

const CARD_COLS = 'g.id, g.slug, g.title, g.thumb_url, g.mobile_friendly, g.players_max, g.plays_7d, pc.name AS cat';
const CARD_JOIN = 'LEFT JOIN categories pc ON pc.id = g.primary_category_id';

export function toCard(r: CardRow): GameCard {
  // Real plays on Pixuvo in the last 7 days (scripts/metrics.ts); omitted when zero to keep payloads small.
  return { id: r.id, slug: r.slug, title: r.title, thumb: r.thumb_url, cat: r.cat, mobile: r.mobile_friendly === 1, players: r.players_max, ...(r.plays_7d ? { plays7d: r.plays_7d } : {}) };
}

// ── Categories ──────────────────────────────────────────────────────────────
export async function getCategories(q: Q): Promise<CategoryInfo[]> {
  const rows = await q.all<{ id: number; slug: string; name: string; kind: CategoryInfo['kind']; parent: string | null; blurb: string; is_nav: number; game_count: number }>(
    `SELECT c.id, c.slug, c.name, c.kind, p.slug AS parent, c.blurb, c.is_nav, c.game_count
       FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
      ORDER BY c.sort LIMIT 500`,
  );
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, kind: r.kind, parent: r.parent, blurb: r.blurb, nav: r.is_nav === 1, count: r.game_count }));
}

// ── Lists ───────────────────────────────────────────────────────────────────
export function clampPage(raw: unknown, max = 10_000): number | null {
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : 1;
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}

export async function categoryGames(q: Q, cat: CategoryInfo, sort: ListSort, page: number, pageSize: number = SITE.pageSize): Promise<Paged<GameCard>> {
  const order = sort === 'new' ? 'gc.added_at DESC, gc.game_id' : sort === 'az' ? 'g.title_norm, g.id' : 'gc.rank_score DESC, gc.game_id';
  const rows = await q.all<CardRow>(
    `SELECT ${CARD_COLS} FROM game_categories gc JOIN games g ON g.id = gc.game_id ${CARD_JOIN}
      WHERE gc.category_id = ? AND gc.published = 1 ORDER BY ${order} LIMIT ? OFFSET ?`,
    [cat.id, pageSize, (page - 1) * pageSize],
  );
  const total = cat.count;
  return { items: rows.map(toCard), page, pageSize, total, pages: Math.min(SITE.maxCategoryPages, Math.max(1, Math.ceil(total / pageSize))) };
}

export async function topGames(q: Q, sort: 'featured' | 'new', limit: number, offset = 0): Promise<GameCard[]> {
  const order = sort === 'new' ? 'g.added_at DESC, g.id DESC' : 'g.rank_score DESC, g.id DESC';
  const rows = await q.all<CardRow>(
    `SELECT ${CARD_COLS} FROM games g ${CARD_JOIN} WHERE g.status = 'published' ORDER BY ${order} LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows.map(toCard);
}

export async function gamesByIds(q: Q, ids: number[]): Promise<GameCard[]> {
  const clean = ids.filter((x) => Number.isInteger(x) && x > 0).slice(0, 90);
  if (!clean.length) return [];
  const rows = await q.all<CardRow>(
    `SELECT ${CARD_COLS} FROM games g ${CARD_JOIN} WHERE g.id IN (${clean.map(() => '?').join(',')}) AND +g.status = 'published'`,
    clean,
  );
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return clean.map((id) => byId.get(id)).filter((x): x is GameCard => !!x);
}

/** /games/ directory: newest additions first, paged by dir_seq ranges (O(page) reads, deterministic). */
export async function directoryPage(q: Q, maxSeq: number, page: number, pageSize: number = SITE.pageSize): Promise<Paged<GameCard>> {
  const hi = maxSeq - (page - 1) * pageSize;
  const lo = hi - pageSize;
  const rows = await q.all<CardRow>(
    `SELECT ${CARD_COLS} FROM games g ${CARD_JOIN} WHERE g.dir_seq > ? AND g.dir_seq <= ? AND g.status = 'published' ORDER BY g.dir_seq DESC LIMIT ?`,
    [lo, hi, pageSize],
  );
  const pages = Math.max(1, Math.ceil(maxSeq / pageSize));
  return { items: rows.map(toCard), page, pageSize, total: maxSeq, pages };
}

// ── Filters (client state lives in the URL fragment; this is the JSON API behind it) ──
type Players = '1' | '2';
type Style = '2d' | '3d' | 'pixel';
type Controls = 'keyboard' | 'mouse' | 'touch';
export interface FilterInput {
  cat: CategoryInfo | null;
  /** Subcategories of `cat` (OR). */
  sub: CategoryInfo[];
  /** Curated tag groups (OR). */
  theme: ThemeDef[];
  /** Text search inside the list (FTS). */
  q: { match: string; norm: string } | null;
  device: 'mobile' | null;
  players: Players[];
  mode: 'local' | 'online' | null;
  style: Style[];
  controls: Controls[];
  sort: ListSort;
  page: number;
}

const MAX_MULTI = 5;

export function parseFilters(sp: URLSearchParams, cats: CategoryInfo[]): FilterInput | null {
  const pick = <T extends string>(k: string, allowed: readonly T[]): T | null | undefined => {
    const v = sp.get(k);
    if (v === null || v === '') return null;
    return (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
  };
  /** Comma list; undefined = invalid. Duplicates are dropped. */
  const list = <T extends string>(k: string, allowed: readonly T[]): T[] | undefined => {
    const v = sp.get(k);
    if (v === null || v === '') return [];
    const parts = [...new Set(v.split(','))];
    if (parts.length > MAX_MULTI || parts.some((x) => !(allowed as readonly string[]).includes(x))) return undefined;
    return parts as T[];
  };
  const catSlug = sp.get('cat');
  const cat = catSlug ? cats.find((c) => c.slug === catSlug) ?? null : null;
  if (catSlug && !cat) return null;
  const subSlugs = list('sub', cat ? cats.filter((c) => c.parent === cat.slug).map((c) => c.slug) : []);
  const themeSlugs = list('theme', THEME_SLUGS);
  const rawQ = sp.get('q');
  let text: FilterInput['q'] = null;
  if (rawQ !== null && rawQ !== '') {
    if (rawQ.length > 60) return null;
    text = buildFtsQuery(rawQ);
    if (!text) return null;
  }
  const device = pick('device', ['mobile'] as const);
  const players = list('players', ['1', '2'] as const);
  const mode = pick('mode', ['local', 'online'] as const);
  const style = list('style', ['2d', '3d', 'pixel'] as const);
  const controls = list('controls', ['keyboard', 'mouse', 'touch'] as const);
  const sort = pick('sort', ['featured', 'new', 'az'] as const);
  const page = clampPage(sp.get('page') ?? '1', SITE.maxCategoryPages);
  if ([device, mode, sort].includes(undefined) || [subSlugs, themeSlugs, players, style, controls].includes(undefined) || page === null) return null;
  return {
    cat,
    sub: subSlugs!.map((x) => cats.find((c) => c.slug === x)!),
    theme: themeSlugs!.map((x) => THEMES.find((t) => t.slug === x)!),
    q: text,
    device: device!, players: players!, mode: mode!, style: style!, controls: controls!, sort: sort ?? 'featured', page,
  };
}

const marks = (n: number) => Array.from({ length: n }, () => '?').join(', ');

export async function filterGames(q: Q, f: FilterInput, pageSize: number = SITE.pageSize): Promise<Paged<GameCard> & { capped: boolean }> {
  const where: string[] = [];
  const params: Param[] = [];
  if (f.device) where.push('g.mobile_friendly = 1');
  if (f.players.length) where.push(`(${f.players.map((p) => (p === '1' ? 'g.players_max = 1' : 'g.players_max >= 2')).join(' OR ')})`);
  if (f.mode) {
    where.push('g.multiplayer_mode = ?');
    params.push(f.mode);
  }
  if (f.style.length) {
    where.push(`g.visual_style IN (${marks(f.style.length)})`);
    params.push(...f.style);
  }
  if (f.controls.length) {
    where.push(`(${f.controls.map(() => 'g.controls_inferred LIKE ?').join(' OR ')})`);
    params.push(...f.controls.map((c) => `%"${c}"%`));
  }
  if (f.sub.length) {
    where.push(`EXISTS (SELECT 1 FROM game_categories x WHERE x.category_id IN (${marks(f.sub.length)}) AND x.game_id = g.id AND x.published = 1)`);
    params.push(...f.sub.map((c) => c.id));
  }
  if (f.theme.length) {
    const tags = f.theme.flatMap((t) => t.tags);
    where.push(`EXISTS (SELECT 1 FROM game_tags gt WHERE gt.game_id = g.id AND gt.tag_id IN (SELECT id FROM tags WHERE slug IN (${marks(tags.length)})))`);
    params.push(...tags);
  }
  if (f.q) {
    where.push('g.id IN (SELECT rowid FROM games_fts WHERE games_fts MATCH ?)');
    params.push(f.q.match);
  }
  const extra = where.length ? ' AND ' + where.join(' AND ') : '';
  const CAP = 5000;
  let base: string;
  let baseParams: Param[];
  let order: string;
  if (f.cat) {
    base = `FROM game_categories gc JOIN games g ON g.id = gc.game_id WHERE gc.category_id = ? AND gc.published = 1${extra}`;
    baseParams = [f.cat.id, ...params];
    order = f.sort === 'new' ? 'gc.added_at DESC, gc.game_id' : f.sort === 'az' ? 'g.title_norm, g.id' : 'gc.rank_score DESC, gc.game_id';
  } else {
    base = `FROM games g WHERE g.status = 'published'${extra}`;
    baseParams = params;
    order = f.sort === 'new' ? 'g.added_at DESC, g.id DESC' : f.sort === 'az' ? 'g.title_norm, g.id' : 'g.rank_score DESC, g.id DESC';
  }
  const [rows, cnt] = await Promise.all([
    q.all<CardRow>(`SELECT ${CARD_COLS} ${base.replace('WHERE', `${CARD_JOIN} WHERE`)} ORDER BY ${order} LIMIT ? OFFSET ?`, [...baseParams, pageSize, (f.page - 1) * pageSize]),
    q.all<{ n: number }>(`SELECT count(*) AS n FROM (SELECT 1 ${base} LIMIT ${CAP + 1})`, baseParams),
  ]);
  const n = cnt[0]?.n ?? 0;
  return {
    items: rows.map(toCard), page: f.page, pageSize, total: Math.min(n, CAP), capped: n > CAP,
    pages: Math.min(SITE.maxCategoryPages, Math.max(1, Math.ceil(Math.min(n, CAP) / pageSize))),
  };
}

// ── Facets: per-category option counts for the filter UI (computed offline by the snapshot) ──
export interface Facets {
  sub: Array<{ slug: string; name: string; n: number }>;
  theme: Array<{ slug: string; n: number }>;
  players: Partial<Record<Players, number>>;
  device: number;
  style: Partial<Record<Style, number>>;
  controls: Partial<Record<Controls, number>>;
}

/** All categories in a few GROUP BY passes (snapshot job — not for request time). */
export async function computeFacets(q: Q, cats: CategoryInfo[]): Promise<Record<string, Facets>> {
  const out: Record<string, Facets> = {};
  const byId = new Map(cats.map((c) => [c.id, c]));
  for (const c of cats) out[c.slug] = { sub: [], theme: [], players: {}, device: 0, style: {}, controls: {} };
  // Subcategories: their own counts are the facet counts (a game in a subcategory is shown in its parent's list).
  for (const c of cats) if (c.parent && out[c.parent] && c.count >= MIN_CATEGORY_GAMES) out[c.parent]!.sub.push({ slug: c.slug, name: c.name, n: c.count });
  for (const f of Object.values(out)) f.sub.sort((a, b) => b.n - a.n);
  const attrs = await q.all<{ cid: number; pl: number | null; mob: number | null; vs: string | null; kb: number; ms: number; tc: number; n: number }>(
    `SELECT gc.category_id AS cid, CASE WHEN g.players_max >= 2 THEN 2 WHEN g.players_max = 1 THEN 1 END AS pl, g.mobile_friendly AS mob, g.visual_style AS vs,
            (g.controls_inferred LIKE '%"keyboard"%') AS kb, (g.controls_inferred LIKE '%"mouse"%') AS ms, (g.controls_inferred LIKE '%"touch"%') AS tc, count(*) AS n
       FROM game_categories gc JOIN games g ON g.id = gc.game_id
      WHERE gc.published = 1 GROUP BY 1, 2, 3, 4, 5, 6, 7`,
  );
  const add = <K extends string>(rec: Partial<Record<K, number>>, k: K, n: number) => (rec[k] = (rec[k] ?? 0) + n);
  for (const r of attrs) {
    const c = byId.get(r.cid);
    const f = c && out[c.slug];
    if (!f) continue;
    if (r.pl === 1) add(f.players, '1', r.n);
    if (r.pl === 2) add(f.players, '2', r.n);
    if (r.mob === 1) f.device += r.n;
    if (r.vs === '2d' || r.vs === '3d' || r.vs === 'pixel') add(f.style, r.vs, r.n);
    if (r.kb) add(f.controls, 'keyboard', r.n);
    if (r.ms) add(f.controls, 'mouse', r.n);
    if (r.tc) add(f.controls, 'touch', r.n);
  }
  const tagToTheme = new Map(THEMES.flatMap((t) => t.tags.map((tag) => [tag, t.slug] as const)));
  const allTags = [...tagToTheme.keys()];
  // A game can carry two tags of one theme (logic + logical): count distinct games per theme.
  const themes = await q.all<{ cid: number; theme: string; n: number }>(
    `SELECT cid, theme, count(*) AS n FROM (
        SELECT DISTINCT gc.category_id AS cid, gc.game_id, ${'CASE t.slug ' + THEMES.flatMap((t) => t.tags.map((tag) => `WHEN '${tag}' THEN '${t.slug}'`)).join(' ') + ' END'} AS theme
          FROM tags t JOIN game_tags gt ON gt.tag_id = t.id JOIN game_categories gc ON gc.game_id = gt.game_id
         WHERE t.slug IN (${marks(allTags.length)}) AND gc.published = 1)
      GROUP BY 1, 2`,
    allTags,
  );
  for (const r of themes) {
    const c = byId.get(r.cid);
    if (c && out[c.slug] && r.n >= MIN_CATEGORY_GAMES) out[c.slug]!.theme.push({ slug: r.theme, n: r.n });
  }
  // Whole catalog (/games/): no subcategories, genres are links there.
  const all: Facets = { sub: [], theme: [], players: {}, device: 0, style: {}, controls: {} };
  const ga = await q.all<{ pl: number | null; mob: number | null; vs: string | null; kb: number; ms: number; tc: number; n: number }>(
    `SELECT CASE WHEN players_max >= 2 THEN 2 WHEN players_max = 1 THEN 1 END AS pl, mobile_friendly AS mob, visual_style AS vs,
            (controls_inferred LIKE '%"keyboard"%') AS kb, (controls_inferred LIKE '%"mouse"%') AS ms, (controls_inferred LIKE '%"touch"%') AS tc, count(*) AS n
       FROM games WHERE status = 'published' GROUP BY 1, 2, 3, 4, 5, 6`,
  );
  for (const r of ga) {
    if (r.pl === 1) add(all.players, '1', r.n);
    if (r.pl === 2) add(all.players, '2', r.n);
    if (r.mob === 1) all.device += r.n;
    if (r.vs === '2d' || r.vs === '3d' || r.vs === 'pixel') add(all.style, r.vs, r.n);
    if (r.kb) add(all.controls, 'keyboard', r.n);
    if (r.ms) add(all.controls, 'mouse', r.n);
    if (r.tc) add(all.controls, 'touch', r.n);
  }
  const allThemes = await q.all<{ theme: string; n: number }>(
    `SELECT theme, count(*) AS n FROM (
        SELECT DISTINCT gt.game_id, ${'CASE t.slug ' + THEMES.flatMap((t) => t.tags.map((tag) => `WHEN '${tag}' THEN '${t.slug}'`)).join(' ') + ' END'} AS theme
          FROM tags t JOIN game_tags gt ON gt.tag_id = t.id JOIN games g ON g.id = gt.game_id
         WHERE t.slug IN (${marks(allTags.length)}) AND g.status = 'published')
      GROUP BY 1`,
    allTags,
  );
  for (const r of allThemes) if (r.n >= MIN_CATEGORY_GAMES) all.theme.push({ slug: r.theme, n: r.n });
  all.theme.sort((a, b) => b.n - a.n);
  out[ALL_FACETS] = all;
  for (const f of Object.values(out)) f.theme.sort((a, b) => b.n - a.n);
  return out;
}
/** Facet key for the whole catalog (/games/). */
export const ALL_FACETS = '__all';

// ── Search ──────────────────────────────────────────────────────────────────
/** Builds a safe FTS5 expression: user text never reaches MATCH unescaped. */
export function buildFtsQuery(raw: string): { match: string; norm: string } | null {
  const norm = normTitle(raw.slice(0, 80));
  const tokens = norm.split(' ').filter((t) => t.length > 0).slice(0, 6);
  if (!tokens.length || norm.replace(/ /g, '').length < 2) return null;
  const groups = tokens.map((t) => {
    const alts = [t, ...(SEARCH_SYNONYMS[t] ?? [])].flatMap((a) => a.split(' ').length > 1 ? [`"${a}"`] : [`"${a}"*`]);
    return alts.length > 1 ? `(${[...new Set(alts)].join(' OR ')})` : alts[0]!;
  });
  return { match: groups.join(' AND '), norm };
}

export async function searchGames(q: Q, raw: string, limit: number, offset = 0): Promise<{ items: GameCard[]; total: number; capped: boolean } | null> {
  const fq = buildFtsQuery(raw);
  if (!fq) return null;
  const like = fq.norm.slice(0, 40) + '%';
  const rows = await q.all<CardRow>(
    `SELECT ${CARD_COLS}
       FROM games_fts f JOIN games g ON g.id = f.rowid ${CARD_JOIN}
      WHERE games_fts MATCH ? AND g.status = 'published'
      ORDER BY (g.title_norm = ?) DESC, (g.title_norm LIKE ?) DESC, bm25(games_fts, 10.0, 6.0, 3.0, 1.0), g.rank_score DESC
      LIMIT ? OFFSET ?`,
    [fq.match, fq.norm, like, limit, offset],
  );
  const CAP = 1000;
  const cnt = await q.all<{ n: number }>(
    `SELECT count(*) AS n FROM (SELECT 1 FROM games_fts f JOIN games g ON g.id = f.rowid WHERE games_fts MATCH ? AND g.status = 'published' LIMIT ${CAP + 1})`,
    [fq.match],
  );
  const n = cnt[0]?.n ?? 0;
  return { items: rows.map(toCard), total: Math.min(n, CAP), capped: n > CAP };
}

export async function suggest(q: Q, raw: string): Promise<Array<{ slug: string; title: string; thumb: string; cat: string | null }>> {
  const fq = buildFtsQuery(raw);
  if (!fq) return [];
  const rows = await q.all<CardRow>(
    `SELECT ${CARD_COLS} FROM games_fts f JOIN games g ON g.id = f.rowid ${CARD_JOIN}
      WHERE games_fts MATCH ? AND g.status = 'published'
      ORDER BY (g.title_norm = ?) DESC, (g.title_norm LIKE ?) DESC, bm25(games_fts, 10.0, 6.0, 3.0, 1.0) LIMIT 8`,
    [fq.match, fq.norm, fq.norm.slice(0, 40) + '%'],
  );
  return rows.map((r) => ({ slug: r.slug, title: r.title, thumb: r.thumb_url, cat: r.cat }));
}

// ── Game detail ─────────────────────────────────────────────────────────────
export type GameLookup =
  | { kind: 'ok'; game: GameDetail }
  | { kind: 'redirect'; slug: string }
  | { kind: 'gone' }
  | { kind: 'missing' };

interface DetailRow extends CardRow {
  description: string;
  instructions: string;
  controls_inferred: string | null;
  status: string;
  merged_into: number | null;
  primary_category_id: number | null;
  pc_slug: string | null;
  source_release_date: string | null;
  added_at: string;
  updated_at: string;
  orientation: string | null;
  multiplayer_mode: string | null;
  technology: string | null;
  visual_style: string | null;
  rating_up: number;
  rating_down: number;
  provider_name: string | null;
  width: number | null;
  height: number | null;
}

export async function getGame(q: Q, slug: string): Promise<GameLookup> {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return { kind: 'missing' };
  const [r] = await q.all<DetailRow>(
    `SELECT ${CARD_COLS}, g.description, g.instructions, g.controls_inferred, g.status, g.merged_into, g.primary_category_id, pc.slug AS pc_slug,
            g.source_release_date, g.added_at, g.updated_at, g.orientation, g.multiplayer_mode, g.technology, g.visual_style,
            g.rating_up, g.rating_down, p.name AS provider_name, s.width, s.height
       FROM games g ${CARD_JOIN}
       LEFT JOIN game_sources s ON s.id = g.primary_source_id
       LEFT JOIN providers p ON p.id = s.provider_id
      WHERE g.slug = ? LIMIT 1`,
    [slug],
  );
  if (!r) {
    const [red] = await q.all<{ slug: string }>(
      `SELECT g.slug FROM slug_redirects r JOIN games g ON g.id = r.game_id WHERE r.old_slug = ? AND g.status = 'published' LIMIT 1`,
      [slug],
    );
    return red ? { kind: 'redirect', slug: red.slug } : { kind: 'missing' };
  }
  if (r.status === 'merged' && r.merged_into) {
    const [m] = await q.all<{ slug: string; status: string }>('SELECT slug, status FROM games WHERE id = ? LIMIT 1', [r.merged_into]);
    return m && m.status === 'published' ? { kind: 'redirect', slug: m.slug } : { kind: 'gone' };
  }
  if (r.status === 'archived') return { kind: 'gone' };
  if (r.status !== 'published') return { kind: 'missing' };

  const [cats, tags] = await Promise.all([
    q.all<CategoryRef & { kind: string }>(
      `SELECT c.slug, c.name, c.kind FROM game_categories gc JOIN categories c ON c.id = gc.category_id
        WHERE gc.game_id = ? ORDER BY CASE c.kind WHEN 'genre' THEN 0 WHEN 'subgenre' THEN 1 ELSE 2 END, c.sort LIMIT 20`,
      [r.id],
    ),
    q.all<CategoryRef>('SELECT t.slug, t.name FROM game_tags gt JOIN tags t ON t.id = gt.tag_id WHERE gt.game_id = ? LIMIT 12', [r.id]),
  ]);
  const related = await relatedGames(q, r.id, r.primary_category_id, 24);
  let controls: string[] = [];
  try {
    controls = r.controls_inferred ? (JSON.parse(r.controls_inferred) as string[]).filter((x) => typeof x === 'string') : [];
  } catch {
    controls = [];
  }
  return {
    kind: 'ok',
    game: {
      ...toCard(r),
      description: r.description,
      instructions: r.instructions,
      controls,
      categories: cats.map(({ slug: s, name }) => ({ slug: s, name })),
      tags,
      primaryCategory: r.pc_slug && r.cat ? { slug: r.pc_slug, name: r.cat } : null,
      releaseDate: r.source_release_date,
      addedAt: r.added_at,
      updatedAt: r.updated_at,
      orientation: r.orientation,
      multiplayerMode: r.multiplayer_mode,
      technology: r.technology,
      visualStyle: r.visual_style,
      ratingUp: r.rating_up,
      ratingDown: r.rating_down,
      providerName: r.provider_name,
      width: r.width,
      height: r.height,
      related,
    },
  };
}

/** Related: same primary category, excludes itself and open duplicate candidates; rotates by id so lists differ per game. */
export async function relatedGames(q: Q, gameId: number, categoryId: number | null, limit: number): Promise<GameCard[]> {
  if (!categoryId) return (await topGames(q, 'featured', limit + 1, gameId % 40)).filter((g) => g.id !== gameId).slice(0, limit);
  const run = (offset: number) =>
    q.all<CardRow>(
      `SELECT ${CARD_COLS} FROM game_categories gc JOIN games g ON g.id = gc.game_id ${CARD_JOIN}
        WHERE gc.category_id = ? AND gc.published = 1 AND gc.game_id != ?
          AND gc.game_id NOT IN (SELECT game_b FROM duplicate_candidates WHERE game_a = ? AND status = 'open'
                                 UNION SELECT game_a FROM duplicate_candidates WHERE game_b = ? AND status = 'open')
        ORDER BY gc.rank_score DESC, gc.game_id LIMIT ? OFFSET ?`,
      [categoryId, gameId, gameId, gameId, limit, offset],
    );
  const offset = (gameId % 8) * limit;
  let rows = await run(offset);
  if (rows.length < Math.min(limit, 6) && offset > 0) rows = await run(0);
  return rows.map(toCard);
}

export async function getSetting(q: Q, key: string): Promise<string | null> {
  const [r] = await q.all<{ value: string }>('SELECT value FROM site_settings WHERE key = ? LIMIT 1', [key]);
  return r?.value ?? null;
}

// ── SEO landings ────────────────────────────────────────────────────────────
export interface Landing {
  slug: string;
  h1: string;
  title: string;
  description: string;
  intro: string;
  all: string[];
  indexable: boolean;
  minGames: number;
}

export async function getLandings(q: Q, includeDrafts = false): Promise<Landing[]> {
  const rows = await q.all<{ slug: string; h1: string; title: string; description: string; intro: string; filter: string; indexable: number; min_games: number }>(
    `SELECT slug, h1, title, description, intro, filter, indexable, min_games FROM seo_landings ${includeDrafts ? '' : "WHERE status = 'published'"} ORDER BY slug LIMIT 500`,
  );
  return rows.map((r) => {
    let all: string[] = [];
    try {
      const f = JSON.parse(r.filter) as { all?: unknown };
      all = Array.isArray(f.all) ? f.all.filter((x): x is string => typeof x === 'string').slice(0, 3) : [];
    } catch {
      all = [];
    }
    return { slug: r.slug, h1: r.h1, title: r.title, description: r.description, intro: r.intro, all, indexable: r.indexable === 1, minGames: r.min_games };
  });
}

/** Games that are in ALL listed categories (2–3 way intersection), best first. */
export async function landingGames(q: Q, cats: CategoryInfo[], slugs: string[], limit: number): Promise<{ items: GameCard[]; total: number }> {
  const ids = slugs.map((s) => cats.find((c) => c.slug === s)?.id).filter((x): x is number => !!x);
  if (ids.length !== slugs.length || ids.length < 1) return { items: [], total: 0 };
  // Drive from the smallest category.
  const sorted = [...ids].sort((a, b) => (cats.find((c) => c.id === a)!.count - cats.find((c) => c.id === b)!.count));
  const [first, ...rest] = sorted;
  const joins = rest.map((_, i) => `JOIN game_categories x${i} ON x${i}.game_id = gc.game_id AND x${i}.category_id = ?`).join(' ');
  const params: Param[] = [...rest, first!];
  const rows = await q.all<CardRow>(
    `SELECT ${CARD_COLS} FROM game_categories gc ${joins} JOIN games g ON g.id = gc.game_id ${CARD_JOIN}
      WHERE gc.category_id = ? AND gc.published = 1 ORDER BY gc.rank_score DESC, gc.game_id LIMIT ?`,
    [...params, limit],
  );
  const cnt = await q.all<{ n: number }>(
    `SELECT count(*) AS n FROM game_categories gc ${joins} WHERE gc.category_id = ? AND gc.published = 1`,
    params,
  );
  return { items: rows.map(toCard), total: cnt[0]?.n ?? 0 };
}

/**
 * Batch detail loader for the snapshot export: 3 queries per 90 games instead of
 * ~5 per game. `related` is left empty — the snapshot fills it from category lists.
 */
export async function getGamesBatch(q: Q, ids: number[]): Promise<GameDetail[]> {
  const out: GameDetail[] = [];
  const kindOrder = (k: string) => (k === 'genre' ? 0 : k === 'subgenre' ? 1 : 2);
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const ph = chunk.map(() => '?').join(',');
    const [rows, cats, tags] = await Promise.all([
      q.all<DetailRow>(
        `SELECT ${CARD_COLS}, g.description, g.instructions, g.controls_inferred, g.status, g.merged_into, g.primary_category_id, pc.slug AS pc_slug,
                g.source_release_date, g.added_at, g.updated_at, g.orientation, g.multiplayer_mode, g.technology, g.visual_style,
                g.rating_up, g.rating_down, p.name AS provider_name, s.width, s.height
           FROM games g ${CARD_JOIN}
           LEFT JOIN game_sources s ON s.id = g.primary_source_id
           LEFT JOIN providers p ON p.id = s.provider_id
          WHERE g.id IN (${ph}) AND +g.status = 'published'` /* unary + keeps SQLite on the primary key instead of the status index */,
        chunk,
      ),
      q.all<CategoryRef & { game_id: number; kind: string; sort: number }>(
        `SELECT gc.game_id, c.slug, c.name, c.kind, c.sort FROM game_categories gc JOIN categories c ON c.id = gc.category_id WHERE gc.game_id IN (${ph})`,
        chunk,
      ),
      q.all<CategoryRef & { game_id: number }>(`SELECT gt.game_id, t.slug, t.name FROM game_tags gt JOIN tags t ON t.id = gt.tag_id WHERE gt.game_id IN (${ph})`, chunk),
    ]);
    for (const r of rows) {
      let controls: string[] = [];
      try {
        controls = r.controls_inferred ? (JSON.parse(r.controls_inferred) as string[]) : [];
      } catch {
        controls = [];
      }
      out.push({
        ...toCard(r),
        description: r.description,
        instructions: r.instructions,
        controls,
        categories: cats.filter((c) => c.game_id === r.id).sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.sort - b.sort).map(({ slug, name }) => ({ slug, name })),
        tags: tags.filter((t) => t.game_id === r.id).slice(0, 12).map(({ slug, name }) => ({ slug, name })),
        primaryCategory: r.pc_slug && r.cat ? { slug: r.pc_slug, name: r.cat } : null,
        releaseDate: r.source_release_date,
        addedAt: r.added_at,
        updatedAt: r.updated_at,
        orientation: r.orientation,
        multiplayerMode: r.multiplayer_mode,
        technology: r.technology,
        visualStyle: r.visual_style,
        ratingUp: r.rating_up,
        ratingDown: r.rating_down,
        providerName: r.provider_name,
        width: r.width,
        height: r.height,
        related: [],
      });
    }
  }
  return out;
}
