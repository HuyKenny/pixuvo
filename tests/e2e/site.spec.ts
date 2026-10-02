import { expect, test } from '@playwright/test';

test.describe('navigation & pages', () => {
  test('homepage shows games, categories and search without a giant hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Find your next favorite game');
    await expect(page.locator('.card').first()).toBeVisible();
    const firstCard = await page.locator('.card').first().boundingBox();
    expect(firstCard!.y).toBeLessThan(500); // games are visible on the first screen
    await expect(page.locator('#site-search')).toBeVisible();
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://pixuvo.com/');
    // No fake trends on cold start.
    await expect(page.locator('text=Trending now')).toHaveCount(0);
  });

  test('category page: cards link to real game pages, favorite button does not navigate', async ({ page }) => {
    await page.goto('/racing-games/');
    await expect(page.locator('h1')).toHaveText(/Racing Games/);
    const card = page.locator('.card').first();
    const href = await card.locator('a.card-link').getAttribute('href');
    expect(href).toMatch(/^\/games\/[a-z0-9-]+\/$/);
    await card.locator('button.fav-btn').click();
    await expect(page).toHaveURL(/\/racing-games\/$/);
    await expect(card.locator('button.fav-btn')).toHaveAttribute('aria-pressed', 'true');
    await card.locator('a.card-link').click();
    await expect(page).toHaveURL(new RegExp(href!));
    await expect(page.locator('h1')).toBeVisible();
  });

  test('no href="#" placeholders in server HTML', async ({ request }) => {
    for (const path of ['/', '/racing-games/', '/categories/', '/games/', '/new-games/']) {
      const html = await (await request.get(path)).text();
      expect(html, path).not.toMatch(/href="#"/);
    }
  });

  test('pagination is crawlable with canonical per page; out-of-range is 404', async ({ page, request }) => {
    const r = await request.get('/games/page/2/');
    expect(r.status()).toBe(200);
    const html = await r.text();
    expect(html).toContain('<link rel="canonical" href="https://pixuvo.com/games/page/2/">');
    expect(html).toContain('href="/games/page/3/"');
    expect((await request.get('/games/page/99999/')).status()).toBe(404);
    expect((await request.get('/racing-games/page/9999/')).status()).toBe(404);
    const one = await request.get('/racing-games/page/1/', { maxRedirects: 0 });
    expect(one.status()).toBe(301);
    await page.goto('/games/');
    await page.locator('nav[aria-label="All games pages"] a', { hasText: '2' }).first().click();
    await expect(page).toHaveURL(/\/games\/page\/2\/$/);
  });

  test('404s are real 404s', async ({ request }) => {
    for (const p of ['/does-not-exist/', '/games/no-such-game-xyz/', '/unknown-category-games/']) expect((await request.get(p)).status(), p).toBe(404);
  });

  test('search works without JS and is noindex', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.fill('#site-search', 'racing');
    await page.press('#site-search', 'Enter');
    await expect(page).toHaveURL(/\/search\/\?q=racing/);
    await expect(page.locator('.card').first()).toBeVisible();
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    await ctx.close();
  });

  test('autocomplete: keyboard navigation and Enter opens the game', async ({ page }) => {
    await page.goto('/');
    await page.fill('#site-search', 'ra');
    const opts = page.locator('#search-suggest [role=option]');
    await expect(opts.first()).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(opts.first()).toHaveAttribute('aria-selected', 'true');
    const href = await opts.first().getAttribute('href');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, '\\/')));
    await page.goto('/');
    await page.fill('#site-search', 'zz');
    await page.keyboard.press('Escape');
  });
});

