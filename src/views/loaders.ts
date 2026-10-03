/** Data loaders for on-demand routes (pages decide redirect / 404; views only render). */
import { categoryGames, clampPage, getGame, type GameLookup } from '../lib/catalog';
import { categoriesCached, q } from '../lib/server/db';
import { MIN_CATEGORY_GAMES } from '../lib/taxonomy';
import { SITE, categoryPath } from '../lib/site';
import type { CategoryInfo, Paged, GameCard } from '../lib/types';

export type CategoryPageData = { c: CategoryInfo; cats: CategoryInfo[]; parent: CategoryInfo | null; page: number; res: Paged<GameCard> };
export async function loadCategoryPage(cat: string, n: string): Promise<{ kind: 'ok'; data: CategoryPageData } | { kind: 'redirect'; to: string } | { kind: 'missing' }> {
  const page = clampPage(n, SITE.maxCategoryPages);
  const db = q();
  const cats = await categoriesCached(db);
  const c = cats.find((x) => x.slug === cat && x.count >= MIN_CATEGORY_GAMES);
  if (!c || page === null) return { kind: 'missing' };
  if (page === 1) return { kind: 'redirect', to: categoryPath(c.slug) };
  const res = await categoryGames(db, c, 'featured', page);
  if (page > res.pages || res.items.length === 0) return { kind: 'missing' };
  const parent = c.parent ? cats.find((x) => x.slug === c.parent) ?? null : null;
  return { kind: 'ok', data: { c, cats, parent, page, res } };
}

/** Game detail (the same English record for every language; the page localises around it). */
export async function loadGame(slug: string): Promise<GameLookup> {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return { kind: 'missing' };
  return getGame(q(), slug);
}
