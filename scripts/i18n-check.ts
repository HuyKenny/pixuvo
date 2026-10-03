/**
 * Validates translation files against the English source:
 *   tsx scripts/i18n-check.ts [lang ...]   (default: every language)
 * - every non-plural key present and non-empty
 * - plural keys: every CLDR category of the target language (Intl.PluralRules) present
 * - {placeholders} identical; docs: same HTML tag sequence, placeholders kept
 */
import { existsSync, readFileSync } from 'node:fs';
import en from '../src/i18n/messages/en.ts';
import { OTHER_LANGS, locale } from '../src/i18n/locales.ts';

const enDocs = JSON.parse(readFileSync('src/i18n/docs/en.json', 'utf8')) as Record<string, Record<string, string>>;
/** Keys that may legitimately be empty in some languages (punctuation). */
const OPTIONAL = new Set(['new.leadEnd']);
const PLURAL = /_(zero|one|two|few|many|other)$/;
// {games} and {gamesLc} are two spellings of the same phrase: a translation may use either.
const vars = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => (m[1] === 'gamesLc' ? 'games' : m[1])))].sort().join(',');
const tags = (s: string) => [...s.matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)].map((m) => m[0].startsWith('</') ? `/${m[1]}` : m[1]).join(' ');

// ── Long-form content (src/i18n/content/<lang>.json) and hero texts (data/editorial/<lang>.json) ──
// Every language must cover what English covers. Length is compared to English in characters (CJK/Thai need fewer).
type Block = { intro?: string; faq?: Array<{ q?: string; a?: string }> };
type ContentFile = { home?: { h2?: string; intro?: string }; cat?: Record<string, Block>; land?: Record<string, Block> };
type Editorial = Record<string, { summary?: string; how_to?: string; tips?: string[]; faq?: Array<{ q?: string; a?: string }> }>;
const readJson = <T>(f: string): T | null => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : null);
const enContent = readJson<ContentFile>('src/i18n/content/en.json');
const enEditorial = readJson<Editorial>('data/editorial/en.json');
const DENSE = new Set(['ja', 'ko', 'zh-hans', 'zh-hant', 'th']);
function checkLongForm(lang: string): string[] {
  const errs: string[] = [];
  const minRatio = lang === 'en' ? 1 : DENSE.has(lang) ? 0.2 : 0.55;
  const tooShort = (txt: string | undefined, ref: string | undefined) => !txt?.trim() || (ref ? txt.length < ref.length * minRatio : false);
  const leftovers = (txt: string) => /\{[a-zA-Z]+\}|\bTODO\b|\[\[/.test(txt) || /lorem ipsum/i.test(txt);
  if (enContent) {
    const c = lang === 'en' ? enContent : readJson<ContentFile>(`src/i18n/content/${lang}.json`);
    // A language without a content file simply shows no long-form block (rolled out language by language);
    // a file that exists must be complete.
    if (c) {
      if (enContent.home && (tooShort(c.home?.intro, enContent.home.intro) || !c.home?.h2?.trim())) errs.push('content: home missing/too short');
      for (const kind of ['cat', 'land'] as const) {
        for (const [slug, ref] of Object.entries(enContent[kind] ?? {})) {
          const b = c[kind]?.[slug];
          if (!b) { errs.push(`content: missing ${kind}.${slug}`); continue; }
          if (tooShort(b.intro, ref.intro)) errs.push(`content: ${kind}.${slug} intro too short`);
          if (lang === 'en' && (b.intro ?? '').split(/\s+/).length < 140) errs.push(`content: ${kind}.${slug} intro under 140 words`);
          if ((b.faq ?? []).filter((f) => f.q?.trim() && f.a?.trim()).length < 3) errs.push(`content: ${kind}.${slug} needs ≥ 3 FAQ`);
          if (leftovers(JSON.stringify(b))) errs.push(`content: ${kind}.${slug} has placeholders/TODO`);
        }
      }
    }
  }
  if (enEditorial) {
    const e = lang === 'en' ? enEditorial : readJson<Editorial>(`data/editorial/${lang}.json`);
    if (e) {
      for (const [slug, ref] of Object.entries(enEditorial)) {
        const x = e[slug];
        if (!x) { errs.push(`editorial: missing ${slug}`); continue; }
        if (tooShort(x.summary, ref.summary)) errs.push(`editorial: ${slug} summary too short`);
        if ((x.faq ?? []).length < Math.min(3, (ref.faq ?? []).length)) errs.push(`editorial: ${slug} FAQ incomplete`);
        if (leftovers(JSON.stringify(x))) errs.push(`editorial: ${slug} has placeholders/TODO`);
      }
    }
  }
  return errs;
}

const langs = process.argv.slice(2).length ? process.argv.slice(2) : OTHER_LANGS;
let bad = 0;
for (const lang of langs) {
  const errs: string[] = [];
  const f = `src/i18n/messages/${lang}.json`;
  if (!existsSync(f)) { console.log(`${lang}: MISSING ${f}`); bad++; continue; }
  const d = JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>;
  const cats = new Intl.PluralRules(locale(lang).tag).resolvedOptions().pluralCategories;
  const bases = new Set<string>();
  for (const [k, v] of Object.entries(en)) {
    const m = PLURAL.exec(k);
    if (m) { bases.add(k.slice(0, -m[0].length)); continue; }
    if (!(k in d) || (!d[k]?.trim() && !OPTIONAL.has(k))) errs.push(`missing ${k}`);
    else if (vars(d[k]!) !== vars(v)) errs.push(`placeholders ${k}: ${vars(d[k]!)} ≠ ${vars(v)}`);
  }
  // Menu entries must stay distinguishable (e.g. "Popular" and "Favorites" both became "Oblíbené" once).
  const NAV = ['nav.home', 'nav.categories', 'nav.new', 'nav.popular', 'nav.twoPlayer', 'nav.favorites', 'nav.recent', 'nav.search'];
  const seen = new Map<string, string>();
  for (const k of NAV) {
    const v = d[k]?.trim().toLocaleLowerCase();
    if (!v) continue;
    if (seen.has(v)) errs.push(`duplicate menu label "${d[k]}": ${seen.get(v)} = ${k}`);
    else seen.set(v, k);
  }
  for (const b of bases) {
    const ref = (en as Record<string, string>)[`${b}_other`]!;
    for (const c of cats) {
      const v = d[`${b}_${c}`];
      if (!v?.trim()) errs.push(`missing plural ${b}_${c}`);
      else if (vars(v).replace('n', '') !== vars(ref).replace('n', '')) errs.push(`placeholders ${b}_${c}`);
    }
  }
  for (const k of Object.keys(d)) {
    const base = k.replace(PLURAL, '');
    if (!(k in en) && !bases.has(base)) errs.push(`unknown key ${k}`);
  }
  const df = `src/i18n/docs/${lang}.json`;
  if (!existsSync(df)) errs.push(`missing ${df}`);
  else {
    const dd = JSON.parse(readFileSync(df, 'utf8')) as Record<string, Record<string, string>>;
    for (const [doc, src] of Object.entries(enDocs)) {
      const tr = dd[doc];
      if (!tr) { errs.push(`docs: missing ${doc}`); continue; }
      for (const field of ['title', 'h1', 'description', 'html']) if (!tr[field]?.trim()) errs.push(`docs: ${doc}.${field} empty`);
      if (tr.html && tags(tr.html) !== tags(src.html!)) errs.push(`docs: ${doc} HTML tags differ`);
      if (tr.html && vars(tr.html) !== vars(src.html!)) errs.push(`docs: ${doc} placeholders differ`);
      if (tr.html && /href="(?!\/|mailto:|https:)/.test(tr.html)) errs.push(`docs: ${doc} odd href`);
    }
  }
  errs.push(...checkLongForm(lang));
  if (errs.length) bad++;
  console.log(`${lang}: ${errs.length ? `${errs.length} problems\n  ${errs.slice(0, 30).join('\n  ')}` : 'OK'}`);
}
// English long-form content and editorial texts must be complete too.
const enErrs = checkLongForm('en');
if (enErrs.length) { bad++; console.log(`en (long-form): ${enErrs.length} problems\n  ${enErrs.slice(0, 30).join('\n  ')}`); }
process.exit(bad ? 1 : 0);
