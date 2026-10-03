/**
 * Exports the catalog snapshot used by prerendered pages:
 *   src/data/snapshot/site.json   categories, home sections, category first pages, landings
 *   src/data/snapshot/games.json  details of the top-N games that get static pages
 * Source is local D1 (dev) or production D1 (publish). Prerendered pages read ONLY
 * this snapshot; everything else is rendered from D1 at request time.
 *
 *   tsx scripts/snapshot.ts --target local|remote [--games 3000]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { NEIGHBORS, parseEditorial, categoryGames, computeFacets, gamesByIds, getCategories, getGamesBatch, getLandings, getSetting, landingGames, topGames, type Q } from '../src/lib/catalog.ts';
import { MIN_CATEGORY_GAMES, THEMES } from '../src/lib/taxonomy.ts';
import type { GameCard, GameDetail } from '../src/lib/types.ts';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'local' }, games: { type: 'string', default: '3000' }, out: { type: 'string', default: 'src/data/snapshot' } } });
const cfg = loadConfig();
const db = openTarget(values.target!, cfg);
let reads = 0;
const q: Q = { all: async (sql, params = []) => { const r = await db.all(sql, params as never); reads += r.meta.rows_read; if (process.env.SNAPSHOT_DEBUG && r.meta.rows_read > 5000) console.log(r.meta.rows_read, sql.replace(/\s+/g, " ").slice(0, 140)); return r.rows as never; } };

const HOME_SECTIONS = ['puzzle', 'action', 'racing', 'arcade', 'shooting', 'sports', '2-player', 'dress-up', 'simulation', 'io'];

const t0 = Date.now();
const [dataVersion, maxSeqRaw, popularRaw, trendingRaw] = await Promise.all([getSetting(q, 'data_version'), getSetting(q, 'max_dir_seq'), getSetting(q, 'list:popular'), getSetting(q, 'list:trending')]);
const categories = await getCategories(q);
const live = categories.filter((c) => c.count >= MIN_CATEGORY_GAMES);
const published = Number((await getSetting(q, 'published_count')) ?? 0);

const featured = await topGames(q, 'featured', 36);
const newest = await topGames(q, 'new', 18);
const sections: Array<{ slug: string; name: string; count: number; games: GameCard[] }> = [];
const categoryPages: Record<string, GameCard[]> = {};
for (const c of live) {
  const page = await categoryGames(q, c, 'featured', 1);
  categoryPages[c.slug] = page.items;
  if (HOME_SECTIONS.includes(c.slug)) sections.push({ slug: c.slug, name: c.name, count: c.count, games: page.items.slice(0, 12) });
}
sections.sort((a, b) => HOME_SECTIONS.indexOf(a.slug) - HOME_SECTIONS.indexOf(b.slug));

const facets = await computeFacets(q, categories);

const landings = [];
for (const l of await getLandings(q)) {
  const r = await landingGames(q, categories, l, 96);
  if (r.total >= l.minGames) landings.push({ ...l, count: r.total, games: r.items });
  else console.warn(`landing ${l.slug}: only ${r.total} games (< ${l.minGames}) — not published`);
}

const ids = (raw: string | null) => { try { const a = JSON.parse(raw ?? 'null'); return Array.isArray(a) ? a.filter(Number.isInteger) as number[] : null; } catch { return null; } };
const popularIds = ids(popularRaw);
const trendingIds = ids(trendingRaw);
// Most played this week (real plays, ranked by scripts/metrics.ts) for the homepage leaderboard.
const popular = popularIds?.length ? (await gamesByIds(q, popularIds.slice(0, 12))) : [];
// Game of the day: one of the top featured games, the same for everyone all day (snapshot runs daily).
const dayNo = Math.floor(Date.now() / 86_400_000);
const gameOfDay = featured.length ? featured[dayNo % Math.min(featured.length, 36)]! : null;
// Real number of game starts yesterday (UTC), shown only when it is a meaningful number.
const playsYesterday = Number((await q.all<{ n: number | null }>("SELECT sum(play_clicks) AS n FROM aggregate_metrics WHERE day = date('now', '-1 day')"))[0]?.n ?? 0);

// Static detail pages: the best-ranked games, plus everything already on the homepage.
const N = Math.max(0, Math.min(15_000, Number(values.games)));
const idRows = await q.all<{ id: number }>(`SELECT id FROM games WHERE status = 'published' ORDER BY rank_score DESC, id DESC LIMIT ?`, [N]);
// Hero games (Pixuvo's own texts) are always prerendered in English.
const heroRows = await q.all<{ game_id: number }>("SELECT DISTINCT e.game_id FROM game_editorial e JOIN games g ON g.id = e.game_id WHERE g.status = 'published'");
const wanted = [...new Set([...idRows.map((r) => r.id), ...heroRows.map((r) => r.game_id), ...featured.map((g) => g.id), ...newest.map((g) => g.id)])];
const details: GameDetail[] = await getGamesBatch(q, wanted);
const edRows = await q.all<{ game_id: number; lang: string; summary: string; how_to: string; tips_json: string; faq_json: string }>('SELECT game_id, lang, summary, how_to, tips_json, faq_json FROM game_editorial');
for (const d of details) {
  const mine = edRows.filter((r) => r.game_id === d.id);
  const en = mine.find((r) => r.lang === 'en');
  d.editorial = en ? parseEditorial(en) : null;
  d.editorialLangs = mine.map((r) => r.lang);
}
// Related games for static pages: same primary category (its top list), never the game itself, rotated by id.
for (const d of details) {
  const pool = (d.primaryCategory ? categoryPages[d.primaryCategory.slug] : featured) ?? featured;
  const others = pool.filter((g) => g.id !== d.id);
  const start = others.length ? d.id % others.length : 0;
  d.related = [...others.slice(start), ...others.slice(0, start)].slice(0, 24);
}
// Neighbours (next games of the primary category by id, wrapping): one id list per category, cards in batches.
const catIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
const idsByCat = new Map<number, number[]>();
for (const catId of new Set(details.map((d) => (d.primaryCategory ? catIdBySlug.get(d.primaryCategory.slug) : undefined)).filter((x): x is number => !!x))) {
  idsByCat.set(catId, (await q.all<{ game_id: number }>('SELECT game_id FROM game_categories WHERE category_id = ? AND published = 1 ORDER BY game_id', [catId])).map((r) => r.game_id));
}
const neighborIds = new Map<number, number[]>();
for (const d of details) {
  const ids = d.primaryCategory ? idsByCat.get(catIdBySlug.get(d.primaryCategory.slug) ?? -1) : undefined;
  if (!ids?.length) continue;
  let i = ids.findIndex((x) => x > d.id);
  if (i < 0) i = 0;
  const out: number[] = [];
  for (let k = 0; out.length < NEIGHBORS && k < ids.length; k++) { const id = ids[(i + k) % ids.length]!; if (id !== d.id) out.push(id); }
  neighborIds.set(d.id, out);
}
const allNeighborIds = [...new Set([...neighborIds.values()].flat())];
const neighborCards = new Map<number, GameCard>();
for (let i = 0; i < allNeighborIds.length; i += 90) for (const g of await gamesByIds(q, allNeighborIds.slice(i, i + 90))) neighborCards.set(g.id, g);
for (const d of details) d.neighbors = (neighborIds.get(d.id) ?? []).map((id) => neighborCards.get(id)).filter((g): g is NonNullable<typeof g> => !!g);

mkdirSync(values.out!, { recursive: true });
const site = {
  generatedAt: new Date().toISOString(),
  dataVersion: dataVersion ?? '0',
  published,
  maxDirSeq: Number(maxSeqRaw ?? 0),
  categories,
  home: { featured, newest, sections, hasPopular: !!popularIds?.length, hasTrending: !!trendingIds?.length, popular, gameOfDay, playsYesterday },
  categoryPages,
  landings,
};
// Filter option counts: a static file the filter sheet fetches (also for SSR pages, which cannot import the snapshot).
mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/facets.json', JSON.stringify({ generatedAt: site.generatedAt, themes: THEMES.map(({ slug, name, emoji }) => ({ slug, name, emoji })), facets }));
writeFileSync(`${values.out}/site.json`, JSON.stringify(site));
writeFileSync(`${values.out}/games.json`, JSON.stringify(details));
console.log(`snapshot: ${published} published, ${live.length} live categories, ${landings.length} landings, ${details.length} static game pages, ${reads} rows read, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
db.close?.();
