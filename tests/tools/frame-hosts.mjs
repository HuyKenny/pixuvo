import { chromium } from '@playwright/test';
const [base, slug, wait = '20000'] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, locale: 'cs-CZ', timezoneId: 'Europe/Prague' });
const p = await ctx.newPage();
const hosts = new Map();
ctx.on('request', (r) => { try { const h = new URL(r.url()).hostname; hosts.set(h, (hosts.get(h) ?? 0) + 1); } catch {} });
await p.goto(`${base}/games/${slug}/`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
console.log('hosts before Play:', [...hosts.keys()].join(', '));
hosts.clear();
await p.waitForSelector('#stage iframe', { timeout: 15000 }); // the game starts on its own
await p.waitForTimeout(Number(wait));
console.log('frames:', p.frames().map((f) => f.url().slice(0, 100)).join('\n  '));
console.log('hosts after Play:', [...hosts.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}(${n})`).join(', '));
const cmp = p.frames().some((f) => /consent|cmp|fundingchoices|quantcast|didomi|onetrust|cookiebot|usercentrics/i.test(f.url()));
console.log('CMP frame present:', cmp);
await p.screenshot({ path: `/tmp/claude-1000/-home-kenny-ai/a224127e-664f-4c3d-9fde-cb61ded61a8e/scratchpad/frames-${slug}.png` });
await b.close();
