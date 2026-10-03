import type { APIRoute } from 'astro';
import { q } from '../lib/server/db';
import { GAMES_PER_SITEMAP, day, xml } from '../lib/server/sitemap';
import { OTHER_LANGS } from '../i18n/locales';
export const prerender = false;
export const GET: APIRoute = async () => {
  const db = q();
  // One entry per non-empty games-N part, with the newest change in it as lastmod (no empty parts → no 404 sitemaps).
  const [[r], parts] = await Promise.all([
    db.all<{ last: string | null; catlast: string | null }>(
      "SELECT (SELECT max(updated_at) FROM games WHERE status = 'published') AS last, (SELECT max(updated_at) FROM categories) AS catlast",
    ),
    db.all<{ part: number; last: string | null }>(
      `SELECT (id - 1) / ${GAMES_PER_SITEMAP} + 1 AS part, max(updated_at) AS last FROM games WHERE status = 'published' GROUP BY part ORDER BY part`,
    ),
  ]);
  const loc = (n: string, lastmod?: string | null) => `<sitemap><loc>https://pixuvo.com/sitemaps/${n}.xml</loc>${lastmod ? `<lastmod>${day(lastmod)}</lastmod>` : ''}</sitemap>`;
  const items = [loc('pages', r?.last), loc('categories', r?.catlast), ...parts.map((x) => loc(`games-${x.part}`, x.last))];
  for (const lang of OTHER_LANGS) items.push(loc(`${lang}-pages`, r?.last), loc(`${lang}-categories`, r?.catlast));
  // Localised game pages are indexable only with Pixuvo's own text (hero games): one sitemap per language that has some.
  const ed = await db.all<{ lang: string; last: string | null }>('SELECT lang, max(updated_at) AS last FROM game_editorial GROUP BY lang');
  for (const e of ed) if (OTHER_LANGS.includes(e.lang)) items.push(loc(`${e.lang}-games-1`, e.last));
  return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join('')}</sitemapindex>`);
};
