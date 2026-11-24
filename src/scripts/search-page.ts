/**
 * Static /search/?q=… (Workers Free: pages are frozen files, so the query is read in the browser).
 * Results come from GET /api/games/?q=&page=&lang= (FTS-ranked in D1, edge-cached per query) and are drawn with the same
 * card markup as the listings; the server-rendered form stays for an empty query.
 */
import { cardHtml, esc, type ClientCard } from './cards';
import { lp, pageLang } from './i18n';

type Vars = Record<string, string | number>;
const box = document.getElementById('i18n-search');
if (box) {
  let dict: Record<string, string> = {};
  try {
    dict = JSON.parse(box.textContent ?? '{}') as Record<string, string>;
  } catch {
    /* keys are shown */
  }
  const lang = document.documentElement.lang || 'en';
  const t = (key: string, vars?: Vars): string => {
    let s: string | undefined;
    if (vars && typeof vars.n === 'number') s = dict[`${key}_${new Intl.PluralRules(lang).select(vars.n)}`] ?? dict[`${key}_other`];
    s ??= dict[key] ?? key;
    const nf = new Intl.NumberFormat(lang);
    return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined ? m : typeof vars[k] === 'number' ? nf.format(vars[k] as number) : String(vars[k]))) : s;
  };
  const sp = new URLSearchParams(location.search);
  const raw = (sp.get('q') ?? '').trim().slice(0, 60);
  const page = Math.min(20, Math.max(1, Number(sp.get('page')) || 1));
  const h1 = document.getElementById('search-h1');
  const lead = document.getElementById('search-lead');
  const live = document.getElementById('search-live');
  const cats = document.getElementById('search-cats');
  const form = document.getElementById('search-form');
  const input = document.querySelector<HTMLInputElement>('.header-search input[name="q"]');
  if (raw && h1 && lead && live) {
    if (input) input.value = raw;
    document.title = t('search.titleQuery', { q: raw });
    h1.textContent = t('search.resultsFor', { q: raw });
    if (form) form.hidden = true;
    live.hidden = false;
    const show = (html: string) => {
      live.innerHTML = html;
    };
    const empty = (title: string, text: string) => `<div class="empty-state"><strong>${esc(title)}</strong>${text}</div>`;
    if (raw.replace(/\s/g, '').length < 2) {
      show(empty(t('search.tooShortTitle'), esc(t('search.tooShortText'))));
    } else {
      show('<div class="grid" role="list" aria-busy="true"></div>');
      const qs = new URLSearchParams({ q: raw });
      if (page > 1) qs.set('page', String(page));
      if (pageLang() !== 'en') qs.set('lang', pageLang());
      fetch(`/api/games/?${qs}`, { headers: { accept: 'application/json' } })
        .then((r) => (r.ok ? (r.json() as Promise<{ items: ClientCard[]; total: number; capped: boolean; pages: number }>) : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          lead.hidden = false;
          lead.textContent = d.total === 0 ? t('search.none') : d.capped ? t('search.foundCapped', { n: String(d.total) }) : t('search.found', { n: d.total });
          if (!d.items.length) {
            show(empty(t('search.noMatchTitle', { q: raw }), `${esc(t('search.noMatchText'))} <a href="${lp('/categories/')}">${esc(t('search.browseCategories'))}</a>.`));
            return;
          }
          const href = (n: number) => `${lp('/search/')}?q=${encodeURIComponent(raw)}${n > 1 ? `&page=${n}` : ''}`;
          const nums = [...new Set([1, d.pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= d.pages))].sort((a, b) => a - b);
          const pager = d.pages > 1
            ? `<nav aria-label="${esc(t('search.pages'))}"><ul class="pagination">${nums.map((n, i) => `${i && n - nums[i - 1]! > 1 ? '<li><span class="gap" aria-hidden="true">…</span></li>' : ''}<li>${n === page ? `<span aria-current="page">${n}</span>` : `<a href="${href(n)}">${n}</a>`}</li>`).join('')}</ul></nav>`
            : '';
          show(`<div class="grid" role="list" aria-label="${esc(t('search.resultsLabel'))}">${d.items.map((g) => cardHtml(g)).join('')}</div>${pager}`);
        })
        .catch(() => show(empty(t('search.none'), '')));
      // Matching categories (cheap: /api/suggest/ is FTS-limited and cached)
      if (cats && page === 1)
        fetch(`/api/suggest/?q=${encodeURIComponent(raw)}&lang=${pageLang()}`, { headers: { accept: 'application/json' } })
          .then((r) => (r.ok ? (r.json() as Promise<{ items: Array<{ kind?: string; slug: string; title: string; thumb: string }> }>) : null))
          .then((d) => {
            const hits = (d?.items ?? []).filter((x) => x.kind === 'category').slice(0, 4);
            if (!hits.length) return;
            cats.innerHTML = hits.map((h) => `<a class="chip" href="${lp(`/${esc(h.slug)}-games/`)}"><img src="${esc(h.thumb)}" alt="" width="22" height="22">${esc(h.title)}</a>`).join('');
            cats.hidden = false;
          })
          .catch(() => {});
    }
  }
}
