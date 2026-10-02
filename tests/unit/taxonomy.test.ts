import { describe, expect, it } from 'vitest';
import { CATEGORIES, findBrandTerms, findSensitiveTerms, mapLabelsToCategories, pickPrimaryCategory } from '../../src/lib/taxonomy.ts';

describe('taxonomy', () => {
  it('has unique slugs and valid parents', () => {
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of CATEGORIES) if (c.parent) expect(slugs).toContain(c.parent);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });
  it('maps provider labels and adds the parent genre', () => {
    const cats = mapLabelsToCategories(['Drifting', 'html5', '2 Player']);
    expect(cats).toEqual(expect.arrayContaining(['drift', 'racing', '2-player']));
    expect(cats).not.toContain('html5');
  });
  it('never creates brand categories', () => {
    expect(mapLabelsToCategories(['Minecraft', 'Roblox'])).toEqual([]);
  });
  it('prefers a real genre over modes and the casual bucket', () => {
    expect(pickPrimaryCategory(['casual', '2-player', 'puzzle'])).toBe('puzzle');
    expect(pickPrimaryCategory(['2-player'])).toBe('2-player');
    expect(pickPrimaryCategory([])).toBeNull();
  });
  it('detects brand and sensitive terms as whole words', () => {
    expect(findBrandTerms('Super Mario Run')).toContain('mario');
    expect(findBrandTerms('Marionette Show')).toEqual([]);
    expect(findSensitiveTerms('Casino Night')).toContain('casino');
    expect(findSensitiveTerms('Slothful Sloth')).toEqual([]);
  });
});
