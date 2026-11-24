/**
 * Worker entry. Wraps the Astro handler only to decide the homepage language:
 * "/" is static English, but `assets.run_worker_first: ["/"]` sends it here first.
 *   remembered choice (cookie) → browser language → Cloudflare country → English
 * Bots and English visitors get the static page; others a 302 to /{lang}/.
 * The public JSON API (/api/games/, /api/suggest/, /api/play/, /api/rate/, /api/report/) runs through
 * lib/server/api-entry.ts without starting Astro (Workers Free: 10 ms CPU; a cold isolate spent 13–16 ms booting
 * Astro for /api/suggest/, 23. 11. 2026). Astro's handler is imported lazily, only for everything else
 * (admin, cron, unknown paths, prerendering). Static files never reach the Worker.
 * scheduled(): the daily Cron Trigger (wrangler.jsonc → triggers.crons) only starts the GitHub sync
 * workflow; the import itself never runs inside the Worker. tests/unit/worker-cron.test.ts guards it.
 */
import { dispatchSync, type DispatchEnv } from './lib/server/dispatch';
import { DEFAULT_LANG, detectLang } from './i18n/locales';
import { lightApi } from './lib/server/api-entry';

type Env = { ASSETS: Fetcher } & Record<string, unknown>;
type AstroHandler = { handle(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> };
let astro: Promise<AstroHandler> | null = null;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      const cf = (request as Request & { cf?: { country?: string } }).cf;
      // Test mode only: simulate the visitor's country without Cloudflare's edge.
      const country = env.ENVIRONMENT === 'test' ? request.headers.get('x-test-country') ?? cf?.country : cf?.country;
      const lang = detectLang({
        cookie: request.headers.get('cookie'),
        acceptLanguage: request.headers.get('accept-language'),
        country: country ?? null,
        ua: request.headers.get('user-agent'),
      });
      if (lang !== DEFAULT_LANG) {
        return new Response(null, {
          status: 302,
          headers: { location: `/${lang}/${url.search}`, vary: 'Accept-Language, Cookie', 'cache-control': 'private, no-store' },
        });
      }
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set('vary', 'Accept-Language, Cookie');
      return out;
    }
    if (url.pathname.startsWith('/api/')) {
      const light = lightApi(request, url, (p) => ctx.waitUntil(p));
      if (light) return light;
    }
    astro ??= import('@astrojs/cloudflare/handler') as Promise<AstroHandler>;
    return (await astro).handle(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(dispatchSync(env as unknown as DispatchEnv).then((r) => console.log('daily sync dispatch', JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
