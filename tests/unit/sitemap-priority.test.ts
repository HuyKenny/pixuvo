import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('priority sitemap tier', () => {
  it('is served English-only and listed first among the game parts in the index', () => {
    const part = readFileSync('src/pages/sitemaps/[name].xml.ts', 'utf8');
    expect(part).toContain("kind === 'priority'");
    expect(part).toContain('lang !== DEFAULT_LANG');
    const index = readFileSync('src/pages/sitemap.xml.ts', 'utf8');
    expect(index.indexOf("loc('priority'")).toBeGreaterThan(-1);
    expect(index.indexOf("loc('priority'")).toBeLessThan(index.indexOf('parts.map'));
  });
});
