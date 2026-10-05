import { describe, expect, it } from 'vitest';
import { HG_GENRES, htmlgames } from '../../scripts/import/adapters/htmlgames.ts';
import { sandboxFor } from '../../src/lib/security.ts';
import { mapLabelsToCategories } from '../../src/lib/taxonomy.ts';

const item = (over: Record<string, unknown> = {}) => ({
  name: 'Creepy Spider',
  category: 'Spider',
  create_date: '2026-10-05',
  description: 'Spider Solitaire for Halloween with only spades.',
  url: 'https://cdn.htmlgames.com/CreepySpider/index.html',
  width: 800,
  height: 480,
  thumb3: 'https://cdn.htmlgames.com/CreepySpider/img/icon/image-300x200.jpg',
  thumb5: 'https://www.htmlgames.com/uploaded/game/thumb500/creepyspider500300.webp',
  thumb6: 'https://www.htmlgames.com/uploaded/game/thumb800/creepyspider800450.webp',
  ...over,
});

describe('htmlgames adapter', () => {
  it('parses a feed item: id from the CDN path, 800px thumbnail, no fixed size', () => {
    const r = htmlgames.parse(item(), {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item).toMatchObject({
      providerGameId: 'CreepySpider',
      embedUrl: 'https://cdn.htmlgames.com/CreepySpider/index.html',
      thumbUrl: 'https://www.htmlgames.com/uploaded/game/thumb800/creepyspider800450.webp',
      width: null,
      height: null,
      releaseDate: '2026-10-05',
      mobileFriendly: 1,
    });
    expect(r.item.labels).toEqual(['solitaire', 'spider solitaire']);
  });
  it('falls back to smaller thumbnails and rejects foreign or malformed URLs', () => {
    const r = htmlgames.parse(item({ thumb6: undefined }), {});
    expect(r.ok && r.item.thumbUrl).toMatch(/thumb500/);
    expect(htmlgames.parse(item({ url: 'https://evil.example/CreepySpider/index.html' }), {}).ok).toBe(false);
    expect(htmlgames.parse(item({ url: 'https://cdn.htmlgames.com/a/b/index.html' }), {}).ok).toBe(false);
    expect(htmlgames.parse(item({ url: 'https://cdn.htmlgames.com/TerraMahjong/' }), {}).ok).toBe(true);
    expect(htmlgames.parse(item({ thumb6: 'https://evil.example/x.webp', thumb5: undefined, thumb3: undefined }), {}).ok).toBe(false);
  });
  it('maps genres to Pixuvo categories without brand words or the sports "golf"', () => {
    const cats = (g: string) => mapLabelsToCategories(HG_GENRES[g]!, 'sudoku');
    expect(cats('Tripeaks & Golf')).toEqual(expect.arrayContaining(['solitaire', 'card']));
    expect(cats('Tripeaks & Golf')).not.toContain('golf');
    expect(cats('Mahjong Connect')).toEqual(['mahjong']);
    expect(cats('Bejeweled')).toEqual(['match-3']);
    expect(cats('Billiards')).toEqual(expect.arrayContaining(['sports', 'pool']));
    for (const labels of Object.values(HG_GENRES)) expect(labels.join(' ')).not.toMatch(/tetris|zuma|bejeweled|pac-?man|arkanoid/i);
  });
  it('plays with the standard partner sandbox (the partner shows a TCF consent dialog)', () => {
    expect(sandboxFor('htmlgames')).toMatch(/allow-popups/);
  });
});
