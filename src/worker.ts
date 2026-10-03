/**
 * Worker entry. Wraps the Astro handler only to decide the homepage language:
 * "/" is static English, but `assets.run_worker_first: ["/"]` sends it here first.
 *   remembered choice (cookie) → browser language → Cloudflare country → English
 * Bots and English visitors get the static page; others a 302 to /{lang}/.
 * Every other request goes straight to Astro (static files never reach the Worker).
 */
import { handle } from '@astrojs/cloudflare/handler';
import { DEFAULT_LANG, detectLang } from './i18n/locales';

type Env = { ASSETS: Fetcher } & Record<string, unknown>;

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
    return handle(request, env as never, ctx);
  },
} satisfies ExportedHandler<Env>;
