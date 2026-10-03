/**
 * Translation runtime (server + build). English is the source of keys
 * (messages/en.ts); other languages are JSON files loaded on demand, so the
 * Worker only parses the dictionary of the language it renders.
 *
 *   const { t, lang, lp, n } = await useI18n(Astro);
 *   t('nav.categories')            → "Kategorie"
 *   t('games.count', { n: 42 })    → plural via Intl.PluralRules (keys games.count_one / _few / _many / _other)
 */
import en, { type MessageKey } from './messages/en';
import { DEFAULT_LANG, langFromPath, locale, localePath, type Lang } from './locales';

export type Dict = Partial<Record<string, string>>;
const loaders = import.meta.glob<{ default: Dict }>('./messages/*.json');
const cache = new Map<Lang, Dict>([[DEFAULT_LANG, en as Dict]]);

export async function loadDict(lang: Lang): Promise<Dict> {
  const hit = cache.get(lang);
  if (hit) return hit;
  const loader = loaders[`./messages/${lang}.json`];
  const dict = loader ? (await loader()).default : {};
  cache.set(lang, dict);
  return dict;
}

export type Vars = Record<string, string | number>;
export type T = (key: MessageKey | (string & {}), vars?: Vars) => string;

export function makeT(lang: Lang, dict: Dict): T {
  const tag = locale(lang).tag;
  const plural = new Intl.PluralRules(tag);
  const nf = new Intl.NumberFormat(tag);
  const get = (k: string): string | undefined => dict[k] ?? (en as Dict)[k];
  return (key, vars) => {
    let s: string | undefined;
    if (vars && typeof vars.n === 'number') {
      const form = plural.select(vars.n);
      s = dict[`${key}_${form}`] ?? dict[`${key}_other`] ?? (en as Dict)[`${key}_${new Intl.PluralRules('en').select(vars.n)}`] ?? (en as Dict)[`${key}_other`];
    }
    s ??= get(key) ?? key;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (m, name: string) => {
      const v = vars[name];
      if (v === undefined) return m;
      return typeof v === 'number' ? nf.format(v) : v;
    });
  };
}

export interface I18n {
  lang: Lang;
  tag: string;
  dir: 'ltr' | 'rtl';
  t: T;
  /** Localised internal path. */
  lp: (path: string) => string;
  /** Localised integer. */
  n: (x: number) => string;
  /** "45,000+" honest rounding, localised. */
  approx: (x: number) => string;
  date: (iso: string | null) => string | null;
  /** Category / theme display names. */
  cat: (slug: string, fallback?: string) => string;
  catBlurb: (slug: string, fallback?: string) => string;
}

export async function i18nFor(lang: Lang): Promise<I18n> {
  const dict = await loadDict(lang);
  const t = makeT(lang, dict);
  const loc = locale(lang);
  const nf = new Intl.NumberFormat(loc.tag);
  const df = new Intl.DateTimeFormat(loc.tag, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const has = (k: string) => dict[k] !== undefined || (en as Dict)[k] !== undefined;
  return {
    lang,
    tag: loc.tag,
    dir: loc.dir,
    t,
    lp: (p) => localePath(lang, p),
    n: (x) => nf.format(x),
    approx: (x) => {
      const v = x >= 10_000 ? Math.floor(x / 1000) * 1000 : x >= 1000 ? Math.floor(x / 100) * 100 : x >= 100 ? Math.floor(x / 10) * 10 : x;
      return x >= 100 ? `${nf.format(v)}+` : nf.format(v);
    },
    date: (iso) => {
      if (!iso) return null;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null : df.format(d);
    },
    cat: (slug, fallback) => (has(`catn.${slug}`) ? t(`catn.${slug}`) : has(`theme.${slug}`) ? t(`theme.${slug}`) : fallback ?? slug),
    catBlurb: (slug, fallback) => (has(`catb.${slug}`) ? t(`catb.${slug}`) : fallback ?? ''),
  };
}

/** For .astro files: language from the request URL. */
export function useI18n(astro: { url: URL }): Promise<I18n> {
  return i18nFor(langFromPath(astro.url.pathname));
}

/** Keys the browser scripts need (prefix "c."), as a small JSON blob per page. */
export async function clientDict(lang: Lang): Promise<Record<string, string>> {
  const dict = await loadDict(lang);
  const out: Record<string, string> = {};
  const client = (k: string) => k.startsWith('c.') || k.startsWith('theme.');
  for (const [k, v] of Object.entries(en as Dict)) if (client(k) && v) out[k] = dict[k] ?? v;
  // Plural forms that English does not have (e.g. _few, _many).
  for (const [k, v] of Object.entries(dict)) if (client(k) && v) out[k] = v;
  return out;
}
