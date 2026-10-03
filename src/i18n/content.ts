/**
 * Long-form SEO content (category/landing intros + FAQ, homepage block), written natively per language in
 * src/i18n/content/<lang>.json. Only prerendered views load it, so it never ends up in the Worker bundle.
 * A language without an entry shows no block (never English text on a localised page).
 */
import type { Lang } from './locales';

export interface Faq { q: string; a: string }
export interface Block { intro: string; faq?: Faq[] }
export interface Content {
  home?: { h2: string; intro: string };
  cat?: Record<string, Block>;
  land?: Record<string, Block>;
}

const files = import.meta.glob<{ default: Content }>('./content/*.json');
const cache = new Map<string, Content>();

export async function loadContent(lang: Lang): Promise<Content> {
  const hit = cache.get(lang);
  if (hit) return hit;
  const load = files[`./content/${lang}.json`];
  const c = load ? (await load()).default : {};
  cache.set(lang, c);
  return c;
}

export { paragraphs } from '../lib/paragraphs';
