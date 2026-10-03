/**
 * Page numbers shown by the pager: first, last, the current page ±3 and "jumps" (every 10th page around the current
 * one, every 100th across the whole range). Keeps every page of a 1 000-page list within 5 clicks of page 1, which
 * is how crawlers reach deep games without a sitemap.
 */
export type PagerItem = number | 'gap';

export function pagerItems(page: number, pages: number): PagerItem[] {
  if (pages <= 1) return [];
  const set = new Set<number>([1, pages]);
  for (let n = page - 3; n <= page + 3; n++) set.add(n);
  const tens = Math.floor(page / 10) * 10;
  for (const n of [tens - 20, tens - 10, tens + 10, tens + 20]) set.add(n);
  if (pages > 100) for (let n = 100; n < pages; n += 100) set.add(n);
  else for (let n = 10; n < pages; n += 10) set.add(n);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: PagerItem[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1]! > 1) out.push('gap');
    out.push(n);
  });
  return out;
}
