/**
 * Supported languages. English lives at the root (no prefix); every other language
 * under /{code}/. Codes are lowercase URL segments; `tag` is the BCP 47 tag used for
 * <html lang>, hreflang and Intl formatting.
 */
export interface LocaleDef {
  code: string;
  tag: string;
  name: string; // native name, shown in the language switcher
  english: string;
  dir: 'ltr' | 'rtl';
  /** Countries (ISO 3166-1 alpha-2, as in CF-IPCountry) whose default language this is. */
  countries: string[];
  /** Model language code for machine translation of game texts (m2m100). */
  mt: string;
  /** OG locale (og:locale). */
  og: string;
  /** "This page is also in <language>." written in that language (language offer bar). */
  offer: string;
  /** "Switch" in that language. */
  go: string;
}

export const DEFAULT_LANG = 'en';

export const LOCALES: LocaleDef[] = [
  { code: 'en', tag: 'en', name: 'English', english: 'English', dir: 'ltr', countries: ['US', 'GB', 'IE', 'AU', 'NZ', 'CA', 'ZA', 'IN', 'PH', 'NG', 'KE', 'SG', 'MY'], mt: 'en', og: 'en_US', offer: 'This page is also available in English.', go: 'Switch' },
  { code: 'es', tag: 'es', name: 'Español', english: 'Spanish', dir: 'ltr', countries: ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR', 'GQ'], mt: 'es', og: 'es_ES', offer: 'Esta página también está disponible en español.', go: 'Cambiar' },
  { code: 'fr', tag: 'fr', name: 'Français', english: 'French', dir: 'ltr', countries: ['FR', 'BE', 'LU', 'MC', 'SN', 'CI', 'CM', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GA', 'CG', 'CD', 'MG', 'HT', 'TN', 'DZ', 'MA'], mt: 'fr', og: 'fr_FR', offer: 'Cette page est aussi disponible en français.', go: 'Changer' },
  { code: 'pt', tag: 'pt', name: 'Português', english: 'Portuguese', dir: 'ltr', countries: ['BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'], mt: 'pt', og: 'pt_BR', offer: 'Esta página também está disponível em português.', go: 'Mudar' },
  { code: 'de', tag: 'de', name: 'Deutsch', english: 'German', dir: 'ltr', countries: ['DE', 'AT', 'CH', 'LI'], mt: 'de', og: 'de_DE', offer: 'Diese Seite gibt es auch auf Deutsch.', go: 'Wechseln' },
  { code: 'it', tag: 'it', name: 'Italiano', english: 'Italian', dir: 'ltr', countries: ['IT', 'SM', 'VA'], mt: 'it', og: 'it_IT', offer: 'Questa pagina è disponibile anche in italiano.', go: 'Cambia' },
  { code: 'nl', tag: 'nl', name: 'Nederlands', english: 'Dutch', dir: 'ltr', countries: ['NL', 'SR'], mt: 'nl', og: 'nl_NL', offer: 'Deze pagina is ook beschikbaar in het Nederlands.', go: 'Wisselen' },
  { code: 'pl', tag: 'pl', name: 'Polski', english: 'Polish', dir: 'ltr', countries: ['PL'], mt: 'pl', og: 'pl_PL', offer: 'Ta strona jest dostępna również po polsku.', go: 'Przełącz' },
  { code: 'cs', tag: 'cs', name: 'Čeština', english: 'Czech', dir: 'ltr', countries: ['CZ'], mt: 'cs', og: 'cs_CZ', offer: 'Tato stránka je dostupná i v češtině.', go: 'Přepnout' },
  { code: 'sk', tag: 'sk', name: 'Slovenčina', english: 'Slovak', dir: 'ltr', countries: ['SK'], mt: 'sk', og: 'sk_SK', offer: 'Táto stránka je dostupná aj v slovenčine.', go: 'Prepnúť' },
  { code: 'hu', tag: 'hu', name: 'Magyar', english: 'Hungarian', dir: 'ltr', countries: ['HU'], mt: 'hu', og: 'hu_HU', offer: 'Ez az oldal magyarul is elérhető.', go: 'Váltás' },
  { code: 'ro', tag: 'ro', name: 'Română', english: 'Romanian', dir: 'ltr', countries: ['RO', 'MD'], mt: 'ro', og: 'ro_RO', offer: 'Această pagină este disponibilă și în limba română.', go: 'Schimbă' },
  { code: 'uk', tag: 'uk', name: 'Українська', english: 'Ukrainian', dir: 'ltr', countries: ['UA'], mt: 'uk', og: 'uk_UA', offer: 'Ця сторінка доступна також українською.', go: 'Перейти' },
  { code: 'ru', tag: 'ru', name: 'Русский', english: 'Russian', dir: 'ltr', countries: ['RU', 'BY', 'KZ', 'KG', 'TJ', 'UZ', 'AM', 'AZ', 'GE', 'TM'], mt: 'ru', og: 'ru_RU', offer: 'Эта страница доступна также на русском.', go: 'Перейти' },
  { code: 'tr', tag: 'tr', name: 'Türkçe', english: 'Turkish', dir: 'ltr', countries: ['TR', 'CY'], mt: 'tr', og: 'tr_TR', offer: 'Bu sayfa Türkçe olarak da mevcut.', go: 'Değiştir' },
  { code: 'ar', tag: 'ar', name: 'العربية', english: 'Arabic', dir: 'rtl', countries: ['SA', 'AE', 'EG', 'IQ', 'JO', 'KW', 'LB', 'LY', 'OM', 'QA', 'BH', 'SY', 'YE', 'SD', 'PS', 'MR'], mt: 'ar', og: 'ar_AR', offer: 'هذه الصفحة متوفرة أيضًا باللغة العربية.', go: 'تبديل' },
  { code: 'id', tag: 'id', name: 'Bahasa Indonesia', english: 'Indonesian', dir: 'ltr', countries: ['ID'], mt: 'id', og: 'id_ID', offer: 'Halaman ini juga tersedia dalam Bahasa Indonesia.', go: 'Ganti' },
  { code: 'vi', tag: 'vi', name: 'Tiếng Việt', english: 'Vietnamese', dir: 'ltr', countries: ['VN'], mt: 'vi', og: 'vi_VN', offer: 'Trang này cũng có bằng tiếng Việt.', go: 'Chuyển' },
  { code: 'th', tag: 'th', name: 'ไทย', english: 'Thai', dir: 'ltr', countries: ['TH'], mt: 'th', og: 'th_TH', offer: 'หน้านี้มีภาษาไทยด้วย', go: 'เปลี่ยน' },
  { code: 'ja', tag: 'ja', name: '日本語', english: 'Japanese', dir: 'ltr', countries: ['JP'], mt: 'ja', og: 'ja_JP', offer: 'このページは日本語でもご覧いただけます。', go: '切り替え' },
  { code: 'ko', tag: 'ko', name: '한국어', english: 'Korean', dir: 'ltr', countries: ['KR'], mt: 'ko', og: 'ko_KR', offer: '이 페이지는 한국어로도 볼 수 있습니다.', go: '전환' },
  { code: 'zh-hans', tag: 'zh-Hans', name: '简体中文', english: 'Chinese (Simplified)', dir: 'ltr', countries: ['CN', 'SG'], mt: 'zh', og: 'zh_CN', offer: '此页面也提供简体中文版本。', go: '切换' },
  { code: 'zh-hant', tag: 'zh-Hant', name: '繁體中文', english: 'Chinese (Traditional)', dir: 'ltr', countries: ['TW', 'HK', 'MO'], mt: 'zh', og: 'zh_TW', offer: '此頁面也提供繁體中文版本。', go: '切換' },
];

export type Lang = string;
export const LANG_CODES = LOCALES.map((l) => l.code);
export const OTHER_LANGS = LANG_CODES.filter((c) => c !== DEFAULT_LANG);
const byCode = new Map(LOCALES.map((l) => [l.code, l]));

export function isLang(x: unknown): x is Lang {
  return typeof x === 'string' && byCode.has(x);
}
export function locale(code: Lang): LocaleDef {
  return byCode.get(code) ?? byCode.get(DEFAULT_LANG)!;
}

/** Language from a URL path: first segment if it is a non-default language code. */
export function langFromPath(pathname: string): Lang {
  const seg = pathname.split('/')[1] ?? '';
  return seg !== DEFAULT_LANG && byCode.has(seg) ? seg : DEFAULT_LANG;
}

/** Path without the language prefix ("/cs/games/" → "/games/"). */
export function stripLocale(pathname: string): string {
  const lang = langFromPath(pathname);
  if (lang === DEFAULT_LANG) return pathname;
  const rest = pathname.slice(lang.length + 1);
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/** Localised path ("/games/", "cs" → "/cs/games/"). Accepts paths with query/fragment. */
export function localePath(lang: Lang, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (lang === DEFAULT_LANG || !byCode.has(lang)) return p;
  return `/${lang}${p}`;
}

// ── Detection (homepage only) ──────────────────────────────────────────────
const COUNTRY = new Map<string, Lang>();
for (const l of LOCALES) for (const c of l.countries) COUNTRY.set(c, l.code);

/** Best supported language for an Accept-Language header (q-weights respected), or null. */
export function fromAcceptLanguage(header: string | null | undefined): Lang | null {
  if (!header) return null;
  const items = header
    .split(',')
    .map((part, i) => {
      const [tagRaw, ...params] = part.trim().split(';');
      const qp = params.find((p) => p.trim().startsWith('q='));
      const q = qp ? Number(qp.trim().slice(2)) : 1;
      return { tag: (tagRaw ?? '').trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, i };
    })
    .filter((x) => x.tag && x.tag !== '*' && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .slice(0, 12);
  for (const { tag } of items) {
    const m = matchTag(tag);
    if (m) return m;
  }
  return null;
}

function matchTag(tag: string): Lang | null {
  const [base, ...rest] = tag.split('-');
  if (!base) return null;
  if (base === 'zh') {
    const sub = rest.join('-');
    if (/(^|-)hant($|-)/.test(sub) || /(^|-)(tw|hk|mo)($|-)/.test(sub)) return 'zh-hant';
    return 'zh-hans';
  }
  if (base === 'nb' || base === 'no') return null;
  return byCode.has(base) ? base : null;
}

export function fromCountry(country: string | null | undefined): Lang | null {
  if (!country) return null;
  return COUNTRY.get(country.toUpperCase()) ?? null;
}

const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|skype|preview|lighthouse|pagespeed|headless|curl|wget|python-requests|go-http-client|axios|node-fetch/i;
export function isBot(ua: string | null | undefined): boolean {
  return !ua || BOT_UA.test(ua);
}

export const LANG_COOKIE = 'pixuvo_lang';

/** Homepage language choice: remembered choice → browser language → country → English. */
export function detectLang(input: { cookie?: string | null; acceptLanguage?: string | null; country?: string | null; ua?: string | null }): Lang {
  if (isBot(input.ua)) return DEFAULT_LANG;
  const remembered = /(?:^|;\s*)pixuvo_lang=([a-z-]{2,7})/.exec(input.cookie ?? '')?.[1];
  if (remembered && isLang(remembered)) return remembered;
  return fromAcceptLanguage(input.acceptLanguage) ?? fromCountry(input.country) ?? DEFAULT_LANG;
}
