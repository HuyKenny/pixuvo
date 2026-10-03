import { beforeAll, describe, expect, it } from 'vitest';
import { runImport } from '../../scripts/import/pipeline.ts';
import { gamemonetize } from '../../scripts/import/adapters/gamemonetize.ts';
import { ALL_FACETS, DIR_BOUNDS_SQL, parseBounds, categoryGames, computeFacets, directoryPage, filterGames, getCategories, getGame, landingGames, parseFilters, relatedGames, searchGames, suggest } from '../../src/lib/catalog.ts';
import { asQ, freshDb, GM_CONFIG, gmFeed, gmItem } from '../helpers.ts';

const db = freshDb();
const q = asQ(db);

beforeAll(async () => {
  const items = [
    gmItem(1, { title: 'Car Rush', tags: 'car, racing, mobile' }),
    gmItem(2, { title: 'Carnival Puzzle', category: 'Puzzle', tags: 'puzzle', description: 'Match colourful carnival tiles.' }),
    gmItem(3, { title: 'Super Car Drift', tags: 'car, drift, 3d, 2 player' }),
    gmItem(4, { title: 'Soccer Heads', category: 'Sports', tags: 'soccer, 2 player', description: 'Head the ball into the goal.' }),
    gmItem(5, { title: 'Pixel Racer', tags: 'racing, pixel, 1 player', instructions: 'Click to accelerate.' }),
    ...Array.from({ length: 20 }, (_, i) => gmItem(100 + i, { title: `Racing Filler ${i}`, tags: 'car, racing, cars' })),
  ];
  await runImport(db, gamemonetize, { dryRun: false, budgetRows: 1e6, config: GM_CONFIG, fetchJson: gmFeed([items]), minCompleteItems: 1 });
});

