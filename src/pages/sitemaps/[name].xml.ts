/**
 * Sitemaps contain only indexable canonical URLs with real lastmod dates.
 *   pages / categories / games-N             English
 *   {lang}-pages / {lang}-categories          every language, with hreflang alternates (xhtml:link)
 */
import type { APIRoute } from 'astro';
import { getLandings } from '../../lib/catalog';
import { categoriesCached, q } from '../../lib/server/db';
import { GAMES_PER_SITEMAP, day, esc, xml } from '../../lib/server/sitemap';
import { MIN_CATEGORY_GAMES } from '../../lib/taxonomy';
import { DEFAULT_LANG, LOCALES, OTHER_LANGS, localePath } from '../../i18n/locales';
export const prerender = false;

const STATIC_PAGES: Array<[string, string]> = [
  ['/', ''], ['/games/', ''], ['/categories/', '2026-10-02'], ['/new-games/', ''],
  ['/parents/', '2026-10-02'], ['/about/', '2026-10-02'], ['/contact/', '2026-10-02'], ['/privacy/', '2026-10-02'], ['/cookies/', '2026-10-02'], ['/terms/', '2026-10-02'], ['/copyright/', '2026-10-02'],
];

const abs = (p: string) => `https://pixuvo.com${esc(p)}`;
const alternates = (path: string) =>
  LOCALES.map((l) => `<xhtml:link rel="alternate" hreflang="${l.tag}" href="${abs(localePath(l.code, path))}"/>`).join('') +
  `<xhtml:link rel="alternate" hreflang="x-default" href="${abs(path)}"/>`;
const url = (lang: string, path: string, lastmod: string | null, alt: boolean) =>
  `<url><loc>${abs(localePath(lang, path))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}${alt ? alternates(path) : ''}</url>`;
const urlset = (items: string[], alt = false) =>
  xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${alt ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''}>${items.join('')}</urlset>`);

export const GET: APIRoute = async ({ params }) => {
  const m = /^(?:([a-z]{2}(?:-[a-z]{4})?)-)?(pages|categories|games-(\d{1,4}))$/.exec(params.name ?? '');
  if (!m) return new Response('Not found', { status: 404 });
  const lang = m[1] ?? DEFAULT_LANG;
  if (lang !== DEFAULT_LANG && !OTHER_LANGS.includes(lang)) return new Response('Not found', { status: 404 });
  const kind = m[3] ? 'games' : m[2]!;
  // Localised game pages are noindex: games sitemaps exist only in English.
  if (kind === 'games' && lang !== DEFAULT_LANG) return new Response('Not found', { status: 404 });
  const db = q();
  if (kind === 'pages') {
    const [r] = await db.all<{ last: string | null }>("SELECT max(added_at) AS last FROM games WHERE status = 'published'");
    return urlset(STATIC_PAGES.map(([p, d]) => url(lang, p, d || day(r?.last), true)), true);
  }
  if (kind === 'categories') {
    const cats = (await categoriesCached(db)).filter((c) => c.count >= MIN_CATEGORY_GAMES);
    const updated = await db.all<{ slug: string; updated_at: string }>('SELECT slug, updated_at FROM categories');
    const u = new Map(updated.map((x) => [x.slug, x.updated_at]));
    const lands = (await getLandings(db)).filter((l) => l.indexable);
    const lu = await db.all<{ slug: string; updated_at: string }>("SELECT slug, updated_at FROM seo_landings WHERE status = 'published'");
    const lm = new Map(lu.map((x) => [x.slug, x.updated_at]));
    return urlset([...cats.map((c) => url(lang, `/${c.slug}-games/`, day(u.get(c.slug)), true)), ...lands.map((l) => url(lang, `/${l.slug}-games/`, day(lm.get(l.slug)), true))], true);
  }
  const n = Number(m[3]);
  if (n < 1) return new Response('Not found', { status: 404 });
  const lo = (n - 1) * GAMES_PER_SITEMAP;
  const hi = n * GAMES_PER_SITEMAP;
  const rows = await db.all<{ id: number; slug: string; updated_at: string }>(
    "SELECT id, slug, updated_at FROM games WHERE id > ? AND id <= ? AND status = 'published' ORDER BY id LIMIT ?",
    [lo, hi, GAMES_PER_SITEMAP],
  );
  if (!rows.length) return new Response('Not found', { status: 404 });
  return urlset(rows.map((r) => url(lang, `/games/${r.slug}/`, day(r.updated_at), false)));
};
