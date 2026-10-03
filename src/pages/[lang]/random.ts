/** GET /{lang}/random/ — like /random/, but stays in the visitor's language. */
import type { APIRoute } from 'astro';
import { q } from '../../lib/server/db';
import { validLang } from '../../views/guard';
export const prerender = false;
export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang ?? '';
  if (!validLang(lang)) return new Response('Not found', { status: 404 });
  const offset = Math.floor(Math.random() * 300);
  const rows = await q().all<{ slug: string }>("SELECT slug FROM games WHERE status = 'published' ORDER BY rank_score DESC, id DESC LIMIT 1 OFFSET ?", [offset]);
  const slug = rows[0]?.slug;
  return new Response(null, { status: 302, headers: { location: slug ? `/${lang}/games/${slug}/` : `/${lang}/`, 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
};
