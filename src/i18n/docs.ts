/** Info & legal page texts per language (src/i18n/docs/<lang>.json, English source en.json). */
import en from './docs/en.json';
import type { Lang } from './locales';
export type DocKey = keyof typeof en;
export interface DocText { title: string; h1: string; description: string; html: string }
const loaders = import.meta.glob<{ default: Record<string, DocText> }>('./docs/*.json');
export const DOC_UPDATED = '2026-10-02';
/** Legal texts where the English version prevails. */
export const BINDING_EN: DocKey[] = ['privacy', 'terms', 'copyright'];

export async function docText(lang: Lang, key: DocKey): Promise<{ text: DocText; translated: boolean }> {
  const base = (en as Record<string, DocText>)[key]!;
  if (lang === 'en') return { text: base, translated: false };
  const loader = loaders[`./docs/${lang}.json`];
  const tr = loader ? (await loader()).default[key] : undefined;
  return tr?.html ? { text: tr, translated: true } : { text: base, translated: false };
}