describe('catalog queries', () => {
  it('search ranks exact title, then prefix, then other matches', async () => {
    const r = (await searchGames(q, 'car rush', 10))!;
    expect(r.items[0]!.title).toBe('Car Rush');
    const r2 = (await searchGames(q, 'car', 10))!;
    expect(r2.items.slice(0, 2).map((g) => g.title)).toEqual(expect.arrayContaining(['Car Rush']));
    expect(r2.items[0]!.title.toLowerCase().startsWith('car')).toBe(true);
  });
  it('search uses synonyms (soccer → football category label)', async () => {
    const r = (await searchGames(q, 'football', 10))!;
    expect(r.items.map((g) => g.title)).toContain('Soccer Heads');
  });
  it('hostile input does not break the query', async () => {
    for (const raw of ['"', 'a" OR "b', 'NEAR(x y)', '*', 'car:*', "'); DROP TABLE games; --"]) {
      await expect(searchGames(q, raw, 5)).resolves.toBeDefined();
      await expect(suggest(q, raw)).resolves.toBeDefined();
    }
    expect((await db.all('SELECT count(*) AS n FROM games')).rows).toEqual([{ n: 25 }]);
  });
  it('filters combine correctly', async () => {
    const cats = await getCategories(q);
    const racing2 = await filterGames(q, parseFilters(new URLSearchParams('cat=racing&players=2'), cats)!);
    expect(racing2.items.map((g) => g.title)).toEqual(expect.arrayContaining(['Super Car Drift']));
    expect(racing2.items.every((g) => (g.players ?? 0) >= 2)).toBe(true);
    const mobile = await filterGames(q, parseFilters(new URLSearchParams('device=mobile'), cats)!);
    expect(mobile.items.map((g) => g.title)).toEqual(['Car Rush']);
    const pixel = await filterGames(q, parseFilters(new URLSearchParams('style=pixel&controls=mouse'), cats)!);
    expect(pixel.items.map((g) => g.title)).toEqual(['Pixel Racer']);
    const none = await filterGames(q, parseFilters(new URLSearchParams('cat=sports&style=pixel'), cats)!);
    expect(none.total).toBe(0);
  });
  it('subcategory, theme, text and OR filters', async () => {
    const cats = await getCategories(q);
    const titles = async (qs: string) => (await filterGames(q, parseFilters(new URLSearchParams(qs), cats)!)).items.map((g) => g.title);
    if (cats.some((c) => c.slug === 'drift' && c.parent === 'racing')) expect(await titles('cat=racing&sub=drift')).toEqual(['Super Car Drift']);
    expect(await titles('cat=racing&q=drift')).toEqual(['Super Car Drift']);
    expect(await titles('cat=racing&q=pixel racer')).toEqual(['Pixel Racer']);
    const cars = await titles('cat=racing&theme=cars');
    expect(cars).toContain('Racing Filler 0');
    expect(cars).not.toContain('Pixel Racer');
    const both = await titles('players=1,2');
    expect(both).toEqual(expect.arrayContaining(['Pixel Racer', 'Super Car Drift', 'Soccer Heads']));
    expect(await titles('cat=racing&q=zzzz nothing')).toEqual([]);
  });
  it('facets count options per category and for the whole catalog', async () => {
    const cats = await getCategories(q);
    const f = await computeFacets(q, cats);
    expect(f.racing!.players['2']).toBeGreaterThanOrEqual(1);
    expect(f.racing!.theme.find((t) => t.slug === 'cars')?.n).toBeGreaterThanOrEqual(12);
    expect(f[ALL_FACETS]!.device).toBe(1);
    expect(f.racing!.sub.every((s) => s.n >= 12)).toBe(true);
  });
  it('category pages are paged deterministically', async () => {
    const cats = await getCategories(q);
    const racing = cats.find((c) => c.slug === 'racing')!;
    const p1 = await categoryGames(q, racing, 'featured', 1, 10);
    const p2 = await categoryGames(q, racing, 'featured', 2, 10);
    expect(p1.items).toHaveLength(10);
    expect(new Set([...p1.items, ...p2.items].map((g) => g.id)).size).toBe(p1.items.length + p2.items.length);
    expect((await categoryGames(q, racing, 'featured', 1, 10)).items.map((g) => g.id)).toEqual(p1.items.map((g) => g.id));
  });
  it('landing intersections return only games in all categories', async () => {
    const cats = await getCategories(q);
    const r = await landingGames(q, cats, ['racing', '2-player'], 50);
    expect(r.items.map((g) => g.title)).toEqual(['Super Car Drift']);
    expect(r.total).toBe(1);
  });
  it('directory pages are always full even with unpublished games in between', async () => {
    await db.batch([{ sql: "UPDATE games SET status = 'hidden' WHERE title IN ('Racing Filler 3', 'Racing Filler 7', 'Racing Filler 12')" }]);
    // Same statement the importer/admin run; page size here is the site's 48, so use 10 via a local copy.
    await db.batch([{ sql: DIR_BOUNDS_SQL.replace(/% \d+ = 0/, '% 10 = 0') }]);
    const bounds = parseBounds((await db.all<{ value: string }>("SELECT value FROM site_settings WHERE key = 'dir_bounds'")).rows[0]!.value);
    expect(bounds).toHaveLength(3); // 22 published games → 10 + 10 + 2
    const p1 = await directoryPage(q, bounds, 22, 1, 10);
    const p2 = await directoryPage(q, bounds, 22, 2, 10);
    const p3 = await directoryPage(q, bounds, 22, 3, 10);
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([10, 10, 2]);
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((g) => g.id)).size).toBe(22);
    expect(p1.pages).toBe(3);
    await db.batch([{ sql: "UPDATE games SET status = 'published' WHERE title IN ('Racing Filler 3', 'Racing Filler 7', 'Racing Filler 12')" }]);
  });
  it('game lookup handles ok / redirect / gone / missing; related excludes itself', async () => {
    const ok = await getGame(q, 'car-rush');
    expect(ok.kind).toBe('ok');
    if (ok.kind === 'ok') {
      expect(ok.game.related.some((g) => g.slug === 'car-rush')).toBe(false);
      const rel = await relatedGames(q, ok.game.id, null, 5);
      expect(rel.some((g) => g.id === ok.game.id)).toBe(false);
    }
    await db.batch([
      { sql: "INSERT INTO slug_redirects (old_slug, game_id, created_at) VALUES ('old-car-rush', (SELECT id FROM games WHERE slug = 'car-rush'), 'x')" },
      { sql: "UPDATE games SET status = 'archived' WHERE slug = 'pixel-racer'" },
      { sql: "UPDATE games SET status = 'hidden' WHERE slug = 'soccer-heads'" },
    ]);
    expect(await getGame(q, 'old-car-rush')).toEqual({ kind: 'redirect', slug: 'car-rush' });
    expect(await getGame(q, 'pixel-racer')).toEqual({ kind: 'gone' });
    expect(await getGame(q, 'soccer-heads')).toEqual({ kind: 'missing' });
    expect(await getGame(q, 'nope')).toEqual({ kind: 'missing' });
    expect(await getGame(q, '../etc/passwd')).toEqual({ kind: 'missing' });
  });
});
