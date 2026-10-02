// Live production smoke test: opens one game per provider, presses Play ONCE, never clicks inside the frame.
// Optional: submits one report through real Turnstile (marked as a test in the message).
import { chromium } from '@playwright/test';
const [ip, out, ...slugs] = process.argv.slice(2);
const b = await chromium.launch({ args: ip ? [`--host-resolver-rules=MAP pixuvo.com ${ip}`] : [] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, locale: 'en-GB', timezoneId: 'Europe/Prague' });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 160)));
p.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 160)));
for (const slug of slugs) {
  await p.goto(`https://pixuvo.com/games/${slug}/`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#stage iframe', { timeout: 15000 }); // the game starts on its own
  await p.waitForSelector('#stage iframe', { timeout: 15000 });
  await p.waitForTimeout(10000);
  console.log(slug, '→', await p.$eval('#stage iframe', (f) => f.src), 'frames', p.frames().length);
  await p.screenshot({ path: `${out}/live-play-${slug}.png` });
}
if (process.env.REPORT_TEST) {
  await p.goto(`https://pixuvo.com/games/${slugs[0]}/`);
  await p.click('.game-actions [data-report-open]');
  await p.selectOption('#report-dialog select[name=reason]', 'other');
  await p.fill('#report-dialog textarea', 'PIXUVO LAUNCH TEST — please ignore (Turnstile end-to-end check)');
  await p.click('#report-dialog button[type=submit]');
  await p.waitForTimeout(8000);
  console.log('report status:', await p.textContent('[data-report-status]'));
}
console.log('console errors:', errs);
await b.close();
