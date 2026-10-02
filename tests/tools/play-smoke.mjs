// Live smoke test of partner embeds: opens a game page, presses Play once, waits, screenshots.
// Never clicks inside the game frame (no ad interaction).
import { chromium } from '@playwright/test';
const [base, out, ...slugs] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
for (const slug of slugs) {
  await p.goto(`${base}/games/${slug}/`, { waitUntil: 'domcontentloaded' });
  const before = p.frames().length;
  await p.waitForSelector('#stage iframe', { timeout: 15000 }); // the game starts on its own
  await p.waitForSelector('#stage iframe', { timeout: 15000 });
  await p.waitForTimeout(12000);
  const src = await p.$eval('#stage iframe', (f) => f.src);
  console.log(slug, 'frames', before, '->', p.frames().length, 'src', src.slice(0, 90));
  await p.screenshot({ path: `${out}/play-${slug}.png` });
}
console.log('console errors:', errors.slice(0, 15));
await b.close();
