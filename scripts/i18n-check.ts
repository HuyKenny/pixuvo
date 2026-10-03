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
  if (errs.length) bad++;
  console.log(`${lang}: ${errs.length ? `${errs.length} problems\n  ${errs.slice(0, 30).join('\n  ')}` : 'OK'}`);
}
process.exit(bad ? 1 : 0);
