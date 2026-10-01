import type { APIRoute } from 'astro';
import { suggest } from '../../lib/catalog';
import { q } from '../../lib/server/db';
import { json } from '../../lib/server/http';
export const prerender = false;
export const GET: APIRoute = async ({ url }) => {
  const raw = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (raw.length < 2) return json({ items: [] }, { cache: 'public' });
  const items = await suggest(q(), raw);
  return json({ items }, { cache: 'public' });
};
