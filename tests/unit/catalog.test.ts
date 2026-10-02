import { describe, expect, it } from 'vitest';
import { buildFtsQuery, clampPage, parseFilters } from '../../src/lib/catalog.ts';
import type { CategoryInfo } from '../../src/lib/types.ts';

const cats: CategoryInfo[] = [{ id: 1, slug: 'racing', name: 'Racing', kind: 'genre', parent: null, blurb: '', nav: true, count: 100 }];

describe('search query builder', () => {
  it('neutralises FTS5 operators and quotes', () => {
    for (const raw of ['"', 'car" OR 1=1 --', 'NEAR(a b)', 'title:car', '-car', 'car*', '(((', "'; DROP TABLE games;--"]) {
      const q = buildFtsQuery(raw);
      if (q) {
        expect(q.match).toMatch(/^[("a-z0-9 *OR AND)]+$/);
        expect(q.match).not.toMatch(/NEAR|:|--|;/);
      }
    }
  });
  it('adds synonyms', () => {
    expect(buildFtsQuery('soccer')!.match).toBe('("soccer"* OR "football"*)');
    expect(buildFtsQuery('Car racing')!.match).toContain('"driving"*');
  });
  it('rejects too short queries', () => {
    expect(buildFtsQuery('a')).toBeNull();
    expect(buildFtsQuery('   ')).toBeNull();
    expect(buildFtsQuery('**')).toBeNull();
  });
});

describe('filters', () => {
  it('parses valid filters', () => {
    const f = parseFilters(new URLSearchParams('cat=racing&players=2&device=mobile&sort=new&page=2'), cats)!;
    expect(f).toMatchObject({ players: '2', device: 'mobile', sort: 'new', page: 2 });
    expect(f.cat?.slug).toBe('racing');
  });
  it('rejects unknown values and categories', () => {
    expect(parseFilters(new URLSearchParams('players=9'), cats)).toBeNull();
    expect(parseFilters(new URLSearchParams('cat=nope'), cats)).toBeNull();
    expect(parseFilters(new URLSearchParams('page=0'), cats)).toBeNull();
    expect(parseFilters(new URLSearchParams('page=abc'), cats)).toBeNull();
  });
  it('clamps pages', () => {
    expect(clampPage('3')).toBe(3);
    expect(clampPage('1.5')).toBeNull();
    expect(clampPage('99999', 100)).toBeNull();
  });
});
