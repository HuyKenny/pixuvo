import { expect, test } from '@playwright/test';
const PAGES = ['/', '/racing-games/', '/categories/', '/games/', '/search/?q=car', '/favorites/', '/about/', '/privacy/'];

for (const width of [360, 390, 768, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const p of PAGES) {
      await page.goto(p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${p} @${width}`).toBeLessThanOrEqual(0);
    }
    await page.goto('/racing-games/');
    await page.locator('#game-grid a.card-link').first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    // The game starts by itself and fills the stage.
    const stage = (await page.locator('#stage').boundingBox())!;
    const frame = (await page.locator('#stage iframe').boundingBox())!;
    expect(Math.abs(frame.width - stage.width), `iframe width @${width}`).toBeLessThan(2);
    expect(stage.height).toBeGreaterThan(200);
  });
}

test('mobile: two cards per row and a usable menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/racing-games/');
  const boxes = await page.locator('#game-grid .card').evaluateAll((els) => els.slice(0, 2).map((e) => e.getBoundingClientRect().top));
  expect(Math.abs(boxes[0]! - boxes[1]!)).toBeLessThan(2);
  await page.click('[aria-controls="nav-drawer"]');
  await expect(page.locator('#nav-drawer .drawer-nav a', { hasText: 'Categories' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#nav-drawer')).toBeHidden();
});

test('keyboard: skip link, visible focus, drawer focus trap basics', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const focusedHasRing = await page.evaluate(() => getComputedStyle(document.activeElement as Element).boxShadow !== 'none' || getComputedStyle(document.activeElement as Element).outlineStyle !== 'none');
  expect(focusedHasRing).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 }); // phones: filters open as a sheet
  await page.goto('/racing-games/');
  await page.locator('.qchip-main').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#filter-drawer input').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.qchip-main')).toBeFocused();
});

test('phones: tab bar, big touch targets, full-width game', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.bottom-nav')).toBeVisible();
  const SEL = '.bottom-nav a, .qchip, .catpill, .chip, a.tag, .filter-pill, .action-btn, .fav-btn, .breadcrumbs a, .site-footer a, .site-footer button, .section-head a, .btn, .btn-more, .search-field button, .menu-btn';
  for (const p of ['/', '/racing-games/', '/categories/']) {
    await page.goto(p);
    const small = await page.$$eval(SEL, (els) => els
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; })
      .filter((e) => e.getBoundingClientRect().height < 43.5)
      .map((e) => `${e.className || e.tagName} "${(e.textContent ?? '').trim().slice(0, 20)}" ${Math.round(e.getBoundingClientRect().height)}px`));
    expect(small, p).toEqual([]);
  }
  await page.goto('/racing-games/');
  await page.locator('#game-grid a.card-link').first().click();
  const stage = (await page.locator('#stage').boundingBox())!;
  expect(Math.round(stage.width)).toBe(390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.bottom-nav')).toBeHidden();
});

test('expanded mode (no Fullscreen API, e.g. iPhone) locks scrolling and Exit works', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined, configurable: true });
    Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { value: undefined, configurable: true });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/racing-games/');
  if (await page.locator('#consent').isVisible()) await page.click('[data-consent-action="reject"]');
  await page.locator('#game-grid a.card-link').first().click();
  await page.waitForTimeout(800); // let the one-time scroll-to-game settle
  await page.click('[data-fullscreen]');
  await expect(page.locator('body')).toHaveClass(/expanded-mode/);
  await expect(page.locator('html')).toHaveClass(/no-scroll/);
  await expect(page.locator('.bottom-nav')).toBeHidden();
  await page.click('[data-exit-expanded]');
  await expect(page.locator('body')).not.toHaveClass(/expanded-mode/);
  await expect(page.locator('html')).not.toHaveClass(/no-scroll/);
});

test('phones: no filter column, sheet instead; desktop: filter column on the left', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/racing-games/');
  await expect(page.locator('.list-side')).toBeHidden();
  await page.click('.qchip-main');
  await expect(page.locator('#filter-drawer input').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.list-side')).toBeVisible();
  const side = (await page.locator('.list-side').boundingBox())!;
  const grid = (await page.locator('#game-grid').boundingBox())!;
  expect(side.x).toBeLessThan(grid.x);
});

test('phones: game pages never get wider than the screen; the game fits the screen', async ({ page, request }) => {
  const html = await (await request.get('/games/')).text();
  const slugs = [...new Set([...html.matchAll(/href="\/games\/([a-z0-9-]+)\/"/g)].map((m) => m[1]))].slice(0, 12);
  await page.setViewportSize({ width: 360, height: 780 });
  let checkedPortrait = false;
  for (const s of slugs) {
    await page.goto(`/games/${s}/`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), s).toBeLessThanOrEqual(360);
    const fit = await page.locator('#stage').getAttribute('data-fit');
    if (fit === 'portrait' || fit === 'any') {
      checkedPortrait = true;
      const stage = (await page.locator('#stage').boundingBox())!;
      // After the automatic scroll the whole stage is above the tab bar.
      await expect.poll(async () => page.evaluate(() => document.getElementById('stage')!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(780 - 55);
      expect(stage.height).toBeGreaterThan(400);
    }
  }
  test.info().annotations.push({ type: 'portrait-checked', description: String(checkedPortrait) });
});

test('phone turned sideways: the game uses the whole screen height, no tab bar', async ({ page, request }) => {
  const html = await (await request.get('/games/')).text();
  const slug = /href="\/games\/([a-z0-9-]+)\/"/.exec(html)![1];
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`/games/${slug}/`);
  const stage = (await page.locator('#stage').boundingBox())!;
  expect(Math.abs(stage.height - 390)).toBeLessThan(4);
  await expect(page.locator('.bottom-nav')).toBeHidden();
});

test('phones: compact privacy bar, games on the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bar = (await page.locator('#consent').boundingBox())!;
  expect(bar.height).toBeLessThanOrEqual(170);
  await page.click('[data-consent-action="reject"]');
  await expect(page.locator('#consent')).toBeHidden();
  await page.reload();
  const top = await page.evaluate(() => document.querySelector('.home-main .grid .card')!.getBoundingClientRect().top);
  expect(top).toBeLessThan(560);
});

test('phones: quick vote under the game and a Play next strip', async ({ page, request }) => {
  const html = await (await request.get('/racing-games/')).text();
  const slug = /href="\/games\/([a-z0-9-]+)\/"/.exec(html)![1];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/games/${slug}/`);
  await expect(page.locator('.game-actions [data-vote="1"]')).toBeVisible();
  await expect(page.locator('.playnext .playnext-card').first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.playnext')).toBeHidden();
});
