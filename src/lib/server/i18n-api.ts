/** Server-side helpers for localised API responses (category names, category search hits). */
import { i18nFor } from '../../i18n';
import { DEFAULT_LANG, isLang } from '../../i18n/locales';
import type { CategoryInfo } from '../types';
import { MIN_CATEGORY_GAMES } from '../taxonomy';

export function apiLang(url: URL): string {
  const l = url.searchParams.get('lang');
  return isLang(l) ? l : DEFAULT_LANG;
}

/** Replace English category names on cards with the requested language. */
export async function localiseCards<T extends { cat?: string | null; catSlug?: string | null }>(items: T[], lang: string): Promise<T[]> {
  if (lang === DEFAULT_LANG) return items;
  const i = await i18nFor(lang);
  return items.map((g) => (g.cat && g.catSlug ? { ...g, cat: i.cat(g.catSlug, g.cat) } : g));
}

const fold = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

/** Categories whose name (in the page language or English) matches the query — "závod" → Racing. */
export async function categoryHits(raw: string, lang: string, cats: CategoryInfo[], limit = 2) {
  const query = fold(raw);
  if (query.length < 2) return [];
  const i = await i18nFor(lang);
  const out: Array<{ kind: 'category'; slug: string; title: string; thumb: string; cat: string; catSlug: null; score: number }> = [];
  for (const c of cats) {
    if (c.count < MIN_CATEGORY_GAMES) continue;
    const local = i.cat(c.slug, c.name);
    const names = [fold(local), fold(c.name)];
    const words = names.flatMap((n) => n.split(/[\s&/,-]+/));
    const score = names.some((n) => n === query) ? 3 : words.some((w) => w.startsWith(query)) ? 2 : names.some((n) => n.includes(query)) ? 1 : 0;
    if (score) out.push({ kind: 'category', slug: c.slug, title: i.t('home.sectionGames', i.catGames(c.slug, local)), thumb: `/icons/cat/${c.slug}.webp`, cat: i.t('search.categoryHit'), catSlug: null, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _s, ...x }) => x);
}
