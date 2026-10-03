/** GET /api/games/?cat=&sub=&theme=&q=&device=&players=&mode=&style=&controls=&sort=&page=&lang= — JSON behind fragment filters. */
import type { APIRoute } from 'astro';
import { filterGames, parseFilters } from '../../lib/catalog';
import { categoriesCached, q } from '../../lib/server/db';
import { error, json } from '../../lib/server/http';
import { apiLang, localiseCards } from '../../lib/server/i18n-api';
export const prerender = false;
const ALLOWED = new Set(['cat', 'sub', 'theme', 'q', 'device', 'players', 'mode', 'style', 'controls', 'sort', 'page', 'lang']);
export const GET: APIRoute = async ({ url }) => {
  for (const k of url.searchParams.keys()) if (!ALLOWED.has(k)) return error(400, `Unknown parameter ${k.slice(0, 20)}`);
  const db = q();
  const cats = await categoriesCached(db);
  const f = parseFilters(url.searchParams, cats);
  if (!f) return error(400, 'Invalid filter.');
  const res = await filterGames(db, f);
  return json({ ...res, items: await localiseCards(res.items, apiLang(url)) }, { cache: 'public' });
};
