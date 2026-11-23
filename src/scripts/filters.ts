/**
 * "Find your game" — filter state lives in the URL fragment
 * (#q=car&sub=jigsaw,maze&theme=animals&players=2&sort=new), so it is shareable, survives
 * Back from a game page and creates no crawlable URLs. Inside a group options are OR,
 * between groups AND. The server-rendered grid and pager stay untouched while nothing is set.
 *
 * Option counts come from /data/facets.json (snapshot); options with fewer than
 * MIN games in this list are hidden, so a filter never promises an empty result.
 * Filtered results are paged with numbered links (#…&page=2); the desktop sidebar and the
 * phone bottom sheet are two views of the same groups and stay in sync.
 */
import { pageLang, tr } from './i18n';
import { cardHtml, esc, type ClientCard } from './cards';
import { track } from './analytics';

const MIN = 12;
const KEYS = ['q', 'sort', 'sub', 'theme', 'players', 'device', 'controls', 'style', 'mode', 'page'] as const;
type Key = (typeof KEYS)[number];
type State = Partial<Record<Key, string[]>>;
const SINGLE: Key[] = ['q', 'sort', 'device', 'mode', 'page'];
/** Not filters: no pill, no badge count. */
const META: Key[] = ['sort', 'page'];

interface Facets {
  sub: Array<{ slug: string; name: string; n: number }>;
  theme: Array<{ slug: string; n: number }>;
  players: Record<string, number>;
  device: number;
  style: Record<string, number>;
  controls: Record<string, number>;
}
interface FacetFile {
  facets: Record<string, Facets>;
  themes: Array<{ slug: string; name: string; emoji: string }>;
}
interface Opt { v: string; label: string; ico?: string | undefined; img?: string; n?: number | undefined }
interface Group { key: Key; legend: string; radio?: boolean; hint?: string; opts: Opt[] }

const LABELS: Record<string, string> = {
  'sort:featured': tr('c.sortBest'), 'sort:new': tr('c.sortNewest'), 'sort:az': tr('c.sortAz'), 'device:mobile': tr('c.mobile'), 'players:1': tr('c.p1'), 'players:2': tr('c.p2'),
  'mode:local': tr('c.sameDevice'), 'mode:online': tr('c.online'), 'style:2d': tr('c.style2d'), 'style:3d': tr('c.style3d'), 'style:pixel': tr('c.pixel'),
  'controls:keyboard': tr('c.keyboard'), 'controls:mouse': tr('c.mouse'), 'controls:touch': tr('c.touch'),
};
const NF = new Intl.NumberFormat(document.documentElement.lang || 'en'); // one formatter: toLocaleString builds a new one per call
const nf = (n: number) => NF.format(n);
const themeName = (slug: string, fallback: string) => { const v = tr(`theme.${slug}`); return v === `theme.${slug}` ? fallback : v; };
const syncFavs = () => (window as unknown as { pixuvoSyncFavs?: () => void }).pixuvoSyncFavs?.();

const bar = document.querySelector<HTMLElement>('[data-filters]');
const forms = [...document.querySelectorAll<HTMLFormElement>('[data-filter-form]')];
const gridEl = document.getElementById('game-grid');

