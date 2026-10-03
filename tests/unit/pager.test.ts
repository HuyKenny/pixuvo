import { describe, expect, it } from 'vitest';
import { pagerItems } from '../../src/lib/pager.ts';

const nums = (page: number, pages: number) => pagerItems(page, pages).filter((x): x is number => x !== 'gap');

describe('pager', () => {
  it('is empty for a single page', () => expect(pagerItems(1, 1)).toEqual([]));
  it('shows every page of a short list', () => expect(nums(3, 6)).toEqual([1, 2, 3, 4, 5, 6]));
  it('links first, last, ±3, nearby tens and every 100th page', () => {
    const n = nums(357, 1093);
    for (const x of [1, 1093, 354, 355, 356, 358, 359, 360, 340, 370, 100, 500, 1000]) expect(n, String(x)).toContain(x);
  });
  it('reaches any page of a 1 093-page list within 5 clicks from page 1', () => {
    const seen = new Map<number, number>([[1, 0]]);
    let frontier = [1];
    for (let depth = 1; depth <= 5; depth++) {
      const next: number[] = [];
      for (const p of frontier) for (const x of nums(p, 1093)) if (!seen.has(x)) { seen.set(x, depth); next.push(x); }
      frontier = next;
    }
    expect(seen.size).toBe(1093);
  });
  it('puts gaps between non-adjacent numbers only', () => {
    const items = pagerItems(50, 300);
    items.forEach((x, i) => { if (x === 'gap') expect((items[i + 1] as number) - (items[i - 1] as number)).toBeGreaterThan(1); });
  });
});
