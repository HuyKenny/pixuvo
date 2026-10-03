/**
 * Localises internal links in rendered HTML for non-English pages, so components
 * can keep writing plain "/games/x/" hrefs. Runs in the Astro middleware (also
 * during prerendering). Absolute URLs, assets, API/admin paths and tags marked
 * `data-keep-href` (language switcher) are untouched.
 */
import { DEFAULT_LANG, LANG_CODES, type Lang } from './locales';

const SKIP = /^\/(?:_astro\/|icons\/|fonts\/|img\/|data\/|api\/|admin\/|cdn-cgi\/|e2e-fixture\/|favicon|apple-touch|site\.webmanifest|og-default|logo-|icon-|ads\.txt|robots\.txt|sitemap|sitemaps\/)/;
const LANG_PREFIX = new RegExp(`^/(?:${LANG_CODES.filter((c) => c !== DEFAULT_LANG).join('|')})(?:/|$)`);

export function localisePath(path: string, lang: Lang): string {
  if (lang === DEFAULT_LANG || SKIP.test(path) || LANG_PREFIX.test(path)) return path;
  return `/${lang}${path}`;
}

export function localiseHtml(html: string, lang: Lang): string {
  if (lang === DEFAULT_LANG) return html;
  return html.replace(/<(?:a|form|link rel="(?:prev|next)")\b[^>]*>/g, (tag) => {
    if (tag.includes('data-keep-href')) return tag;
    return tag.replace(/(\s(?:href|action)=")(\/(?!\/)[^"]*)"/g, (_m, attr: string, path: string) => `${attr}${localisePath(path, lang)}"`);
  });
}
