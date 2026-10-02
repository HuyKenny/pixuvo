/**
 * "Find your game" — filter state lives in the URL fragment
 * (#q=car&sub=jigsaw,maze&theme=animals&players=2&sort=new), so it is shareable, survives
 * Back from a game page and creates no crawlable URLs. Inside a group options are OR,
 * between groups AND. The server-rendered grid and pager stay untouched while nothing is set.
 *
 * Option counts come from /data/facets.json (snapshot); options with fewer than
 * MIN games in this list are hidden, so a filter never promises an empty result.
 * "Show more games" appends the next page in place (unfiltered and filtered).
 */
import { cardHtml, esc, type ClientCard } from './cards';

const MIN = 12;
const KEYS = ['q', 'sort', 'sub', 'theme', 'players', 'device', 'controls', 'style', 'mode'] as const;
type Key = (typeof KEYS)[number];
type State = Partial<Record<Key, string[]>>;
const SINGLE: Key[] = ['q', 'sort', 'device', 'mode'];

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
  'sort:featured': 'Best', 'sort:new': 'Newest', 'sort:az': 'A–Z', 'device:mobile': 'Works on mobile', 'players:1': '1 player', 'players:2': '2+ players',
  'mode:local': 'Same device', 'mode:online': 'Online', 'style:2d': '2D', 'style:3d': '3D', 'style:pixel': 'Pixel art',
  'controls:keyboard': 'Keyboard', 'controls:mouse': 'Mouse', 'controls:touch': 'Touch',
};
const NF = new Intl.NumberFormat('en-US'); // one formatter: toLocaleString builds a new one per call
const nf = (n: number) => NF.format(n);
const syncFavs = () => (window as unknown as { pixuvoSyncFavs?: () => void }).pixuvoSyncFavs?.();

const bar = document.querySelector<HTMLElement>('[data-filters]');
const form = document.querySelector<HTMLFormElement>('[data-filter-form]');
const gridEl = document.getElementById('game-grid');

