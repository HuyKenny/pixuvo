/**
 * Google Analytics 4, consent-first (children's site, EU):
 * - gtag.js is requested ONLY after the visitor allows "Analytics" (whenConsented);
 * - Consent Mode: analytics granted, all advertising signals denied; Google signals and
 *   ad personalisation off; no user-ID, no custom personal data;
 * - withdrawing consent switches analytics_storage to denied and deletes the _ga cookies.
 */
import { whenConsented } from './consent';

type Gtag = (...args: unknown[]) => void;
interface W { dataLayer?: unknown[]; gtag?: Gtag }
const w = window as unknown as W;

export function track(event: string, params: Record<string, string | number> = {}) {
  w.gtag?.('event', event, params);
}

/** Page context rendered by Base.astro (page_type, game_slug, game_category, provider, game_title). */
function pageContext(): Record<string, string> {
  try {
    const raw = JSON.parse(document.body.dataset.ga ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^[a-z_]{2,30}$/.test(k) && typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 100)]));
  } catch {
    return {};
  }
}

/** Which list a game card was clicked in ("Most played games this week", "Recommended games", …). */
function listName(el: Element): string {
  if (el.closest('.gotd')) return 'Game of the Day';
  const labelled = el.closest('[aria-label]');
  return (labelled?.getAttribute('aria-label') ?? 'other').slice(0, 60);
}

export function setupAnalytics(id: string, testSrc?: string) {
  whenConsented('analytics', () => {
    if (testSrc) {
      // e2e: a local stand-in proves the consent gate without calling Google.
      const s = document.createElement('script');
      s.src = testSrc;
      s.defer = true;
      document.head.appendChild(s);
      return;
    }
    if (w.gtag) return;
    w.dataLayer = w.dataLayer ?? [];
    // gtag must push the `arguments` object itself (that is what gtag.js expects).
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    w.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    w.gtag('js', new Date());
    const ctx = pageContext();
    // Config parameters go with every event on this page, so reports split by game, category, partner and page type.
    w.gtag('config', id, { ...ctx, allow_google_signals: false, allow_ad_personalization_signals: false, content_group: ctx.page_type ?? 'other' });
    document.addEventListener('click', (e) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>('a.card-link, a.gotd-card, .reclist a');
      const slug = a ? /\/games\/([a-z0-9-]+)\/$/.exec(new URL(a.href, location.href).pathname)?.[1] : undefined;
      if (a && slug) track('select_game', { game_slug: slug, list_name: listName(a) });
    });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
  });
  window.addEventListener('pixuvo:consent', (e) => {
    const state = (e as CustomEvent<{ analytics?: boolean }>).detail;
    if (state?.analytics || !w.gtag) return;
    w.gtag('consent', 'update', { analytics_storage: 'denied' });
    const host = location.hostname.replace(/^www\./, '');
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0]!.trim();
      if (!name.startsWith('_ga')) continue;
      for (const domain of ['', `; domain=.${host}`, `; domain=${host}`]) document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
    }
  });
}
