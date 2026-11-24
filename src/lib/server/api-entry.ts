/**
 * Light entry for the public JSON API (Workers Free: 10 ms CPU per request).
 *
 * pixuvo.com is static since 23. 11. 2026; this Worker only gets `pixuvo.com/api/*`. Through Astro a cold isolate
 * spent 13–16 ms on /api/suggest/ and /api/games/ (measured 23. 11. 2026), mostly Astro's own start-up (app,
 * manifest, route matching). Here the same route handlers run directly, wrapped in the same pipeline as
 * `src/middleware.ts` (`publicResponse` in ./edge.ts), so responses stay byte-identical. Anything else
 * (admin, cron, other methods on the known endpoints, paths without the trailing slash) returns null and goes to Astro.
 * Unknown /api/<x>/ paths (scanners) get a small JSON 404 here: through Astro they rendered the full HTML 404 page
 * for 23–33 ms CPU (measured 24. 11. 2026), which on Free is error 1102.
 */
import { GET as gamesGet } from '../../pages/api/games';
import { GET as suggestGet } from '../../pages/api/suggest';
import { GET as playGet, POST as playPost } from '../../pages/api/play';
import { POST as ratePost } from '../../pages/api/rate';
import { POST as reportPost } from '../../pages/api/report';
import { error } from './http';
import { localise, publicResponse, withHeaders } from './edge';

type Handler = (ctx: { url: URL; request: Request }) => Response | Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  '/api/games/': { GET: gamesGet as unknown as Handler },
  '/api/suggest/': { GET: suggestGet as unknown as Handler },
  '/api/play/': { GET: playGet as unknown as Handler, POST: playPost as unknown as Handler },
  '/api/rate/': { POST: ratePost as unknown as Handler },
  '/api/report/': { POST: reportPost as unknown as Handler },
};

export function lightApi(request: Request, url: URL, waitUntil: (p: Promise<unknown>) => void): Promise<Response> | null {
  const route = ROUTES[url.pathname];
  if (!route) {
    const unknown = !/^\/api\/(admin|cron)(\/|$)/.test(url.pathname) && !ROUTES[url.pathname + '/'];
    return unknown && (request.method === 'GET' || request.method === 'HEAD') ? Promise.resolve(withHeaders(error(404, 'Not found.'), url)) : null;
  }
  const handler = route[request.method];
  // GET on a POST-only endpoint (/api/rate/, /api/report/): same JSON 404 instead of Astro's HTML 404 page.
  if (!handler) return request.method === 'GET' || request.method === 'HEAD' ? Promise.resolve(withHeaders(error(404, 'Not found.'), url)) : null;
  return publicResponse(request, url, async () => {
    try {
      return await localise(await handler({ url, request }), url.pathname);
    } catch (e) {
      // Astro answers an endpoint that throws with an empty 500; same here (logged for Workers Logs).
      console.error('api', url.pathname, e instanceof Error ? e.message : String(e));
      return new Response(null, { status: 500 });
    }
  }, waitUntil).catch(() => withHeaders(new Response(null, { status: 500 }), url));
}