test.describe('filters', () => {
  test('fragment filters combine, show count, pills, clear all and survive Back', async ({ page }) => {
    await page.goto('/racing-games/');
    const total = await page.locator('[data-result-count]').innerText();
    await page.click('[data-drawer-open="filter-drawer"]');
    await page.locator('#filter-drawer label.opt', { hasText: '2+ players' }).click();
    await expect(page).toHaveURL(/#players=2/);
    await page.click('#filter-drawer .drawer-foot [data-drawer-close]');
    await expect(page.locator('[data-active-filters] .filter-pill')).toHaveCount(1);
    await expect(page.locator('[data-result-count]')).not.toHaveText(total);
    // Add a second filter and check combination.
    await page.click('[data-drawer-open="filter-drawer"]');
    await page.locator('#filter-drawer label.opt', { hasText: 'Newest' }).click();
    await page.click('#filter-drawer .drawer-foot [data-drawer-close]');
    await expect(page).toHaveURL(/players=2/);
    await expect(page).toHaveURL(/sort=new/);
    // Go to a game and come back: state restored from the fragment.
    const first = page.locator('#game-grid a.card-link').first();
    await first.click();
    await page.goBack();
    await expect(page.locator('[data-active-filters] .filter-pill')).toHaveCount(2);
    // Remove a single filter, then clear all.
    await page.locator('[data-remove-filter="players"]').click();
    await expect(page).not.toHaveURL(/players=2/);
    await page.locator('[data-active-filters] [data-filter-clear]').click();
    await expect(page.locator('[data-result-count]')).toHaveText(total);
  });

  test('impossible combination shows an empty state', async ({ page }) => {
    await page.goto('/racing-games/#style=pixel&controls=touch&device=mobile&mode=local');
    await expect(page.locator('.empty-state')).toContainText(/No games match/);
  });

  test('filter API validates input', async ({ request }) => {
    expect((await request.get('/api/games/?players=7')).status()).toBe(400);
    expect((await request.get('/api/games/?evil=1')).status()).toBe(400);
    expect((await request.get('/api/games/?cat=racing&players=2')).status()).toBe(200);
  });
});

test.describe('game page & player', () => {
  test('Play loads the (fixture) game only after clicking; leaving removes it; history updated', async ({ page }) => {
    await page.goto('/racing-games/');
    await page.locator('#game-grid a.card-link').first().click();
    await expect(page.locator('#stage iframe')).toHaveCount(0);
    await page.click('[data-play]');
    const frame = page.frameLocator('#stage iframe');
    await expect(frame.locator('#fixture')).toContainText('Fixture game');
    await page.goto('/recently-played/');
    await expect(page.locator('#personal-grid .card')).toHaveCount(1);
  });

  test('favorites and history persist after reload and can be removed', async ({ page }) => {
    await page.goto('/puzzle-games/');
    const btn = page.locator('.card button.fav-btn').first();
    await btn.click();
    await page.reload();
    await expect(page.locator('.card button.fav-btn').first()).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/favorites/');
    await expect(page.locator('#personal-grid .card')).toHaveCount(1);
    await page.locator('#personal-grid [data-remove]').first().click();
    await expect(page.locator('[data-empty]')).toBeVisible();
  });

  test('play API refuses a revoked/unknown game and cross-site calls', async ({ request }) => {
    const r = await request.post('/api/play/', { data: { id: 99999999 }, headers: { origin: 'http://localhost:8790' } });
    expect(r.status()).toBe(404);
    const x = await request.post('/api/play/', { data: { id: 1 }, headers: { origin: 'https://evil.example' } });
    expect(x.status()).toBe(403);
  });

  test('report and rating work in test mode (no Turnstile secret locally)', async ({ page }) => {
    await page.goto('/racing-games/');
    await page.locator('#game-grid a.card-link').first().click();
    await page.click('[data-vote="1"]');
    await expect(page.locator('[data-rate-status]')).toContainText(/Thanks/);
    await expect(page.locator('[data-score]')).toContainText(/1 vote/);
    await page.click('.game-actions [data-report-open]');
    await page.selectOption('#report-dialog select[name=reason]', 'not_loading');
    await page.fill('#report-dialog textarea', 'Black screen <script>alert(1)</script>');
    await page.click('#report-dialog button[type=submit]');
    await expect(page.locator('[data-report-status]')).toContainText(/received/);
  });

  test('structured data is truthful (no aggregateRating)', async ({ request }) => {
    const html = await (await request.get('/racing-games/')).text();
    const slug = /href="\/games\/([a-z0-9-]+)\/"/.exec(html)![1];
    const game = await (await request.get(`/games/${slug}/`)).text();
    expect(game).toContain('"@type":"VideoGame"');
    expect(game).not.toContain('aggregateRating');
    expect(game).toContain('"@type":"BreadcrumbList"');
  });
});

test.describe('admin & security', () => {
  test('admin UI and API refuse unauthenticated clients', async ({ request }) => {
    for (const p of ['/admin/', '/admin/games/', '/admin/providers/']) {
      const r = await request.get(p);
      expect([401, 403, 503]).toContain(r.status());
      expect(r.headers()['cache-control']).toContain('no-store');
    }
    const post = await request.post('/api/admin/games-status/', { form: { id: '1', status: 'hidden', return: '/admin/' }, headers: { origin: 'http://localhost:8790' } });
    expect([401, 403, 503]).toContain(post.status());
  });

  test('cron endpoint requires the secret', async ({ request }) => {
    // cron-job.org must send Content-Type: application/json (Astro's origin check rejects form-like POSTs without Origin).
    const json = { 'content-type': 'application/json' };
    expect((await request.post('/api/cron/sync/', { headers: json, data: {} })).status()).toBe(401);
    expect((await request.post('/api/cron/sync/', { headers: { ...json, authorization: 'Bearer wrong' }, data: {} })).status()).toBe(401);
  });

  test('security headers on static and dynamic pages', async ({ request }) => {
    for (const p of ['/', '/games/']) {
      const h = (await request.get(p)).headers();
      expect(h['content-security-policy'], p).toContain("frame-ancestors 'none'");
      expect(h['x-content-type-options']).toBe('nosniff');
    }
  });

  test('robots, sitemap and ads.txt', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap: https://pixuvo.com/sitemap.xml');
    expect(robots).not.toMatch(/Disallow: \/search/);
    const idx = await (await request.get('/sitemap.xml')).text();
    expect(idx).toContain('/sitemaps/games-1.xml');
    const games = await (await request.get('/sitemaps/games-1.xml')).text();
    expect(games).toMatch(/<loc>https:\/\/pixuvo\.com\/games\/[a-z0-9-]+\/<\/loc><lastmod>\d{4}-\d\d-\d\d<\/lastmod>/);
    expect(games).not.toMatch(/search|favorites|admin|#/);
    const cats = await (await request.get('/sitemaps/categories.xml')).text();
    expect(cats).toContain('/racing-games/');
    const ads = await (await request.get('/ads.txt')).text();
    expect(ads).toContain('pub-5519830896693885');
  });
});

test.describe('consent', () => {
  test('optional script never loads before a choice; reject keeps it off; changing the choice later loads it', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/e2e-fixture/analytics.js')) hits.push(r.url()); });
    await page.goto('/');
    await expect(page.locator('#consent')).toBeVisible();
    await page.waitForTimeout(500);
    expect(hits).toHaveLength(0);
    await page.click('[data-consent-action="reject"]');
    await page.reload();
    await expect(page.locator('#consent')).toBeHidden();
    await page.waitForTimeout(500);
    expect(hits).toHaveLength(0);
    await page.click('[data-consent-open]');
    await page.check('#consent input[name=analytics]');
    await page.click('[data-consent-action="save"]');
    await expect.poll(() => hits.length).toBeGreaterThan(0);
  });
  test('closing nothing ≠ consent: reload without a choice still loads nothing', async ({ page }) => {
    const hits: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/e2e-fixture/analytics.js')) hits.push(r.url()); });
    await page.goto('/about/');
    await page.reload();
    await page.waitForTimeout(500);
    expect(hits).toHaveLength(0);
  });
});
