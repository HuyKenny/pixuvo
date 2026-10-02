import { describe, expect, it } from 'vitest';
import { gamemonetize } from '../../scripts/import/adapters/gamemonetize.ts';
import { gamepix } from '../../scripts/import/adapters/gamepix.ts';
import { ADAPTERS } from '../../scripts/import/adapters/index.ts';
import { gmItem } from '../helpers.ts';

describe('adapters', () => {
  it('parses a GameMonetize record and derives declared attributes', () => {
    const r = gamemonetize.parse(gmItem(7, { tags: 'Car, 2 Player, Mobile, 3D', description: '<p>Fast <b>cars</b></p>' }), {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item).toMatchObject({ providerGameId: '7', description: 'Fast cars', playersMax: 2, mobileFriendly: 1, visualStyle: '3d', width: 800 });
  });
  it('rejects GameMonetize records with foreign hosts', () => {
    expect(gamemonetize.parse(gmItem(7, { url: 'https://example.com/game/' }), {}).ok).toBe(false);
    expect(gamemonetize.parse(gmItem(7, { thumb: 'https://img.example.com/a.jpg' }), {}).ok).toBe(false);
  });
  it('requires our GamePix sid in the embed URL', () => {
    const base = { id: 'AB12', title: 'T Game', category: 'match-3', orientation: 'portrait', quality_score: 0.5, width: 600, height: 800, banner_image: 'https://img.gamepix.com/a.png', url: 'https://play.gamepix.com/t/embed?sid=M7X08' };
    const ok = gamepix.parse(base, { GAMEPIX_SID: 'M7X08' });
    expect(ok.ok && ok.item.labels).toEqual(['match 3']);
    expect(gamepix.parse({ ...base, url: 'https://play.gamepix.com/t/embed?sid=OTHER' }, { GAMEPIX_SID: 'M7X08' }).ok).toBe(false);
  });
  it('refuses a GamePix next_url that changes the sid', async () => {
    const pages = gamepix.pages({ startPage: 1, config: { GAMEPIX_SID: 'M7X08' }, fetchJson: async () => ({ items: [], next_url: 'https://feeds.gamepix.com/v2/json?sid=EVIL&page=2' }) });
    await expect(pages.next()).rejects.toThrow(/sid/);
  });
  it('parses a Playgama record, appends our clid and skips foreign-domain games', async () => {
    const { playgama } = await import('../../scripts/import/adapters/playgama.ts');
    const cfg = { PLAYGAMA_CLID: 'p_32f1a219-f53f-4b7c-ba4c-b2715b71d41a' };
    const base = { id: '97426', title: 'Piece of Cake', description: 'Merge <b>cakes</b>.', howToPlayText: 'Drag items.', gameURL: 'https://playgama.com/export/game/piece-of-cake',
      genres: ['puzzle', 'cooking'], tags: ['relaxing-games', 'android-games'], images: ['https://static.playgama.com/p-img/x/big_preview/a?width=448'],
      mobileReady: ['For Android', 'For Desktop'], screenOrientation: { horizontal: true, vertical: false }, inGamePurchases: 'Yes' };
    const r = playgama.parse(base, cfg);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new URL(r.item.embedUrl).searchParams.get('clid')).toBe(cfg.PLAYGAMA_CLID);
    expect(r.item).toMatchObject({ description: 'Merge cakes.', orientation: 'landscape', mobileFriendly: 1 });
    expect(r.item.labels).toEqual(expect.arrayContaining(['puzzle', 'cooking', 'relaxing']));
    expect(r.item.labels).not.toContain('android');
    expect(playgama.parse({ ...base, gameURL: 'https://numicolor.com/export' }, cfg).ok).toBe(false);
    expect(playgama.ready({}).ok).toBe(false);
  });
  it('keeps unapproved providers inactive with an explanation', () => {
    for (const id of ['gamedistribution', 'famobi']) {
      const r = ADAPTERS[id]!.ready({});
      expect(r.ok).toBe(false);
    }
  });
});
