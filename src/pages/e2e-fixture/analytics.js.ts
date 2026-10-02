/** Test-mode stand-in for an optional analytics script (consent tests). */
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
export const prerender = false;
export const GET: APIRoute = () => {
  if (getEnv().ENVIRONMENT !== 'test') return new Response('Not found', { status: 404 });
  return new Response('window.__analyticsLoaded = (window.__analyticsLoaded || 0) + 1;', { headers: { 'content-type': 'text/javascript', 'cache-control': 'no-store' } });
};
