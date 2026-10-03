import type { APIRoute } from 'astro';
import { q } from '../lib/server/db';
import { getEnv } from '../lib/server/env';
import { GAMES_PER_SITEMAP, day, xml } from '../lib/server/sitemap';
import { OTHER_LANGS } from '../i18n/locales';
export const prerender = false;
export const GET: APIRoute = async () => {
  const db = q();
  const [r] = await db.all<{ maxid: number | null; last: string | null; catlast: string | null }>(
    "SELECT (SELECT max(id) FROM games WHERE status = 'published') AS maxid, (SELECT max(updated_at) FROM games WHERE status = 'published') AS last, (SELECT max(updated_at) FROM categories) AS catlast",
  );
  const parts = Math.max(1, Math.ceil((r?.maxid ?? 0) / GAMES_PER_SITEMAP));
  const loc = (n: string, lastmod?: string | null) => `<sitemap><loc>https://pixuvo.com/sitemaps/${n}.xml</loc>${lastmod ? `<lastmod>${day(lastmod)}</lastmod>` : ''}</sitemap>`;
  const items = [loc('pages'), loc('categories', r?.catlast), ...Array.from({ length: parts }, (_, i) => loc(`games-${i + 1}`))];
  for (const lang of OTHER_LANGS) items.push(loc(`${lang}-pages`), loc(`${lang}-categories`, r?.catlast));
  // Localised game pages are listed only once they have a translated description (others are noindex).
  try {
    const t = await getEnv().I18N?.prepare(`SELECT lang, (game_id - 1) / ${GAMES_PER_SITEMAP} + 1 AS part FROM game_translations GROUP BY lang, part ORDER BY lang, part`).all<{ lang: string; part: number }>();
    for (const x of t?.results ?? []) if (OTHER_LANGS.includes(x.lang)) items.push(loc(`${x.lang}-games-${x.part}`));
  } catch {
    /* translations DB optional */
  }
  return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join('')}</sitemapindex>`);
};
