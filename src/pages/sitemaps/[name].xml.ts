/** Sitemaps contain only indexable canonical URLs with real lastmod dates. */
import type { APIRoute } from 'astro';
import { getLandings } from '../../lib/catalog';
import { categoriesCached, q } from '../../lib/server/db';
import { GAMES_PER_SITEMAP, day, esc, xml } from '../../lib/server/sitemap';
import { MIN_CATEGORY_GAMES } from '../../lib/taxonomy';
export const prerender = false;

const STATIC_PAGES: Array<[string, string]> = [
  ['/', ''], ['/games/', ''], ['/categories/', '2026-10-02'], ['/new-games/', ''],
  ['/parents/', '2026-10-02'], ['/about/', '2026-10-02'], ['/contact/', '2026-10-02'], ['/privacy/', '2026-10-02'], ['/cookies/', '2026-10-02'], ['/terms/', '2026-10-02'], ['/copyright/', '2026-10-02'],
];

const url = (loc: string, lastmod: string | null) => `<url><loc>https://pixuvo.com${esc(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
const urlset = (items: string[]) => xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join('')}</urlset>`);

export const GET: APIRoute = async ({ params }) => {
  const name = params.name ?? '';
  const db = q();
  if (name === 'pages') {
    const [r] = await db.all<{ last: string | null }>("SELECT max(added_at) AS last FROM games WHERE status = 'published'");
    return urlset(STATIC_PAGES.map(([p, d]) => url(p, d || day(r?.last))));
  }
  if (name === 'categories') {
    const cats = (await categoriesCached(db)).filter((c) => c.count >= MIN_CATEGORY_GAMES);
    const updated = await db.all<{ slug: string; updated_at: string }>('SELECT slug, updated_at FROM categories');
    const u = new Map(updated.map((x) => [x.slug, x.updated_at]));
    const lands = (await getLandings(db)).filter((l) => l.indexable);
    const lu = await db.all<{ slug: string; updated_at: string }>("SELECT slug, updated_at FROM seo_landings WHERE status = 'published'");
    const lm = new Map(lu.map((x) => [x.slug, x.updated_at]));
    return urlset([...cats.map((c) => url(`/${c.slug}-games/`, day(u.get(c.slug)))), ...lands.map((l) => url(`/${l.slug}-games/`, day(lm.get(l.slug))))]);
  }
  const m = /^games-(\d{1,4})$/.exec(name);
  if (m) {
    const n = Number(m[1]);
    if (n < 1) return new Response('Not found', { status: 404 });
    const rows = await db.all<{ slug: string; updated_at: string }>(
      "SELECT slug, updated_at FROM games WHERE id > ? AND id <= ? AND status = 'published' ORDER BY id LIMIT ?",
      [(n - 1) * GAMES_PER_SITEMAP, n * GAMES_PER_SITEMAP, GAMES_PER_SITEMAP],
    );
    if (!rows.length) return new Response('Not found', { status: 404 });
    return urlset(rows.map((r) => url(`/games/${r.slug}/`, day(r.updated_at))));
  }
  return new Response('Not found', { status: 404 });
};
