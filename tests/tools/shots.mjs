// Screenshots of the real site for TEST-REPORT.md: node tests/tools/shots.mjs <base> <outDir> [ip-for-host-mapping]
import { chromium } from '@playwright/test';
const [base, out, ip] = process.argv.slice(2);
const host = new URL(base).hostname;
const b = await chromium.launch({ args: ip ? [`--host-resolver-rules=MAP ${host} ${ip}`] : [] });
const pages = [['home', '/'], ['category', '/racing-games/'], ['game', '/games/drop-planets/'], ['search', '/search/?q=car'], ['categories', '/categories/'], ['filters', '/racing-games/#players=2&sort=new']];
for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'mobile'], [360, 780, 'mobile360']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  for (const [name, path] of pages) {
    if (tag === 'mobile360' && !['home', 'game'].includes(name)) continue;
    await p.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(800);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(tag, name, 'overflow px:', overflow);
    await p.screenshot({ path: `${out}/${tag}-${name}.png` });
  }
  await ctx.close();
}
await b.close();
