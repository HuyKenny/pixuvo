import { chromium } from '@playwright/test';
const base = 'http://localhost:8787';
const out = process.argv[2];
const pages = [['home', '/'], ['cat', '/racing-games/'], ['game', '/games/' + (process.argv[3] || '')], ['search', '/search/?q=car']];
const b = await chromium.launch();
for (const [w, h, tag] of [[1440, 900, 'desk'], [390, 844, 'mob']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  for (const [name, path] of pages) {
    await p.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(500);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(tag, name, 'overflow:', overflow);
    await p.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: false });
  }
  await ctx.close();
}
await b.close();
