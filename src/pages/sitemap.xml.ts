import type { APIRoute } from 'astro';
import { q } from '../lib/server/db';
import { GAMES_PER_SITEMAP, day, xml } from '../lib/server/sitemap';
export const prerender = false;
export const GET: APIRoute = async () => {
  const db = q();
  const [r] = await db.all<{ maxid: number | null; last: string | null; catlast: string | null }>(
    "SELECT (SELECT max(id) FROM games WHERE status = 'published') AS maxid, (SELECT max(updated_at) FROM games WHERE status = 'published') AS last, (SELECT max(updated_at) FROM categories) AS catlast",
  );
  const parts = Math.max(1, Math.ceil((r?.maxid ?? 0) / GAMES_PER_SITEMAP));
  const items = [
    `<sitemap><loc>https://pixuvo.com/sitemaps/pages.xml</loc></sitemap>`,
    `<sitemap><loc>https://pixuvo.com/sitemaps/categories.xml</loc>${r?.catlast ? `<lastmod>${day(r.catlast)}</lastmod>` : ''}</sitemap>`,
    ...Array.from({ length: parts }, (_, i) => `<sitemap><loc>https://pixuvo.com/sitemaps/games-${i + 1}.xml</loc></sitemap>`),
  ];
  return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join('')}</sitemapindex>`);
};
