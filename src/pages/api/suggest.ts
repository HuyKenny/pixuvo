import type { APIRoute } from 'astro';
import { suggest } from '../../lib/catalog';
import { categoriesCached, q } from '../../lib/server/db';
import { json } from '../../lib/server/http';
import { apiLang, categoryHits, localiseCards, markLocalPages } from '../../lib/server/i18n-api';
export const prerender = false;
export const GET: APIRoute = async ({ url }) => {
  const raw = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (raw.length < 2) return json({ items: [] }, { cache: 'public' });
  const lang = apiLang(url);
  const db = q();
  const [games, cats] = await Promise.all([suggest(db, raw), categoriesCached(db)]);
  // Game titles are English; category names are matched in the visitor's language too.
  const hits = await categoryHits(raw, lang, cats);
  const items = [...hits, ...(await markLocalPages(db, await localiseCards(games, lang), lang))].slice(0, 8);
  return json({ items }, { cache: 'public' });
};
