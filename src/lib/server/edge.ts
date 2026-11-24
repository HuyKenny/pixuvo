/**
 * The public part of the request pipeline (edge cache, read rate limit, localised links, security/robots headers),
 * without `astro:middleware`. Used by `src/middleware.ts` for every on-demand Astro route and by the light API entry
 * (`src/lib/server/api-entry.ts`), which answers /api/games/, /api/suggest/, /api/play/, /api/rate/ and
 * /api/report/ without starting Astro (Workers Free: 10 ms CPU; a cold isolate spent 13–16 ms booting the app,
 * measured 23. 11. 2026). One copy of this logic keeps both paths byte-identical.
 */
import { dataVersion, q } from './db';
import { getEnv } from './env';
import { clientIp } from './http';
import { SECURITY_HEADERS } from '../security';
import { normTitle } from '../text';
import { langFromPath, stripLocale } from '../../i18n/locales';
import { localiseHtml } from '../../i18n/links';

const READ_LIMITED = [/^\/api\/(games|suggest)\/$/, /^\/search\/$/]; // matched against the path without language prefix
const NO_CACHE = [/^\/api\/(play|rate|report|cron|admin)\b/, /^\/admin\b/, /^(\/[a-z]{2}(-[a-z]{4})?)?\/random\//];
const PARAMS: Record<string, string[]> = {
  '/api/games/': ['cat', 'sub', 'theme', 'q', 'device', 'players', 'mode', 'style', 'controls', 'sort', 'page', 'lang'],
  '/api/suggest/': ['q', 'lang'],
  '/search/': ['q', 'page'],
};

function cacheKey(url: URL, version: string): string | null {
  const allowed = PARAMS[stripLocale(url.pathname)] ?? [];
  const sp = new URLSearchParams();
  for (const k of allowed) {
    let v = url.searchParams.get(k);
    if (v === null || v === '') continue;
    if (k === 'q') v = normTitle(v.slice(0, 80));
    else if (v.includes(',')) v = [...new Set(v.split(','))].sort().join(','); // same set → same key
    if (v.length > 120) return null;
    sp.set(k, v);
  }
  sp.set('__v', version);
  sp.set('__b', __BUILD_ID__);
  return `https://pixuvo.com${url.pathname}?${sp.toString()}`;
}

export function withHeaders(res: Response, url: URL, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
  for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
  const preview = url.hostname.endsWith('.workers.dev') || getEnv().ENVIRONMENT === 'preview';
  if (preview || url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/')) out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}

/** Non-English pages: point internal links at the same language (also runs while prerendering). */
export async function localise(res: Response, pathname: string): Promise<Response> {
  const lang = langFromPath(pathname);
  if (lang === 'en' || !(res.headers.get('content-type') ?? '').includes('text/html')) return res;
  const html = localiseHtml(await res.text(), lang);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}

/**
 * Edge cache → read rate limit → `render()` → cache store → headers, for every non-admin on-demand request.
 * `render` returns the route's response (already localised); `waitUntil` keeps the cache write alive.
 */
export async function publicResponse(
  request: Request,
  url: URL,
  render: () => Promise<Response>,
  waitUntil: ((p: Promise<unknown>) => void) | undefined,
): Promise<Response> {
  const cacheable = request.method === 'GET' && !NO_CACHE.some((r) => r.test(url.pathname)) && !request.headers.has('authorization');
  const cache = cacheable && typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null;
  let key: string | null = null;
  if (cache) {
    try {
      key = cacheKey(url, await dataVersion(q()));
      if (key) {
        const hit = await cache.match(key);
        if (hit) return withHeaders(hit, url, { 'X-Pixuvo-Cache': 'HIT' });
      }
    } catch {
      key = null;
    }
  }

  // Cache misses on search/filter endpoints run D1 queries: limit them per IP (cache hits stay free).
  if (READ_LIMITED.some((r) => r.test(stripLocale(url.pathname)))) {
    const rl = getEnv().RL_READ;
    if (rl && !(await rl.limit({ key: clientIp(request) })).success) {
      return withHeaders(new Response(JSON.stringify({ error: 'Too many requests — please wait a moment.' }), { status: 429, headers: { 'content-type': url.pathname.startsWith('/api/') ? 'application/json' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '30' } }), url);
    }
  }

  const res = await render();
  const cc = res.headers.get('cache-control') ?? '';
  // Never store a response the route marked private.
  if (cache && key && res.status === 200 && !res.headers.has('set-cookie') && !/private|no-store/.test(cc)) {
    const isApi = url.pathname.startsWith('/api/');
    const toStore = new Response(res.clone().body, res);
    toStore.headers.set('Cache-Control', `public, s-maxage=${isApi ? 300 : 600}`);
    waitUntil?.(cache.put(key, toStore));
    const out = withHeaders(res, url, { 'X-Pixuvo-Cache': 'MISS' });
    if (!out.headers.has('cache-control')) out.headers.set('Cache-Control', 'public, max-age=60');
    return out;
  }
  return withHeaders(res, url);
}