if (bar && forms.length && gridEl) {
  const grid = gridEl;
  const pager = document.getElementById('game-pager');
  const groupBoxes = forms.map((f) => f.querySelector<HTMLElement>('[data-filter-groups]')!);
  let built = false;
  const category = bar.dataset.category ?? '';
  const total = Number(bar.dataset.total ?? '0');
  const subs = JSON.parse(bar.dataset.subs ?? '[]') as Array<{ slug: string; name: string }>;
  const catNames = JSON.parse(bar.dataset.catNames ?? '{}') as Record<string, string>;
  const count = bar.querySelector<HTMLElement>('[data-result-count]')!;
  const activeBox = bar.querySelector<HTMLElement>('[data-active-filters]')!;
  const badge = bar.querySelector<HTMLElement>('[data-filter-badge]')!;
  const sortLabel = bar.querySelector<HTMLElement>('[data-sort-label]');
  const showCount = document.querySelector<HTMLElement>('[data-show-count]');
  const search = bar.querySelector<HTMLFormElement>('[data-filter-search]');
  const qInput = search?.querySelector<HTMLInputElement>('input[name=q]') ?? null;
  const qClear = bar.querySelector<HTMLButtonElement>('[data-filter-qclear]');
  const originalGrid = grid.innerHTML;
  const originalPager = pager?.innerHTML ?? '';
  let facets: Facets | null = null;
  let themeMeta: FacetFile['themes'] = [];
  let ctrl: AbortController | null = null;

  // ── State <-> fragment ───────────────────────────────────────────────────
  const readHash = (): State => {
    const sp = new URLSearchParams(location.hash.slice(1));
    const out: State = {};
    for (const k of KEYS) {
      const v = sp.get(k);
      if (!v) continue;
      if (k === 'q') {
        const t = v.trim().slice(0, 60);
        if (t.length >= 2) out.q = [t];
        continue;
      }
      const vals = [...new Set(v.split(','))].filter((x) => /^[a-z0-9-]{1,30}$/.test(x)).slice(0, 5);
      if (vals.length) out[k] = SINGLE.includes(k) ? vals.slice(0, 1) : vals;
    }
    if (out.sort?.[0] === 'featured') delete out.sort;
    if (out.page && (!/^\d{1,3}$/.test(out.page[0]!) || out.page[0] === '1')) delete out.page;
    // #page=N alone is a plain listing page: the static site has no /page/N/ files (links are rewritten to #page=N)
    return out;
  };
  const writeHash = (s: State) => {
    // Analytics: which filters kids use, and what they search for inside a category.
    const before = readHash();
    for (const k of KEYS) {
      if (k === 'page') continue;
      const added = (s[k] ?? []).filter((v) => !(before[k] ?? []).includes(v));
      for (const v of added) track(k === 'q' ? 'search' : 'filter_use', k === 'q' ? { search_term: v.slice(0, 60) } : { filter_key: k, filter_value: v });
    }
    const parts: string[] = [];
    for (const k of KEYS) if (s[k]?.length) parts.push(`${k}=${k === 'q' ? encodeURIComponent(s[k]![0]!) : s[k]!.join(',')}`);
    history.replaceState(null, '', parts.length ? `#${parts.join('&')}` : location.pathname + location.search);
    apply();
  };
  const isFiltered = (s: State) => Object.keys(s).length > 0;
  const activeCount = (s: State) => KEYS.filter((k) => !META.includes(k)).reduce((n, k) => n + (s[k]?.length ?? 0), 0);

  // ── Sheet ────────────────────────────────────────────────────────────────
  function groups(): Group[] {
    const f = facets;
    const has = (n: number | undefined) => !f || (n ?? 0) >= MIN;
    const g: Group[] = [{ key: 'sort', legend: tr('c.sortBy'), radio: true, opts: [{ v: 'featured', label: tr('c.sortBest'), ico: '⭐' }, { v: 'new', label: tr('c.sortNewest'), ico: '🆕' }, { v: 'az', label: tr('c.sortAz'), ico: '🔤' }] }];
    const subOpts = (f?.sub ?? subs.map((x) => ({ ...x, n: undefined as number | undefined }))).map((x) => ({ v: x.slug, label: catNames[x.slug] ?? x.name, img: `/icons/cat/${x.slug}.webp`, n: x.n })); // facets.json names are English; data-subs carries the page language
    if (subOpts.length) g.push({ key: 'sub', legend: tr('c.type'), opts: subOpts });
    if (f) g.push({ key: 'theme', legend: tr('c.theme'), opts: f.theme.map((t) => { const m = themeMeta.find((x) => x.slug === t.slug); return { v: t.slug, label: themeName(t.slug, m?.name ?? t.slug), ico: m?.emoji, n: t.n }; }) });
    g.push({ key: 'players', legend: tr('c.playersLegend'), opts: [{ v: '1', label: tr('c.p1'), ico: '👤', n: f?.players['1'] }, { v: '2', label: tr('c.p2'), ico: '👥', n: f?.players['2'] }] });
    g.push({ key: 'device', legend: tr('c.device'), hint: tr('c.deviceHint'), opts: [{ v: 'mobile', label: tr('c.mobile'), ico: '📱', n: f?.device }] });
    g.push({ key: 'controls', legend: tr('c.controls'), hint: tr('c.controlsHint'), opts: [{ v: 'keyboard', label: tr('c.keyboard'), ico: '⌨️', n: f?.controls.keyboard }, { v: 'mouse', label: tr('c.mouse'), ico: '🖱️', n: f?.controls.mouse }, { v: 'touch', label: tr('c.touch'), ico: '👆', n: f?.controls.touch }] });
    g.push({ key: 'style', legend: tr('c.look'), opts: [{ v: '2d', label: tr('c.style2d'), ico: '🟦', n: f?.style['2d'] }, { v: '3d', label: tr('c.style3d'), ico: '🧊', n: f?.style['3d'] }, { v: 'pixel', label: tr('c.pixel'), ico: '👾', n: f?.style.pixel }] });
    const s = readHash();
    // Hide options without enough games, but never one that is selected (it must stay removable).
    return g.map((x) => ({ ...x, opts: x.radio ? x.opts : x.opts.filter((o) => has(o.n) || s[x.key]?.includes(o.v)) })).filter((x) => x.opts.length > 0);
  }
  function renderGroups() {
    built = true;
    const gs = groups();
    groupBoxes.forEach((box) => (box.innerHTML = gs
      .map((g, gi) => `<fieldset><legend>${esc(g.legend)}</legend>${g.hint ? `<p class="hint">${esc(g.hint)}</p>` : ''}<div class="opt-row">${g.opts
        .map((o, i) => `<label class="opt"><input type="${g.radio ? 'radio' : 'checkbox'}" name="${g.key}" value="${esc(o.v)}"${gi === 0 && i === 0 && box.closest('[data-drawer]') ? ' data-autofocus' : ''}><span>${o.img ? `<img src="${esc(o.img)}" alt="" width="24" height="24" loading="lazy">` : o.ico ? `<i aria-hidden="true">${o.ico}</i>` : ''}${esc(o.label)}${o.n !== undefined ? `<small>${nf(o.n)}</small>` : ''}</span></label>`)
        .join('')}</div></fieldset>`)
      .join('')));
  }
  const label = (k: Key, v: string) =>
    k === 'q' ? `“${v}”` : k === 'sub' ? catNames[v] ?? subs.find((x) => x.slug === v)?.name ?? v : k === 'theme' ? themeName(v, themeMeta.find((x) => x.slug === v)?.name ?? v) : LABELS[`${k}:${v}`] ?? v;

  function syncUI(s: State) {
    forms.forEach((f) => f.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
      i.checked = i.name === 'sort' ? (s.sort?.[0] ?? 'featured') === i.value : !!s[i.name as Key]?.includes(i.value);
    }));
    const n = activeCount(s);
    badge.textContent = String(n);
    badge.hidden = n === 0;
    if (sortLabel) sortLabel.textContent = LABELS[`sort:${s.sort?.[0] ?? 'featured'}`] ?? tr('c.sortBest');
    bar!.querySelectorAll<HTMLElement>('[data-quick]').forEach((c) => c.setAttribute('aria-pressed', String(!!s[c.dataset.quick as Key]?.includes(c.dataset.value!))));
    if (qInput && document.activeElement !== qInput) qInput.value = s.q?.[0] ?? '';
    if (qClear) qClear.hidden = !(qInput?.value);
    const pills = KEYS.filter((k) => !META.includes(k)).flatMap((k) => (s[k] ?? []).map((v) => [k, v] as const));
    activeBox.innerHTML = pills
      .map(([k, v]) => `<button type="button" class="filter-pill" data-remove-filter="${k}" data-value="${esc(v)}">${esc(label(k, v))}<span aria-hidden="true">×</span><span class="sr-only"> — ${esc(tr('c.removeFilter'))}</span></button>`)
      .join('') + (pills.length ? `<button type="button" class="link-btn" data-filter-clear>${esc(tr('c.clearFilters'))}</button>` : '');
  }
  function pagerHtml(page: number, pages: number): string {
    const b = (p: number, text: string, cur = false) =>
      cur ? `<li><span aria-current="page">${text}</span></li>` : `<li><a href="#" data-filter-page="${p}"${text === String(p) ? '' : ` aria-label="${esc(text === '‹' ? tr('c.previous') : tr('c.next'))}"`}>${text}</a></li>`;
    const nums = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages));
    const out: string[] = [];
    if (page > 1) out.push(b(page - 1, '‹'));
    let last = 0;
    for (const p of [...nums].sort((a, z) => a - z)) {
      if (p - last > 1) out.push('<li><span class="gap" aria-hidden="true">…</span></li>');
      out.push(b(p, String(p), p === page));
      last = p;
    }
    if (page < pages) out.push(b(page + 1, '›'));
    return `<nav aria-label="${esc(tr('c.filteredPages'))}"><ul class="pagination">${out.join('')}</ul></nav>`;
  }

  // ── Fetching ─────────────────────────────────────────────────────────────
  const query = (s: State, page: number) => {
    const qs = new URLSearchParams();
    if (category) qs.set('cat', category);
    for (const k of KEYS) if (s[k]?.length) qs.set(k, s[k]!.join(','));
    if (!category && !s.sort && activeCount(s) === 0) qs.set('sort', 'az'); // /games/#page=N = the A–Z directory order
    qs.delete('page');
    if (page > 1) qs.set('page', String(page));
    if (pageLang() !== 'en') qs.set('lang', pageLang());
    return qs;
  };
  type Res = { items: ClientCard[]; total: number; capped: boolean; page: number; pages: number };
  async function load(s: State, page: number, signal?: AbortSignal): Promise<Res> {
    const res = await fetch(`/api/games/?${query(s, page)}`, { signal: signal ?? null, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Res;
  }
  const countText = (d: Res) => (d.capped ? tr('c.gamesCapped', { n: d.total }) : tr('c.games', { n: d.total }));
  const showText = (d: Res) => (d.capped ? tr('c.showCapped', { n: d.total }) : tr('c.showGames', { n: d.total }));

  async function apply() {
    const s = readHash();
    syncUI(s);
    if (!isFiltered(s)) {
      ctrl?.abort();
      grid.innerHTML = originalGrid;
      if (pager) pager.innerHTML = originalPager;
      count.textContent = tr('c.games', { n: total });
      if (showCount) showCount.textContent = tr('c.showGames', { n: total });
      syncFavs();
      return;
    }
    ctrl?.abort();
    ctrl = new AbortController();
    grid.classList.add('loading-veil');
    try {
      const data = await load(s, Number(s.page?.[0] ?? '1'), ctrl.signal);
      grid.innerHTML = data.items.length
        ? data.items.map((g) => cardHtml(g)).join('')
        : `<div class="empty-state" role="listitem"><span class="empty-ico" aria-hidden="true">🔍</span><strong>${esc(tr('c.emptyTitle'))}</strong>${esc(tr('c.emptyText'))} <button type="button" class="link-btn" data-filter-clear>${esc(tr('c.clearFilters'))}</button></div>`;
      count.textContent = countText(data);
      if (showCount) showCount.textContent = data.total ? showText(data) : tr('c.noGamesChange');
      if (pager) pager.innerHTML = data.pages > 1 ? pagerHtml(data.page, data.pages) : '';
      syncFavs();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      grid.innerHTML = `<div class="empty-state" role="listitem"><strong>${esc(tr('c.loadError'))}</strong>${esc(tr('c.loadErrorText'))} <button type="button" class="link-btn" data-filter-retry>${esc(tr('c.retry'))}</button></div>`;
    } finally {
      grid.classList.remove('loading-veil');
    }
  }

  // ── Events ───────────────────────────────────────────────────────────────
  const onChange = (e: Event) => {
    const t = e.target as HTMLInputElement;
    const k = t.name as Key;
    const s = readHash();
    delete s.page;
    if (k === 'sort') s.sort = [t.value];
    else if (SINGLE.includes(k)) {
      if (t.checked) s[k] = [t.value];
      else delete s[k];
    } else {
      const cur = new Set(s[k] ?? []);
      if (t.checked) cur.add(t.value);
      else cur.delete(t.value);
      if (cur.size) s[k] = [...cur].slice(0, 5);
      else delete s[k];
    }
    writeHash(s);
  };
  forms.forEach((f) => f.addEventListener('change', onChange));
  let qTimer = 0;
  const setQ = (v: string) => {
    const s = readHash();
    delete s.page;
    const t = v.trim();
    if (t.length >= 2) s.q = [t.slice(0, 60)];
    else delete s.q;
    if ((s.q?.[0] ?? '') !== (readHash().q?.[0] ?? '')) writeHash(s);
  };
  qInput?.addEventListener('input', () => {
    if (qClear) qClear.hidden = !qInput.value;
    clearTimeout(qTimer);
    qTimer = window.setTimeout(() => setQ(qInput.value), 400);
  });
  search?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(qTimer);
    setQ(qInput?.value ?? '');
    qInput?.blur(); // closes the phone keyboard so the results are visible
  });
  qClear?.addEventListener('click', () => {
    if (qInput) qInput.value = '';
    setQ('');
    qInput?.focus();
  });
  document.addEventListener('click', (e) => {
    const el = e.target as Element;
    const quick = el.closest<HTMLElement>('[data-quick]');
    if (quick && bar.contains(quick)) {
      e.preventDefault();
      const k = quick.dataset.quick as Key;
      const v = quick.dataset.value!;
      const s = readHash();
      delete s.page;
      const cur = new Set(s[k] ?? []);
      if (cur.has(v)) cur.delete(v);
      else {
        if (SINGLE.includes(k)) cur.clear();
        cur.add(v);
      }
      if (cur.size) s[k] = [...cur].slice(0, 5);
      else delete s[k];
      writeHash(s);
      return;
    }
    const rm = el.closest<HTMLElement>('[data-remove-filter]');
    if (rm) {
      const s = readHash();
      const k = rm.dataset.removeFilter as Key;
      delete s.page;
      s[k] = (s[k] ?? []).filter((x) => x !== rm.dataset.value);
      if (!s[k]!.length) delete s[k];
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
      s.page = [pg.dataset.filterPage!];
      writeHash(s);
      bar.scrollIntoView({ block: 'start' });
    }
  });
  window.addEventListener('hashchange', apply);

  // Facet counts (static file, cached); the sheet works without them, just without counts.
  fetch('/data/facets.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((raw: unknown) => {
      const d = raw as FacetFile | null;
      if (!d) return;
      themeMeta = d.themes ?? [];
      facets = d.facets[category || '__all'] ?? null;
      if (facets) {
        bar.querySelector<HTMLElement>('[data-quick="players"]')!.hidden = (facets.players['2'] ?? 0) < MIN;
        bar.querySelector<HTMLElement>('[data-quick="device"]')!.hidden = facets.device < MIN;
      }
      renderGroups();
      syncUI(readHash());
    })
    .catch(() => {})
    .finally(() => (bar.dataset.facets = 'ready'));
  // Desktop sidebar is on screen: build it right away. The phone sheet is off-screen until opened: build it when idle.
  if (document.querySelector('.list-side') && matchMedia('(min-width: 1180px)').matches) {
    renderGroups();
    syncUI(readHash());
  }
  (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200)))(() => {
    if (!built) {
      renderGroups();
      syncUI(readHash());
    }
  });
  // Opened before the idle callback ran: build it now (pointerdown/keydown fire before the drawer's click handler).
  for (const ev of ['pointerdown', 'keydown'] as const)
    bar.querySelectorAll('[data-drawer-open="filter-drawer"]').forEach((b) => b.addEventListener(ev, () => {
      if (!built) {
        renderGroups();
        syncUI(readHash());
      }
    }));
  bar.querySelectorAll<HTMLElement>('a[data-quick]').forEach((a) => a.setAttribute('role', 'button'));
  if (showCount) showCount.textContent = tr('c.showGames', { n: total });
  if (location.hash.length > 1) apply();
}
