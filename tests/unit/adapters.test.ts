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
  it('keeps unapproved providers inactive with an explanation', () => {
    for (const id of ['playgama', 'gamedistribution', 'famobi']) {
      const r = ADAPTERS[id]!.ready({});
      expect(r.ok).toBe(false);
    }
  });
});
