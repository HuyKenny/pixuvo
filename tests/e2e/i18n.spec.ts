import { expect, test } from '@playwright/test';

const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';

test.describe('language detection on the homepage', () => {
  test('browser language → 302 to /cs/, English stays, bots stay', async ({ request }) => {
    const cs = await request.get('/', { headers: { 'accept-language': 'cs-CZ,cs;q=0.9', 'user-agent': BROWSER_UA }, maxRedirects: 0 });
    expect(cs.status()).toBe(302);
    expect(cs.headers()['location']).toBe('/cs/');
    expect(cs.headers()['vary']).toContain('Accept-Language');
    const en = await request.get('/', { headers: { 'accept-language': 'en-US', 'user-agent': BROWSER_UA }, maxRedirects: 0 });
    expect(en.status()).toBe(200);
    const bot = await request.get('/', { headers: { 'accept-language': 'cs', 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }, maxRedirects: 0 });
    expect(bot.status()).toBe(200);
  });
  test('country fallback when the browser sends no language; remembered choice wins', async ({ request }) => {
    const sk = await request.get('/', { headers: { 'accept-language': '', 'x-test-country': 'SK', 'user-agent': BROWSER_UA }, maxRedirects: 0 });
    expect(sk.headers()['location']).toBe('/sk/');
    const remembered = await request.get('/', { headers: { 'accept-language': 'cs', cookie: 'pixuvo_lang=ja', 'user-agent': BROWSER_UA }, maxRedirects: 0 });
    expect(remembered.headers()['location']).toBe('/ja/');
    const keptEn = await request.get('/', { headers: { 'accept-language': 'cs', cookie: 'pixuvo_lang=en', 'user-agent': BROWSER_UA }, maxRedirects: 0 });
    expect(keptEn.status()).toBe(200);
  });
});

test.describe('localised pages', () => {
  test('Czech category page: language, translated UI, hreflang, canonical, localised links', async ({ request }) => {
    const r = await request.get('/cs/racing-games/');
    expect(r.status()).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/<html lang="cs"/);
    expect(html).toContain('<link rel="canonical" href="https://pixuvo.com/cs/racing-games/">');
    expect(html).toContain('hreflang="x-default" href="https://pixuvo.com/racing-games/"');
    expect(html).toContain('hreflang="ja" href="https://pixuvo.com/ja/racing-games/"');
    expect(html).toMatch(/href="\/cs\/games\/[a-z0-9-]+\/"/);
    expect(html).not.toMatch(/<a [^>]*href="\/games\/[a-z0-9-]+\/"/);
    expect(html).not.toContain('>Categories<');
  });
  test('Arabic is right-to-left and fits phone and desktop widths', async ({ page }) => {
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const p of ['/ar/', '/ar/racing-games/']) {
        await page.goto(p);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${p} @${width}`).toBeLessThanOrEqual(0);
      }
    }
  });
  test('unknown language codes are 404', async ({ request }) => {
    for (const p of ['/xx/search/?q=car', '/en/new-games/', '/xx/games/page/2/']) expect((await request.get(p)).status(), p).toBe(404);
  });
  test('localised game page: native intro instead of the English publisher text, noindex', async ({ request }) => {
    const list = (await (await request.get('/api/games/?sort=featured')).json()) as { items: Array<{ slug: string }> };
    const slug = list.items[0]!.slug;
    const en = await (await request.get(`/games/${slug}/`)).text();
    const html = await (await request.get(`/cs/games/${slug}/`)).text();
    expect(html).toMatch(/<html lang="cs"/);
    expect(html).toMatch(/<meta name="robots" content="noindex/);
    expect(html).toContain('zdarma');
    const enDesc = /<div class="prose"><p>([^<]{40,})/.exec(en)?.[1];
    if (enDesc) expect(html).not.toContain(enDesc.slice(0, 40));
    expect(en).toMatch(/<meta name="robots" content="index/);
  });
  test('language switcher keeps the page and remembers the choice', async ({ page, context }) => {
    await page.goto('/racing-games/');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.langswitch-header summary').click();
    await page.locator('.langswitch-header a[data-set-lang="de"]').click();
    await expect(page).toHaveURL(/\/de\/racing-games\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'pixuvo_lang')?.value).toBe('de');
  });
  test('client strings and API card categories follow the page language', async ({ page }) => {
    await page.goto('/cs/racing-games/#players=2');
    await expect(page.locator('[data-result-count]')).not.toContainText('games');
    const api = await page.request.get('/api/games/?cat=racing&lang=cs');
    const data = (await api.json()) as { items: Array<{ cat: string | null }> };
    expect(data.items.some((g) => g.cat && g.cat !== 'Racing' && g.cat !== 'Car')).toBe(true);
  });
  test('sitemap index lists language sitemaps with alternates', async ({ request }) => {
    const idx = await (await request.get('/sitemap.xml')).text();
    expect(idx).toContain('/sitemaps/cs-categories.xml');
    const cats = await (await request.get('/sitemaps/cs-categories.xml')).text();
    expect(cats).toContain('<loc>https://pixuvo.com/cs/racing-games/</loc>');
    expect(cats).toContain('xhtml:link rel="alternate" hreflang="de"');
  });
});
