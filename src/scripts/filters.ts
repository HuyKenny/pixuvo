/**
 * Filter state lives in the URL fragment (#players=2&device=mobile&page=2), so it
 * is shareable, survives Back from a game page, and creates no crawlable URLs.
 * The server-rendered grid and its pagination stay untouched while no filter is set.
 */
import { cardHtml, esc, type ClientCard } from './cards';

const bar = document.querySelector<HTMLElement>('[data-filters]');
const form = document.querySelector<HTMLFormElement>('[data-filter-form]');
const grid = document.getElementById('game-grid');
const pager = document.getElementById('game-pager');

const KEYS = ['sort', 'device', 'players', 'mode', 'style', 'controls', 'page'] as const;
type Key = (typeof KEYS)[number];
const MULTI_EXCLUSIVE: Key[] = ['players', 'mode', 'style', 'controls', 'device'];
const LABELS: Record<string, string> = {
  'sort:new': 'Newest', 'sort:az': 'A–Z', 'device:mobile': 'Works on mobile', 'players:1': '1 player', 'players:2': '2+ players',
  'mode:local': 'Same device', 'mode:online': 'Online', 'style:2d': '2D', 'style:3d': '3D', 'style:pixel': 'Pixel art',
  'controls:keyboard': 'Keyboard', 'controls:mouse': 'Mouse', 'controls:touch': 'Touch',
};

if (bar && form && grid) {
  const category = bar.dataset.category ?? '';
  const total = Number(bar.dataset.total ?? '0');
  const originalGrid = grid.innerHTML;
  const originalPager = pager?.innerHTML ?? '';
  const count = bar.querySelector<HTMLElement>('[data-result-count]')!;
  const activeBox = bar.querySelector<HTMLElement>('[data-active-filters]')!;
  const badge = bar.querySelector<HTMLElement>('[data-filter-badge]')!;
  let ctrl: AbortController | null = null;

  const readHash = (): Partial<Record<Key, string>> => {
    const sp = new URLSearchParams(location.hash.slice(1));
    const out: Partial<Record<Key, string>> = {};
    for (const k of KEYS) {
      const v = sp.get(k);
      if (v && /^[a-z0-9]{1,10}$/.test(v)) out[k] = v;
    }
    if (out.sort === 'featured') delete out.sort;
    if (out.page === '1') delete out.page;
    return out;
  };
  const writeHash = (s: Partial<Record<Key, string>>) => {
    const sp = new URLSearchParams();
    for (const k of KEYS) if (s[k]) sp.set(k, s[k]!);
    const h = sp.toString();
    history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
    apply();
  };
  const syncForm = (s: Partial<Record<Key, string>>) => {
    form.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
      i.checked = i.name === 'sort' ? (s.sort ?? 'featured') === i.value : s[i.name as Key] === i.value;
    });
  };

  async function apply() {
    const s = readHash();
    syncForm(s);
    const active = Object.entries(s).filter(([k]) => k !== 'page');
    badge.textContent = active.length ? `(${active.length})` : '';
    activeBox.innerHTML = active
      .map(([k, v]) => `<button type="button" class="filter-pill" data-remove-filter="${k}">${esc(LABELS[`${k}:${v}`] ?? v)}<span aria-hidden="true">×</span><span class="sr-only"> — remove filter</span></button>`)
      .join('') + (active.length ? '<button type="button" class="link-btn" data-filter-clear>Clear all</button>' : '');
    if (!Object.keys(s).length) {
      grid.innerHTML = originalGrid;
      if (pager) pager.innerHTML = originalPager;
      count.textContent = `${total.toLocaleString('en-US')} games`;
      (window as unknown as { pixuvoSyncFavs?: () => void }).pixuvoSyncFavs?.();
      return;
    }
    ctrl?.abort();
    ctrl = new AbortController();
    const qs = new URLSearchParams();
    if (category) qs.set('cat', category);
    for (const [k, v] of Object.entries(s)) qs.set(k, v);
    grid.classList.add('loading-veil');
    try {
      const res = await fetch(`/api/games/?${qs}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: ClientCard[]; total: number; capped: boolean; page: number; pages: number };
      grid.innerHTML = data.items.length
        ? data.items.map((g) => cardHtml(g)).join('')
        : `<div class="empty-state" role="listitem"><strong>No games match these filters</strong>Try removing a filter. <button type="button" class="link-btn" data-filter-clear>Clear all filters</button></div>`;
      count.textContent = `${data.capped ? `${data.total.toLocaleString('en-US')}+` : data.total.toLocaleString('en-US')} ${data.total === 1 ? 'game' : 'games'}`;
      if (pager) pager.innerHTML = data.pages > 1 ? pagerHtml(data.page, data.pages) : '';
      (window as unknown as { pixuvoSyncFavs?: () => void }).pixuvoSyncFavs?.();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      grid.innerHTML = `<div class="empty-state" role="listitem"><strong>Could not load games</strong>Please check your connection and try again. <button type="button" class="link-btn" data-filter-retry>Retry</button></div>`;
    } finally {
      grid.classList.remove('loading-veil');
    }
  }
  function pagerHtml(page: number, pages: number): string {
    const b = (p: number, label: string, cur = false) =>
      cur ? `<li><span aria-current="page">${label}</span></li>` : `<li><a href="#" data-filter-page="${p}">${label}</a></li>`;
    const out: string[] = [];
    if (page > 1) out.push(b(page - 1, 'Previous'));
    for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) out.push(b(p, String(p), p === page));
    if (page < pages) out.push(b(page + 1, 'Next'));
    return `<nav aria-label="Filtered results pages"><ul class="pagination">${out.join('')}</ul></nav>`;
  }

  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    const s = readHash();
    delete s.page;
    if (t.name === 'sort') s.sort = t.value;
    else if (MULTI_EXCLUSIVE.includes(t.name as Key)) {
      // One value per group: checking another option replaces the previous one.
      if (t.checked) s[t.name as Key] = t.value;
      else delete s[t.name as Key];
    }
    writeHash(s);
  });
  document.addEventListener('click', (e) => {
    const el = e.target as Element;
    const rm = el.closest<HTMLElement>('[data-remove-filter]');
    if (rm) {
      const s = readHash();
      delete s[rm.dataset.removeFilter as Key];
      delete s.page;
      writeHash(s);
      return;
    }
    if (el.closest('[data-filter-clear]')) {
      writeHash({});
      return;
    }
    if (el.closest('[data-filter-retry]')) {
      apply();
      return;
    }
    const pg = el.closest<HTMLElement>('[data-filter-page]');
    if (pg) {
      e.preventDefault();
      const s = readHash();
      s.page = pg.dataset.filterPage!;
      writeHash(s);
      bar.scrollIntoView({ block: 'start' });
    }
  });
  window.addEventListener('hashchange', apply);
  if (location.hash.length > 1) apply();
}
