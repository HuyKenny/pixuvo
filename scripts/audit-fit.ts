/**
 * Audit: does each game fit the screen (no page scroll, no inner scroll, little letterbox)?
 *   tsx scripts/audit-fit.ts <sample.json> <out.json> [--games a,b] [--base https://pixuvo.com]
 * sample.json: [{slug, p, w, h, orientation}]. Resumable: existing out.json rows are skipped.
 */
import { chromium, devices } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [sampleFile, outFile] = process.argv.slice(2);
const base = process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1]! : 'https://pixuvo.com';
const only = process.argv.includes('--games') ? process.argv[process.argv.indexOf('--games') + 1]!.split(',') : null;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const VIEWPORTS = [
  { name: 'desktop', opts: { viewport: { width: 1920, height: 1080 }, userAgent: UA } },
  { name: 'laptop', opts: { viewport: { width: 1366, height: 768 }, userAgent: UA } },
  { name: 'tablet', opts: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, userAgent: devices['iPad (gen 7)'].userAgent } },
  { name: 'phone', opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: devices['iPhone 13'].userAgent } },
  { name: 'phone-land', opts: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: devices['iPhone 13'].userAgent } },
];
const sample: Array<{ slug: string; p: string; w: number | null; h: number | null; orientation: string | null }> = JSON.parse(readFileSync(sampleFile!, 'utf8'));
const results: any[] = existsSync(outFile!) ? JSON.parse(readFileSync(outFile!, 'utf8')) : [];
const done = new Set(results.map((r) => `${r.slug}|${r.vp}`));
mkdirSync('/tmp/pixuvo-fit', { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
for (const g of sample) {
  if (only && !only.includes(g.slug)) continue;
  for (const vp of VIEWPORTS) {
    if (done.has(`${g.slug}|${vp.name}`)) continue;
    const ctx = await browser.newContext(vp.opts as any);
    const page = await ctx.newPage();
    const row: any = { slug: g.slug, provider: g.p, feedW: g.w, feedH: g.h, orientation: g.orientation, vp: vp.name };
    try {
      await page.goto(`${base}/games/${g.slug}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#stage iframe', { timeout: 15000 });
      await page.waitForTimeout(7000); // game boot + fitToScreen smooth scroll
      const vpSize = page.viewportSize()!;
      Object.assign(row, await page.evaluate((vh) => {
        const st = document.getElementById('stage')!.getBoundingClientRect();
        const fr = document.querySelector('#stage iframe')!.getBoundingClientRect();
        const de = document.scrollingElement!;
        const bn = document.querySelector('.bottom-nav') as HTMLElement | null;
        const bnTop = bn && getComputedStyle(bn).display !== 'none' ? bn.getBoundingClientRect().top : vh;
        const hd = document.querySelector('.site-header') as HTMLElement | null;
        const hdBottom = hd && getComputedStyle(hd).position !== 'static' ? hd.getBoundingClientRect().bottom : 0;
        const visTop = Math.max(0, st.top, hdBottom), visBot = Math.min(vh, st.bottom, bnTop);
        return {
          stageW: Math.round(st.width), stageH: Math.round(st.height), frameW: Math.round(fr.width), frameH: Math.round(fr.height),
          hiddenPx: Math.round(Math.max(0, st.height - Math.max(0, visBot - visTop))),
          hOverflow: de.scrollWidth - innerWidth, fit: document.getElementById('stage')!.dataset.fit,
        };
      }, vpSize.height));
      // Inside the frames (Playwright reaches cross-origin frames).
      const inner: any[] = [];
      for (const f of page.frames().filter((x) => x !== page.mainFrame())) {
        try {
          inner.push(await f.evaluate(() => {
            const d = document.documentElement;
            let big = { w: 0, h: 0 };
            for (const c of document.querySelectorAll('canvas,video,iframe,embed')) { const r = c.getBoundingClientRect(); if (r.width * r.height > big.w * big.h) big = { w: Math.round(r.width), h: Math.round(r.height) }; }
            return { url: location.host, sw: d.scrollWidth, sh: d.scrollHeight, cw: d.clientWidth, ch: d.clientHeight, big, bodyText: (document.body?.innerText ?? '').slice(0, 60) };
          }));
        } catch { /* detached */ }
      }
      row.inner = inner;
      const deep = inner.filter((i) => i.cw > 100).sort((a, b) => b.big.w * b.big.h - a.big.w * a.big.h)[0];
      row.innerScroll = deep ? Math.max(0, deep.sh - deep.ch - 2) + Math.max(0, deep.sw - deep.cw - 2) : null;
      row.canvas = deep?.big ?? null;
      row.blank = inner.length === 0 || inner.every((i) => !i.big.w && i.sh < 50 && !i.bodyText);
      await page.screenshot({ path: `/tmp/pixuvo-fit/${g.slug}-${vp.name}.png` });
    } catch (e) {
      row.error = String((e as Error).message).slice(0, 120);
    }
    results.push(row);
    writeFileSync(outFile!, JSON.stringify(results));
    await ctx.close();
  }
  console.log('done', g.slug);
}
await browser.close();
