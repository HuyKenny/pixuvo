/** Browser-side translations: the page embeds only the "c.*" keys of its language (<script id="i18n">). */
type Vars = Record<string, string | number>;
let dict: Record<string, string> | null = null;
const lang = (): string => document.documentElement.lang || 'en';

function load(): Record<string, string> {
  if (dict) return dict;
  try {
    dict = JSON.parse(document.getElementById('i18n')?.textContent ?? '{}') as Record<string, string>;
  } catch {
    dict = {};
  }
  return dict;
}

export function tr(key: string, vars?: Vars): string {
  const d = load();
  let s: string | undefined;
  if (vars && typeof vars.n === 'number') {
    const form = new Intl.PluralRules(lang()).select(vars.n);
    s = d[`${key}_${form}`] ?? d[`${key}_other`];
  }
  s ??= d[key] ?? key;
  if (!vars) return s;
  const nf = new Intl.NumberFormat(lang());
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined ? m : typeof vars[k] === 'number' ? nf.format(vars[k] as number) : String(vars[k])));
}

/** Current language code ("en", "cs", "zh-hans"…) and its URL prefix ("" or "/cs"). */
export const pageLang = (): string => document.documentElement.dataset.lang || 'en';
export const lp = (path: string): string => `${document.documentElement.dataset.lp ?? ''}${path}`;
export const nf = (n: number): string => new Intl.NumberFormat(lang()).format(n);
