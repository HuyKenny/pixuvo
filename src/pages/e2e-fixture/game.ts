/** Test-mode stand-in for a partner game (ENVIRONMENT=test only) — e2e never loads real ads. */
import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
export const prerender = false;
export const GET: APIRoute = ({ url }) => {
  if (getEnv().ENVIRONMENT !== 'test') return new Response('Not found', { status: 404 });
  const id = Number(url.searchParams.get('id')) || 0;
  return new Response(`<!doctype html><title>Fixture game ${id}</title><body style="margin:0;display:grid;place-items:center;height:100vh;background:#123;color:#fff;font:20px sans-serif"><p id="fixture">Fixture game ${id} running</p></body>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'", 'x-frame-options': 'SAMEORIGIN' },
  });
};
