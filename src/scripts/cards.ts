/** Client-side card renderer — mirrors src/components/GameCard.astro. Always escapes. */
import { lp, tr } from './i18n';
export interface ClientCard {
  id: number;
  slug: string;
  title: string;
  thumb: string;
  cat?: string | null;
  players?: number | null;
  plays7d?: number;
  isNew?: boolean;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const HEART = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';

const PLAY = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>';

export function cardHtml(g: ClientCard, opts: { removable?: string; note?: string } = {}): string {
  const slug = /^[a-z0-9-]{1,90}$/.test(g.slug) ? g.slug : '';
  const thumb = /^https:\/\//.test(g.thumb) ? g.thumb : '';
  const meta = [g.cat, g.players && g.players >= 2 ? tr('c.players', { n: g.players }) : null].filter(Boolean).join(' · ');
  const action = opts.removable
    ? `<button type="button" class="fav-btn" data-remove="${g.id}" aria-label="${esc(tr('c.removeFrom', { title: g.title, list: opts.removable }))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>`
    : `<button type="button" class="fav-btn" data-fav="${g.id}" data-slug="${esc(slug)}" data-title="${esc(g.title)}" data-thumb="${esc(thumb)}" aria-pressed="false" aria-label="${esc(tr('c.addFav', { title: g.title }))}">${HEART}</button>`;
  return `<div role="listitem"><article class="card" data-game-id="${g.id}"><a class="card-link" href="${lp(`/games/${slug}/`)}"><span class="card-media"><img class="card-thumb" src="${esc(thumb)}" alt="" width="320" height="240" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="card-play" aria-hidden="true">${PLAY}</span>${opts.note ? `<span class="card-badge card-badge-soft">${esc(opts.note)}</span>` : (g.plays7d ?? 0) >= 25 ? `<span class="card-badge">${esc(tr('c.hot'))}</span>` : g.isNew ? `<span class="card-badge">${esc(tr('c.new'))}</span>` : ''}</span><span class="card-body"><span class="card-title">${esc(g.title)}</span>${meta ? `<span class="card-meta">${esc(meta)}</span>` : ''}</span></a>${action}</article></div>`;
}
