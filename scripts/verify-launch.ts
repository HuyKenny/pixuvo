/**
 * verify:launch — checks the LIVE site (default https://pixuvo.com). Read-only:
 * never presses Play (no ad impressions), never posts forms.
 *   tsx scripts/verify-launch.ts [--base https://pixuvo.com] [--quick] [--preview]
 */
import { parseArgs } from 'node:util';
import { Resolver } from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

// VERIFY_DNS=1.1.1.1 bypasses a local resolver that still caches an old/negative answer (e.g. right after a DNS switch).
if (process.env.VERIFY_DNS) {
  const r = new Resolver();
  r.setServers([process.env.VERIFY_DNS]);
  type Cb = (err: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void;
  const lookup = (host: string, opts: { all?: boolean }, cb: Cb) =>
    r.resolve4(host, (err, a) => (err ? cb(err, '', 4) : opts?.all ? cb(null, a.map((address) => ({ address, family: 4 }))) : cb(null, a[0]!, 4)));
  setGlobalDispatcher(new Agent({ connect: { lookup: lookup as never } }));
}

const { values } = parseArgs({ options: { base: { type: 'string', default: 'https://pixuvo.com' }, quick: { type: 'boolean', default: false }, preview: { type: 'boolean', default: false } } });
const base = values.base!.replace(/\/$/, '');
const results: Array<[boolean, string, string]> = [];
const check = (ok: boolean, name: string, detail = '') => results.push([ok, name, detail]);
const get = (path: string, init: RequestInit = {}) => fetch(path.startsWith('http') ? path : base + path, { redirect: 'manual', ...init, headers: { 'user-agent': 'PixuvoLaunchCheck/1.0', ...(init.headers ?? {}) } });

const home = await get('/', { headers: { 'accept-language': 'en-US,en;q=0.9' } });
const homeHtml = await home.text();
check(home.status === 200, 'homepage 200', String(home.status));
check(/<html lang="en" dir="ltr"/.test(homeHtml), 'lang="en"');
check(values.preview ? /noindex/.test(homeHtml) : homeHtml.includes('<link rel="canonical" href="https://pixuvo.com/">'), values.preview ? 'preview is noindex' : 'canonical on homepage');
check(!!home.headers.get('content-security-policy'), 'CSP header on static page');
const m = /href="\/games\/([a-z0-9-]+)\/"/.exec(homeHtml);
if (m) {
  const g = await get(`/games/${m[1]}/`);
  const html = await g.text();
  check(g.status === 200 && html.includes('"@type":"VideoGame"'), 'static game page', m[1]);
}
for (const [p, code] of [['/games/', 200], ['/racing-games/', 200], ['/racing-games/page/2/', 200], ['/does-not-exist/', 404], ['/games/no-such-game-zz9/', 404], ['/games', 307]] as const) {
  const r = await get(p);
  check(r.status === code || (code === 307 && [301, 307, 308].includes(r.status)), `${p} → ${code}`, String(r.status));
}
const dyn = await get('/games/page/3/');
check(dyn.status === 200 && !!dyn.headers.get('content-security-policy'), 'dynamic page with CSP');
const robots = await (await get('/robots.txt')).text();
// Cloudflare may prepend its managed AI-crawler section; what matters is that "User-agent: *" is not disallowed.
const starBlocked = /User-agent: \*\s*\n(?:[^\n]+\n)*?Disallow: \/\s*\n/.test(robots);
check(values.preview ? robots.includes('Disallow: /') : robots.includes('Sitemap: https://pixuvo.com/sitemap.xml') && !starBlocked, 'robots.txt (crawlers allowed, sitemap listed)');
const sm = await get('/sitemap.xml');
const smx = await sm.text();
check(sm.status === 200 && smx.includes('/sitemaps/games-1.xml'), 'sitemap index');
const g1 = await (await get('/sitemaps/games-1.xml')).text();
check(/<loc>https:\/\/pixuvo\.com\/games\/[a-z0-9-]+\/<\/loc>/.test(g1) && !/pixuvo\.com\/(search|admin|favorites|recently-played)\//.test(g1), 'games sitemap (canonical URLs only)');
const ads = await (await get('/ads.txt')).text();
check(ads.includes('google.com, pub-5519830896693885, DIRECT'), 'ads.txt has GameMonetize lines');
for (const p of ['/admin/', '/api/admin/games-status/']) {
  const r = await get(p);
  const loc = r.headers.get('location') ?? '';
  check([401, 403, 503].includes(r.status) || (r.status === 302 && loc.includes('cloudflareaccess.com')), `${p} closed without login`, `${r.status} ${loc.slice(0, 60)}`);
}
const cron = await get('/api/cron/sync/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
check(cron.status === 401 || cron.status === 503, 'cron endpoint needs secret', String(cron.status));
const sug = await get('/api/suggest/?q=car');
check(sug.status === 200 && ((await sug.json()) as { items: unknown[] }).items.length > 0, 'autocomplete returns games');
// Languages: homepage detection, a localised page with hreflang, RTL, per-language sitemap.
const det = await get('/', { headers: { 'accept-language': 'cs-CZ,cs;q=0.9' } });
check(det.status === 302 && det.headers.get('location') === '/cs/', 'homepage → /cs/ for Czech browser', `${det.status} ${det.headers.get('location')}`);
const bot = await get('/', { headers: { 'accept-language': 'cs', 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } });
// Since 31 Oct the Cloudflare WAF answers 403 to a UA containing "bot" that is not a verified search crawler (a fake Googlebot
// from a CI runner), so 403 is a pass here; what must never happen is a redirect. Real Googlebot is verified and gets 200.
check(bot.status === 200 || bot.status === 403, 'bots are not redirected', String(bot.status));
const csCat = await get('/cs/racing-games/');
const csHtml = await csCat.text();
check(csCat.status === 200 && /<html lang="cs"/.test(csHtml) && csHtml.includes('hreflang="x-default"') && csHtml.includes('<link rel="canonical" href="https://pixuvo.com/cs/racing-games/">'), 'Czech category page (lang, canonical, hreflang)', String(csCat.status));
check(!/href="\/games\/[a-z0-9-]+\/"/.test(csHtml), 'Czech page links stay in Czech');
const ar = await get('/ar/');
check(ar.status === 200 && /<html lang="ar" dir="rtl"/.test(await ar.text()), 'Arabic homepage is right-to-left', String(ar.status));
check((await get('/xx/')).status === 404, 'unknown language → 404');
check((await get('/sitemaps/cs-categories.xml')).status === 200, 'Czech categories sitemap');
if (!values.quick && !values.preview) {
  const http = await fetch('http://pixuvo.com/', { redirect: 'manual' });
  check([301, 308].includes(http.status) && (http.headers.get('location') ?? '').startsWith('https://pixuvo.com'), 'http → https', String(http.status));
  const www = await fetch('https://www.pixuvo.com/racing-games/?x=1', { redirect: 'manual' });
  check([301, 308].includes(www.status) && (www.headers.get('location') ?? '') === 'https://pixuvo.com/racing-games/?x=1', 'www → apex 301 keeps path', `${www.status} ${www.headers.get('location')}`);
  for (const p of ['/about/', '/contact/', '/privacy/', '/cookies/', '/terms/', '/copyright/']) check((await get(p)).status === 200, `legal page ${p}`);
}
let failed = 0;
for (const [ok, name, d] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? `  (${d})` : ''}`);
}
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
