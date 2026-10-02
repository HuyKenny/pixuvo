import { expect, test } from '@playwright/test';
const PAGES = ['/', '/racing-games/', '/categories/', '/games/', '/search/?q=car', '/favorites/', '/about/', '/privacy/'];

for (const width of [360, 390, 1440]) {
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
  await page.locator('[data-drawer-open="filter-drawer"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#filter-drawer input').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-drawer-open="filter-drawer"]')).toBeFocused();
});
