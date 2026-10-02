// Live technical audit: node --dns-result-order=ipv4first tests/tools/audit.mjs https://pixuvo.com [games=300]
// Crawls the sitemaps, checks every non-game URL and a sample of game pages, then the internal links found on them.
const base = process.argv[2] ?? 'https://pixuvo.com';
const SAMPLE = Number(process.argv[3] ?? 300);
const UA = 'PixuvoAudit/1.0 (+https://pixuvo.com/contact/)';
const get = async (u, opt = {}, tries = 3) => {
  for (let k = 1; ; k++) {
    try {
      const t = Date.now();
      const r = await fetch(u, { redirect: 'manual', headers: { 'user-agent': UA }, ...opt });
      return { r, ms: Date.now() - t, body: opt.method === 'HEAD' ? '' : await r.text() };
    } catch (e) {
      if (k >= tries) return { r: { status: `ERR ${e.cause?.code ?? e.message}`, headers: new Headers() }, ms: 0, body: '' };
    }
  }
};
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; };

const index = (await get(`${base}/sitemap.xml`)).body;
const maps = locs(index);
let urls = [];
for (const m of maps) urls.push(...locs((await get(m)).body));
const games = urls.filter((u) => /\/games\/[a-z0-9-]+\/$/.test(u));
const other = urls.filter((u) => !games.includes(u));
const sample = games.sort(() => Math.random() - 0.5).slice(0, SAMPLE);
console.log(`sitemaps ${maps.length}, urls ${urls.length} (games ${games.length}, other ${other.length}); checking ${other.length + sample.length}`);
const problems = [];
const links = new Set();
const times = [];
await pool([...other, ...sample], 6, async (u) => {
  const { r, ms, body } = await get(u);
  times.push(ms);
  if (r.status !== 200) return problems.push(`${r.status} ${u}`);
  const canon = /<link rel="canonical" href="([^"]+)"/.exec(body)?.[1];
  if (canon !== u) problems.push(`canonical ${canon} != ${u}`);
  const h1 = (body.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) problems.push(`h1=${h1} ${u}`);
  if (!/<title>[^<]{10,}<\/title>/.test(body)) problems.push(`title ${u}`);
  if (!/<meta name="description" content="[^"]{40,}"/.test(body)) problems.push(`description ${u}`);
  if (/<meta name="robots" content="noindex/.test(body)) problems.push(`noindex in sitemap ${u}`);
  if (/href="#"/.test(body)) problems.push(`href=# ${u}`);
  if (/http:\/\/(?!www\.w3\.org)/.test(body.replace(/xmlns[^"]*"[^"]*"/g, ''))) problems.push(`http:// reference ${u}`);
  for (const m of body.matchAll(/href="(\/[^"#?]*)"/g)) links.add(m[1]);
});
const linkList = [...links].filter((l) => !l.startsWith('/_astro/')).slice(0, 1500);
const bad = (await pool(linkList, 6, async (l) => { const { r } = await get(base + l, { method: 'HEAD' }); return [r.status, l, r.headers.get('location')]; })).filter(([s]) => s !== 200);
for (const [s, l, loc] of bad) problems.push(`link ${s} ${l}${loc ? ` -> ${loc}` : ''}`);
times.sort((a, b) => a - b);
console.log(`pages: median ${times[times.length >> 1]} ms, p95 ${times[Math.floor(times.length * 0.95)]} ms; internal links checked ${linkList.length}`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.slice(0, 80).join('\n') : 'no problems');

// Mobile pass: pages must never be wider than a phone screen (the browser would zoom the page out).
if (!process.env.NO_MOBILE) {
  const { chromium, devices } = await import('@playwright/test');
  const b = await chromium.launch({ args: ['--disable-ipv6'] });
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.route(/gamemonetize\.co|play\.gamepix\.com|playgama\.com\/export/, (r) => r.abort()); // layout only, no partner games
  const p = await ctx.newPage();
  const wide = [];
  for (const u of [...other, ...sample]) {
    await p.goto(u, { waitUntil: 'domcontentloaded' }).catch(() => {});
    const w = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth).catch(() => 0);
    if (w > 1) wide.push(`+${w}px ${u}`);
  }
  await b.close();
  console.log(wide.length ? `MOBILE OVERFLOW (${wide.length}):\n${wide.slice(0, 40).join('\n')}` : `mobile: no page wider than the screen (${other.length + sample.length} pages)`);
}
