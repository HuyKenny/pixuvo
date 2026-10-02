import { track } from './analytics';
import { store } from './store';

function sync(root: ParentNode = document) {
  const favs = new Set(store.favorites().map((g) => g.id));
  root.querySelectorAll<HTMLButtonElement>('button[data-fav]').forEach((b) => {
    const on = favs.has(Number(b.dataset.fav));
    b.setAttribute('aria-pressed', String(on));
    const title = b.dataset.title ?? 'game';
    if (b.dataset.favLabel !== 'static') b.setAttribute('aria-label', on ? `Remove ${title} from favorites` : `Add ${title} to favorites`);
  });
}

document.addEventListener('click', (e) => {
  const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('button[data-fav]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const id = Number(btn.dataset.fav);
  if (!Number.isInteger(id)) return;
  const added = store.toggleFavorite({ id, slug: btn.dataset.slug ?? '', title: btn.dataset.title ?? '', thumb: btn.dataset.thumb ?? '' });
  if (added) track('favorite_add', { game_slug: btn.dataset.slug ?? '' });
  sync();
});

store.subscribe(() => sync());
sync();
// Grids rendered later (filters, recently played) call this again.
(window as unknown as { pixuvoSyncFavs: typeof sync }).pixuvoSyncFavs = sync;
