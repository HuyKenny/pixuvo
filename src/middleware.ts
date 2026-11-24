/**
 * Runs only for on-demand routes — static files are served by Workers Static
 * Assets without invoking the Worker. Responsibilities:
 *  1. admin guard (Cloudflare Access JWT, fail closed)
 *  2. edge cache for public GET pages/APIs (key = path + whitelisted params + data_version)
 *  3. security / robots headers
 * 2 + 3 are in lib/server/edge.ts: the light API entry (lib/server/api-entry.ts) runs the same code without Astro.
 */
import { defineMiddleware } from 'astro:middleware';
import { authenticateAdmin } from './lib/server/access';
import { getEnv } from './lib/server/env';
import { localise, publicResponse, withHeaders } from './lib/server/edge';

export const onRequest = defineMiddleware(async (ctx, next) => {
  const url = ctx.url;
  // Build time (prerendering): only localise links; no bindings, cache or headers here.
  if (ctx.isPrerendered) return localise(await next(), url.pathname);
  const env = getEnv();

  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin')) {
    const auth = await authenticateAdmin(ctx.request, env);
    if (!auth.ok) {
      const body = url.pathname.startsWith('/api/') ? JSON.stringify({ error: auth.reason }) : `<!doctype html><title>Admin</title><p>${auth.reason}</p>`;
      return withHeaders(new Response(body, { status: auth.status, headers: { 'content-type': url.pathname.startsWith('/api/') ? 'application/json' : 'text/html; charset=utf-8', 'cache-control': 'private, no-store' } }), url);
    }
    ctx.locals.adminEmail = auth.email;
    const res = await next();
    return withHeaders(res, url, { 'Cache-Control': 'private, no-store' });
  }

  // Edge cache, read limit and headers live in lib/server/edge.ts (shared with the light /api/* entry, src/worker.ts).
  return publicResponse(ctx.request, url, async () => localise(await next(), url.pathname), (p) => ctx.locals.cfContext?.waitUntil?.(p));
});
