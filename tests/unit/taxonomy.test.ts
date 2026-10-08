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

describe('title-derived tags', () => {
  it('tags the themes landing pages are built on, by whole word', async () => {
    const { titleTags } = await import('../../src/lib/taxonomy.ts');
    const slugs = (t: string) => titleTags(t).map((x) => x.slug);
    expect(slugs('Run Dino Run')).toEqual(['dinosaur-games']);
    expect(slugs('Cute Dinosaur Run')).toEqual(['dinosaur-games']);
    expect(slugs('Hungry Shark Attack')).toEqual(['shark-games']);
    expect(slugs('Kitten Bowling')).toEqual(['bowling-games']);
    expect(slugs('Garden Secrets Find the Differences')).toEqual(['spot-the-difference']);
    expect(slugs('Baby Taylor Little Santa Helper')).toEqual(['baby-games']);
    expect(slugs('Baby Sniper In Vietnam')).toEqual([]);
    expect(slugs('Date the Difference')).toEqual([]);
    expect(slugs('Tiny Fishing')).toEqual([]);
    expect(slugs('Dinosaurs and Babies')).toEqual(['dinosaur-games', 'baby-games']);
  });
});

describe('description and style derived tags', () => {
  it('uses the description for age words, skips scary titles, and tags 3D by style', async () => {
    const { titleTags } = await import('../../src/lib/taxonomy.ts');
    const slugs = (t: string, d = '', s: string | null = null) => titleTags(t, d, s).map((x) => x.slug);
    expect(slugs('Wooden Puzzles', 'Wooden Puzzles is puzzle game for toddlers where you put objects in place')).toEqual(['toddler-games']);
    expect(slugs('Wooden Puzzles', 'A puzzle game')).toEqual([]);
    expect(slugs('Haunted Kindergarten', 'Venture into an abandoned kindergarten, every shadow hides a threat')).toEqual([]);
    expect(slugs('Coloring Book Kindergarten', 'Coloring book game for kids in kindergarten')).toEqual(['kindergarten-games']);
    expect(slugs('Ludo King')).toEqual(['ludo-games']);
    expect(slugs('Slope City', '', '3d')).toEqual(['3d-games']);
  });
});
