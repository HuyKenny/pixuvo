/** GET /random/ — 302 to a random game among the top 300 (by rank). Never cached, never indexed. */
import type { APIRoute } from 'astro';
import { q } from '../lib/server/db';
export const prerender = false;
export const GET: APIRoute = async () => {
  const offset = Math.floor(Math.random() * 300);
  const rows = await q().all<{ slug: string }>("SELECT slug FROM games WHERE status = 'published' ORDER BY rank_score DESC, id DESC LIMIT 1 OFFSET ?", [offset]);
  const slug = rows[0]?.slug;
  return new Response(null, { status: 302, headers: { location: slug ? `/games/${slug}/` : '/', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
};
