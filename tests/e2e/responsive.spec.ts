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
  await page.locator('#game-grid a.card-link').first().click();
  await page.click('[data-fullscreen]');
  await expect(page.locator('body')).toHaveClass(/expanded-mode/);
  await expect(page.locator('html')).toHaveClass(/no-scroll/);
  await expect(page.locator('.bottom-nav')).toBeHidden();
  await page.click('[data-exit-expanded]');
  await expect(page.locator('body')).not.toHaveClass(/expanded-mode/);
  await expect(page.locator('html')).not.toHaveClass(/no-scroll/);
});
