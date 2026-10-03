/**
 * Header autocomplete: debounce, min length 2, max 8 results, aborts the
 * previous request, full keyboard support (↑ ↓ Enter Esc), live region for
 * screen readers. The plain form submit to /search/ works without it.
 */
import { esc } from './cards';
import { lp, pageLang, tr } from './i18n';

const form = document.querySelector<HTMLFormElement>('form[data-search]');
const input = form?.querySelector<HTMLInputElement>('[data-search-input]');
const list = form?.querySelector<HTMLUListElement>('#search-suggest');
const status = form?.querySelector<HTMLElement>('[data-search-status]');

if (form && input && list) {
  let timer: number | undefined;
  let ctrl: AbortController | null = null;
  let active = -1;
  let items: Array<{ slug: string; title: string; thumb: string; cat: string | null; kind?: 'category' }> = [];

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const render = (q: string) => {
    if (!items.length) {
      list.innerHTML = `<li><a class="s-all" href="${lp('/search/')}?q=${encodeURIComponent(q)}">${esc(tr('c.noQuick'))}</a></li>`;
    } else {
      list.innerHTML =
        items
          .map(
            (g, i) =>
              `<li><a id="sg-${i}" role="option" aria-selected="false" href="${g.kind === 'category' ? lp(`/${esc(g.slug)}-games/`) : lp(`/games/${esc(g.slug)}/`)}"><img src="${esc(g.thumb)}" alt="" width="56" height="42" loading="lazy" referrerpolicy="no-referrer"><span><span class="s-title">${esc(g.title)}</span><br><span class="s-cat">${esc(g.cat ?? '')}</span></span></a></li>`,
          )
          .join('') + `<li><a class="s-all" href="${lp('/search/')}?q=${encodeURIComponent(q)}">${esc(tr('c.seeAll', { q }))}</a></li>`;
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (status) status.textContent = items.length ? tr('c.suggestions', { n: items.length }) : tr('c.noSuggestions');
  };
  const highlight = (i: number) => {
    const opts = list.querySelectorAll<HTMLAnchorElement>('[role="option"]');
    opts.forEach((o, j) => o.setAttribute('aria-selected', String(i === j)));
    active = i;
    if (i >= 0 && opts[i]) input.setAttribute('aria-activedescendant', opts[i]!.id);
    else input.removeAttribute('aria-activedescendant');
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      ctrl?.abort();
      close();
      return;
    }
    timer = window.setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const res = await fetch(`/api/suggest/?q=${encodeURIComponent(q.slice(0, 80))}&lang=${pageLang()}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items?: typeof items };
        if (input.value.trim() !== q) return;
        items = Array.isArray(data.items) ? data.items.slice(0, 8) : [];
        render(q);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') close();
      }
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    const n = list.querySelectorAll('[role="option"]').length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight(Math.min(n - 1, active + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight(Math.max(-1, active - 1));
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      list.querySelectorAll<HTMLAnchorElement>('[role="option"]')[active]?.click();
    }
  });
  document.addEventListener('click', (e) => {
    if (!form.contains(e.target as Node)) close();
  });
  form.addEventListener('submit', (e) => {
    if (input.value.trim().length < 1) e.preventDefault();
  });
}
