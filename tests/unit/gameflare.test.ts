import { describe, expect, it } from 'vitest';
import { gameflare, gameflareLabels } from '../../scripts/import/adapters/gameflare.ts';
import { sandboxFor } from '../../src/lib/security.ts';
import { mapLabelsToCategories } from '../../src/lib/taxonomy.ts';

const game = (over: Record<string, unknown> = {}) => ({
  title: 'Unicorn Family Simulator',
  url: 'https://distribution.gameflare.com/embed/unicorn-family-simulator/',
  description: 'Control a unicorn.\r\n\r\nEnjoy a great adventure.',
  instructions: 'WASD keys - Movement, Mouse - Camera',
  width: 900,
  height: 635,
  assetList: [{ name: 'https://data.gameflare.com/games/10232/PqWmGTAkFAS7kL-400-300.jpg' }],
  categoryList: [{ name: 'Animal Games' }, { name: '3D Games' }, { name: 'Two players games' }, { name: 'HTML5 games' }, { name: 'WebGL Games' }, { name: 'Bloody Games' }, { name: 'Minecraft Games' }],
  ...over,
});

describe('gameflare adapter', () => {
  it('parses a feed item: slug id, embed and thumbnail hosts, real size, instructions', () => {
    const r = gameflare.parse(game(), {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item).toMatchObject({
      providerGameId: 'unicorn-family-simulator',
      embedUrl: 'https://distribution.gameflare.com/embed/unicorn-family-simulator/',
      thumbUrl: 'https://data.gameflare.com/games/10232/PqWmGTAkFAS7kL-400-300.jpg',
      width: 900,
      height: 635,
      instructions: 'WASD keys - Movement, Mouse - Camera',
      playersMax: 2,
      visualStyle: '3d',
    });
    expect(r.item.description).toContain('Enjoy a great adventure.');
  });
  it('turns category names into labels and drops engine names, brands and "bloody"', () => {
    const l = gameflareLabels(['Animal Games', '3D Games', 'Two players games', 'HTML5 games', 'WebGL Games', 'Bloody Games', 'Minecraft Games', 'Jumping Games']);
    expect(l).toEqual(['animal', '3d', '2 player', 'platformer', 'jumping']);
    expect(mapLabelsToCategories(l, 'x')).toEqual(expect.arrayContaining(['2-player', 'platformer']));
  });
  it('rejects foreign hosts and non-embed URLs', () => {
    expect(gameflare.parse(game({ url: 'https://evil.example/embed/x/' }), {}).ok).toBe(false);
    expect(gameflare.parse(game({ url: 'https://distribution.gameflare.com/games/x/' }), {}).ok).toBe(false);
    expect(gameflare.parse(game({ assetList: [{ name: 'https://evil.example/x.jpg' }] }), {}).ok).toBe(false);
  });
  it('uses the standard partner sandbox', () => {
    expect(sandboxFor('gameflare')).toMatch(/allow-popups/);
  });
});
