// Screenshot of the homepage with a non-empty "Continue Playing" list (seeded history).
import { chromium } from '@playwright/test';
const [base, out] = process.argv.slice(2);
const b = await chromium.launch();
for (const [w, h] of [[390, 844], [1024, 900], [1440, 900]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const cards = await p.$$eval('a.card-link', (as) => as.slice(0, 4).map((a) => ({ slug: a.getAttribute('href').split('/')[2], title: a.textContent.trim().slice(0, 30), thumb: a.querySelector('img')?.src ?? '' })));
  await p.evaluate((cs) => localStorage.setItem('pixuvo:recent', JSON.stringify(cs.map((c, i) => ({ id: 1000 + i, ...c, at: Date.now() })))), cards);
  await p.reload({ waitUntil: 'networkidle' });
  const gap = await p.evaluate(() => {
    const r = document.getElementById('recent-section'), h = document.querySelector('.hero-row');
    if (!r || r.hidden || !h) return 'n/a';
    const a = r.getBoundingClientRect(), c = h.getBoundingClientRect();
    return a.top < c.top ? c.top - a.bottom : a.top - c.bottom;
  });
  console.log(w, 'gap between Continue Playing and hero:', gap);
  await p.screenshot({ path: `${out}/recent-${w}.png` });
  await ctx.close();
}
await b.close();