if (bar && form && gridEl) {
  const grid = gridEl;
  const pager = document.getElementById('game-pager');
  const more = document.querySelector<HTMLButtonElement>('[data-show-more]');
  const groupsBox = form.querySelector<HTMLElement>('[data-filter-groups]')!;
  const category = bar.dataset.category ?? '';
  const total = Number(bar.dataset.total ?? '0');
  const subs = JSON.parse(bar.dataset.subs ?? '[]') as Array<{ slug: string; name: string }>;
  const count = bar.querySelector<HTMLElement>('[data-result-count]')!;
  const activeBox = bar.querySelector<HTMLElement>('[data-active-filters]')!;
  const badge = bar.querySelector<HTMLElement>('[data-filter-badge]')!;
  const sortLabel = bar.querySelector<HTMLElement>('[data-sort-label]');
  const showCount = form.querySelector<HTMLElement>('[data-show-count]');
  const search = bar.querySelector<HTMLFormElement>('[data-filter-search]');
  const qInput = search?.querySelector<HTMLInputElement>('input[name=q]') ?? null;
  const qClear = bar.querySelector<HTMLButtonElement>('[data-filter-qclear]');
  const originalGrid = grid.innerHTML;
  const originalPager = pager?.innerHTML ?? '';
  const serverPage = Number(more?.dataset.page ?? '1');
  const serverPages = Number(more?.dataset.pages ?? '1');
  /** Pages already on screen: unfiltered starts at the server page, filtered at 1. */
  let view = { filtered: false, page: serverPage, pages: serverPages };
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
    return out;
  };
  const writeHash = (s: State) => {
    const parts: string[] = [];
    for (const k of KEYS) if (s[k]?.length) parts.push(`${k}=${k === 'q' ? encodeURIComponent(s[k]![0]!) : s[k]!.join(',')}`);
    history.replaceState(null, '', parts.length ? `#${parts.join('&')}` : location.pathname + location.search);
    apply();
  };
  const isFiltered = (s: State) => Object.keys(s).length > 0;
  const activeCount = (s: State) => KEYS.filter((k) => k !== 'sort').reduce((n, k) => n + (s[k]?.length ?? 0), 0);

  // ── Sheet ────────────────────────────────────────────────────────────────
  function groups(): Group[] {
    const f = facets;
    const has = (n: number | undefined) => !f || (n ?? 0) >= MIN;
    const g: Group[] = [{ key: 'sort', legend: 'Sort by', radio: true, opts: [{ v: 'featured', label: 'Best', ico: '⭐' }, { v: 'new', label: 'Newest', ico: '🆕' }, { v: 'az', label: 'A–Z', ico: '🔤' }] }];
    const subOpts = (f?.sub ?? subs.map((x) => ({ ...x, n: undefined as number | undefined }))).map((x) => ({ v: x.slug, label: x.name, img: `/icons/cat/${x.slug}.webp`, n: x.n }));
    if (subOpts.length) g.push({ key: 'sub', legend: 'Type', opts: subOpts });
    if (f) g.push({ key: 'theme', legend: 'Theme', opts: f.theme.map((t) => { const m = themeMeta.find((x) => x.slug === t.slug); return { v: t.slug, label: m?.name ?? t.slug, ico: m?.emoji, n: t.n }; }) });
    g.push({ key: 'players', legend: 'Players', opts: [{ v: '1', label: '1 player', ico: '👤', n: f?.players['1'] }, { v: '2', label: '2+ players', ico: '👥', n: f?.players['2'] }] });
    g.push({ key: 'device', legend: 'Device', hint: 'As declared by the game’s publisher.', opts: [{ v: 'mobile', label: 'Works on mobile', ico: '📱', n: f?.device }] });
    g.push({ key: 'controls', legend: 'Controls', hint: 'From the game’s own instructions — not a guarantee.', opts: [{ v: 'keyboard', label: 'Keyboard', ico: '⌨️', n: f?.controls.keyboard }, { v: 'mouse', label: 'Mouse', ico: '🖱️', n: f?.controls.mouse }, { v: 'touch', label: 'Touch', ico: '👆', n: f?.controls.touch }] });
    g.push({ key: 'style', legend: 'Look', opts: [{ v: '2d', label: '2D', ico: '🟦', n: f?.style['2d'] }, { v: '3d', label: '3D', ico: '🧊', n: f?.style['3d'] }, { v: 'pixel', label: 'Pixel art', ico: '👾', n: f?.style.pixel }] });
    const s = readHash();
    // Hide options without enough games, but never one that is selected (it must stay removable).
    return g.map((x) => ({ ...x, opts: x.radio ? x.opts : x.opts.filter((o) => has(o.n) || s[x.key]?.includes(o.v)) })).filter((x) => x.opts.length > 0);
  }
  function renderGroups() {
    groupsBox.innerHTML = groups()
      .map((g, gi) => `<fieldset><legend>${esc(g.legend)}</legend>${g.hint ? `<p class="hint">${esc(g.hint)}</p>` : ''}<div class="opt-row">${g.opts
        .map((o, i) => `<label class="opt"><input type="${g.radio ? 'radio' : 'checkbox'}" name="${g.key}" value="${esc(o.v)}"${gi === 0 && i === 0 ? ' data-autofocus' : ''}><span>${o.img ? `<img src="${esc(o.img)}" alt="" width="24" height="24" loading="lazy">` : o.ico ? `<i aria-hidden="true">${o.ico}</i>` : ''}${esc(o.label)}${o.n !== undefined ? `<small>${nf(o.n)}</small>` : ''}</span></label>`)
        .join('')}</div></fieldset>`)
      .join('');
  }
  const label = (k: Key, v: string) =>
    k === 'q' ? `“${v}”` : k === 'sub' ? subs.find((x) => x.slug === v)?.name ?? v : k === 'theme' ? themeMeta.find((x) => x.slug === v)?.name ?? v : LABELS[`${k}:${v}`] ?? v;

  function syncUI(s: State) {
    form!.querySelectorAll<HTMLInputElement>('input').forEach((i) => {
      i.checked = i.name === 'sort' ? (s.sort?.[0] ?? 'featured') === i.value : !!s[i.name as Key]?.includes(i.value);
    });
    const n = activeCount(s);
    badge.textContent = String(n);
    badge.hidden = n === 0;
    if (sortLabel) sortLabel.textContent = LABELS[`sort:${s.sort?.[0] ?? 'featured'}`] ?? 'Best';
    bar!.querySelectorAll<HTMLElement>('[data-quick]').forEach((c) => c.setAttribute('aria-pressed', String(!!s[c.dataset.quick as Key]?.includes(c.dataset.value!))));
    if (qInput && document.activeElement !== qInput) qInput.value = s.q?.[0] ?? '';
    if (qClear) qClear.hidden = !(qInput?.value);
    const pills = KEYS.filter((k) => k !== 'sort').flatMap((k) => (s[k] ?? []).map((v) => [k, v] as const));
    activeBox.innerHTML = pills
      .map(([k, v]) => `<button type="button" class="filter-pill" data-remove-filter="${k}" data-value="${esc(v)}">${esc(label(k, v))}<span aria-hidden="true">×</span><span class="sr-only"> — remove filter</span></button>`)
      .join('') + (pills.length ? '<button type="button" class="link-btn" data-filter-clear>Clear all</button>' : '');
  }
  function setMore() {
    if (!more) return;
    more.hidden = view.page >= view.pages;
    more.disabled = false;
  }

  // ── Fetching ─────────────────────────────────────────────────────────────
  const query = (s: State, page: number) => {
    const qs = new URLSearchParams();
    if (category) qs.set('cat', category);
    for (const k of KEYS) if (s[k]?.length) qs.set(k, s[k]!.join(','));
    // Unfiltered /games/ lists newest first.
    if (!category && !s.sort && !isFiltered(s)) qs.set('sort', 'new');
    if (page > 1) qs.set('page', String(page));
    return qs;
  };
  type Res = { items: ClientCard[]; total: number; capped: boolean; page: number; pages: number };
  async function load(s: State, page: number, signal?: AbortSignal): Promise<Res> {
    const res = await fetch(`/api/games/?${query(s, page)}`, { signal: signal ?? null, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Res;
  }
  const countText = (d: Res) => `${d.capped ? `${nf(d.total)}+` : nf(d.total)} ${d.total === 1 ? 'game' : 'games'}`;

  async function apply() {
    const s = readHash();
    syncUI(s);
    if (!isFiltered(s)) {
      ctrl?.abort();
      grid.innerHTML = originalGrid;
      if (pager) pager.innerHTML = originalPager;
      if (pager) pager.hidden = false;
      count.textContent = `${nf(total)} games`;
      if (showCount) showCount.textContent = `Show ${nf(total)} games`;
      view = { filtered: false, page: serverPage, pages: serverPages };
      setMore();
      syncFavs();
      return;
    }
    ctrl?.abort();
    ctrl = new AbortController();
    grid.classList.add('loading-veil');
    try {
      const data = await load(s, 1, ctrl.signal);
      grid.innerHTML = data.items.length
        ? data.items.map((g) => cardHtml(g)).join('')
        : `<div class="empty-state" role="listitem"><span class="empty-ico" aria-hidden="true">🔍</span><strong>No games match all of these</strong>Remove one of the filters above, or <button type="button" class="link-btn" data-filter-clear>clear all filters</button>.</div>`;
      count.textContent = countText(data);
      if (showCount) showCount.textContent = data.total ? `Show ${countText(data)}` : 'No games — change filters';
      if (pager) pager.hidden = true;
      view = { filtered: true, page: 1, pages: data.pages };
      setMore();
      syncFavs();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      grid.innerHTML = `<div class="empty-state" role="listitem"><strong>Could not load games</strong>Please check your connection and try again. <button type="button" class="link-btn" data-filter-retry>Retry</button></div>`;
    } finally {
      grid.classList.remove('loading-veil');
    }
  }

  async function showMore(): Promise<boolean> {
    if (!more || view.page >= view.pages) return false;
    more.disabled = true;
    const label0 = more.textContent;
    more.textContent = 'Loading…';
    try {
      const next = view.page + 1;
      const data = await load(readHash(), next);
      const seen = new Set([...grid.querySelectorAll<HTMLElement>('[data-game-id]')].map((x) => x.dataset.gameId));
      grid.insertAdjacentHTML('beforeend', data.items.filter((g) => !seen.has(String(g.id))).map((g) => cardHtml(g)).join(''));
      view.page = next;
      view.pages = Math.min(view.pages, data.pages || view.pages);
      if (!data.items.length) view.pages = view.page;
      syncFavs();
      return true;
    } catch {
      return false;
    } finally {
      more.textContent = label0;
      setMore();
    }
  }

  // Back from a game: re-add the pages that were shown with "Show more" and return to the same spot.
  const moreKey = () => `pixuvo:more:${location.pathname}${location.hash}`;
  const remember = () => {
    try {
      const extra = view.page - (view.filtered ? 1 : serverPage);
      if (extra > 0) sessionStorage.setItem(moreKey(), JSON.stringify({ extra, y: Math.round(scrollY) }));
      else sessionStorage.removeItem(moreKey());
    } catch {
      /* ignore */
    }
  };
  async function restore() {
    let saved: { extra: number; y: number } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(moreKey()) ?? 'null');
    } catch {
      saved = null;
    }
    if (!saved || !(saved.extra > 0)) return;
    for (let i = 0; i < Math.min(saved.extra, 10); i++) if (!(await showMore())) break;
    scrollTo({ top: saved.y, behavior: 'instant' as ScrollBehavior });
  }

  // ── Events ───────────────────────────────────────────────────────────────
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    const k = t.name as Key;
    const s = readHash();
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
  });
  let qTimer = 0;
  const setQ = (v: string) => {
    const s = readHash();
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
    if (el.closest('[data-show-more]')) {
      showMore();
      return;
    }
    if (el.closest('#game-grid a.card-link')) remember();
  });
  window.addEventListener('pagehide', remember);
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
  // The sheet is off-screen until opened: build it when the browser is idle.
  (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200)))(() => {
    if (!groupsBox.childElementCount) renderGroups();
  });
  // Opened before the idle callback ran: build it now (pointerdown/keydown fire before the drawer's click handler).
  for (const ev of ['pointerdown', 'keydown'] as const)
    bar.querySelectorAll('[data-drawer-open="filter-drawer"]').forEach((b) => b.addEventListener(ev, () => {
      if (!groupsBox.childElementCount) {
        renderGroups();
        syncUI(readHash());
      }
    }));
  setMore();
  bar.querySelectorAll<HTMLElement>('a[data-quick]').forEach((a) => a.setAttribute('role', 'button'));
  if (showCount) showCount.textContent = `Show ${nf(total)} games`;
  if (location.hash.length > 1) apply().then(restore);
  else restore();
}
