/**
 * Local-only storage for favorites and recently played. No account, no server
 * copy, no fingerprinting. Survives blocked/full storage (falls back to memory).
 */
export interface StoredGame {
  id: number;
  slug: string;
  title: string;
  thumb: string;
  at: number;
  /** Primary category slug (recommendations); optional for older entries. */
  cat?: string;
  /** How many days this game was played on this device (counted once per day). Stays in this browser only. */
  n?: number;
}

const KEYS = { fav: 'pixuvo:favorites', recent: 'pixuvo:recent' } as const;
const LIMIT = { fav: 200, recent: 60 } as const;
const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const k = '__pixuvo_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

function read(kind: keyof typeof KEYS): StoredGame[] {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(KEYS[kind]) ?? memory.get(KEYS[kind]) ?? null;
  } catch {
    raw = memory.get(KEYS[kind]) ?? null;
  }
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is StoredGame => !!x && typeof x === 'object' && Number.isInteger((x as StoredGame).id) && typeof (x as StoredGame).slug === 'string' && /^[a-z0-9-]{1,90}$/.test((x as StoredGame).slug))
      .map((x) => ({ id: x.id, slug: x.slug, title: String(x.title ?? '').slice(0, 120), thumb: safeThumb(x.thumb), at: Number(x.at) || 0, ...(typeof x.cat === 'string' && /^[a-z0-9-]{1,40}$/.test(x.cat) ? { cat: x.cat } : {}), ...(Number.isInteger(x.n) && x.n! > 0 ? { n: Math.min(x.n!, 9999) } : {}) }))
      .slice(0, LIMIT[kind]);
  } catch {
    return [];
  }
}

function safeThumb(t: unknown): string {
  if (typeof t !== 'string') return '';
  try {
    const u = new URL(t);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

function write(kind: keyof typeof KEYS, list: StoredGame[]): boolean {
  const raw = JSON.stringify(list.slice(0, LIMIT[kind]));
  memory.set(KEYS[kind], raw);
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(KEYS[kind], raw);
    return true;
  } catch {
    return false;
  } finally {
    window.dispatchEvent(new CustomEvent('pixuvo:store', { detail: { kind } }));
  }
}

export const store = {
  available: () => storage() !== null,
  favorites: () => read('fav'),
  recent: () => read('recent'),
  isFavorite: (id: number) => read('fav').some((g) => g.id === id),
  toggleFavorite(g: Omit<StoredGame, 'at'>): boolean {
    const list = read('fav');
    const idx = list.findIndex((x) => x.id === g.id);
    if (idx >= 0) {
      list.splice(idx, 1);
      write('fav', list);
      return false;
    }
    list.unshift({ ...g, at: Date.now() });
    write('fav', list);
    return true;
  },
  removeFavorite(id: number) {
    write('fav', read('fav').filter((x) => x.id !== id));
  },
  addRecent(g: Omit<StoredGame, 'at' | 'n'>) {
    const all = read('recent');
    const prev = all.find((x) => x.id === g.id);
    const sameDay = prev && new Date(prev.at).toDateString() === new Date().toDateString();
    const n = (prev?.n ?? (prev ? 1 : 0)) + (sameDay ? 0 : 1);
    const list = all.filter((x) => x.id !== g.id);
    list.unshift({ ...g, at: Date.now(), n: Math.max(1, n) });
    write('recent', list);
  },
  removeRecent(id: number) {
    write('recent', read('recent').filter((x) => x.id !== id));
  },
  clearRecent() {
    write('recent', []);
  },
  clearFavorites() {
    write('fav', []);
  },
  /** Fires on changes in this tab and in other tabs. */
  subscribe(fn: () => void) {
    window.addEventListener('pixuvo:store', fn);
    window.addEventListener('storage', (e) => {
      if (e.key === null || e.key === KEYS.fav || e.key === KEYS.recent) fn();
    });
  },
};
