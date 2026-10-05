import { describe, expect, it } from 'vitest';
import { gamezipper, gzLabels } from '../../scripts/import/adapters/gamezipper.ts';
import { cleanDesc, parseGamePage, parseGamesData } from '../../scripts/import/gamezipper-catalog.ts';
import { sandboxFor } from '../../src/lib/security.ts';
import { mapLabelsToCategories, pickPrimaryCategory } from '../../src/lib/taxonomy.ts';

const primary = (cat: string, tags: string[]) => {
  const [c, t] = gzLabels(cat, tags);
  const slugs = mapLabelsToCategories([...c, ...t], 'sudoku text');
  return { primary: pickPrimaryCategory(slugs), slugs };
};

describe('gamezipper catalogue', () => {
  it('parses games-data.js as text, with or without spaces in the tag list', () => {
    const src = `const GAMES = [\n{name:"Shogi",emoji:"x",cat:"puzzle",tags:["shogi", "board game"],url:"/shogi/",desc:"Play Shogi online free — Japanese chess. No download, mobile-friendly.",isNew:true,status:"live"},{name:"Say \\"Hi\\"",cat:"word",tags:["word","quote"],url:"/say-hi/",desc:"d",status:"beta"}\n];`;
    const d = parseGamesData(src);
    expect(d.get('shogi')).toEqual({ name: 'Shogi', cat: 'puzzle', tags: ['shogi', 'board game'], desc: 'Play Shogi online free — Japanese chess. No download, mobile-friendly.' });
    expect(d.get('say-hi')?.name).toBe('Say "Hi"');
  });
  it('strips the marketing lead-in and tail from descriptions', () => {
    expect(cleanDesc('Play Kakuro online free! Fill the grid with sums. No download, mobile-friendly!')).toBe('Fill the grid with sums.');
  });
  it('rejects pages that only have the site-wide image or a foreign thumbnail', () => {
    const data = { name: 'X', cat: 'puzzle', tags: [], desc: 'A puzzle.' };
    expect(parseGamePage('x', '<meta property="og:image" content="https://gamezipper.com/og-image.webp">', data)).toEqual({ error: 'only the site-wide og-image' });
    expect(parseGamePage('x', '<meta property="og:image" content="https://cdn.example.com/x.png">', data)).toEqual({ error: 'thumbnail on cdn.example.com' });
    const ok = parseGamePage('x', '<meta property="og:image" content="https://gamezipper.com/og-image.webp">', data, 'https://gamezipper.com/og-images/x.png');
    expect('thumbUrl' in ok && ok.thumbUrl).toBe('https://gamezipper.com/og-images/x.png');
  });
});

describe('gamezipper adapter', () => {
  const game = { slug: 'kakuro', title: 'Kakuro', category: 'puzzle', tags: ['kakuro', 'cross sums', 'logic', 'free browser game', 'mobile game'], description: 'Fill the grid.', instructions: 'Tap a cell.', thumbUrl: 'https://gamezipper.com/og-images/kakuro.png', players: 1, multiplayer: false };
  it('builds the embed URL with our UTM parameters and keeps only GameZipper hosts', () => {
    const r = gamezipper.parse(game, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.embedUrl).toBe('https://gamezipper.com/kakuro/?utm_source=pixuvo.com&utm_medium=embed');
    expect(r.item.mobileFriendly).toBe(1);
    expect(r.item.labels).not.toContain('free browser game');
    expect(gamezipper.parse({ ...game, thumbUrl: 'https://evil.example/x.png' }, {}).ok).toBe(false);
    expect(gamezipper.parse({ ...game, slug: '../x' }, {}).ok).toBe(false);
  });
  it('lets specific tags beat the catch-all "puzzle" category', () => {
    expect(primary('puzzle', ['Board', 'Strategy', 'Classic']).primary).toBe('board'); // Chess
    expect(primary('puzzle', ['Mini Golf', 'Golf', 'Sports', 'Brain']).primary).toBe('sports');
    expect(primary('puzzle', ['math', 'number', '24', 'card', 'brain']).slugs).not.toContain('card'); // Math 24
    expect(primary('puzzle', ['Peg', 'Solitaire', 'Board', 'Classic']).slugs).not.toContain('solitaire');
    expect(primary('card', ['Card', 'Solitaire', 'Classic']).slugs).toContain('solitaire'); // TriPeaks
  });
  it('keeps Nikoli puzzles in the logic category even when tagged "Board Game" or "Drawing"', () => {
    expect(primary('puzzle', ['Puzzle', 'Logic', 'Board Game', 'Loop', 'Nikoli'])).toMatchObject({ primary: 'puzzle' });
    expect(primary('puzzle', ['Puzzle', 'Logic', 'Board Game', 'Loop', 'Nikoli']).slugs).toContain('logic');
    expect(primary('puzzle', ['Puzzle', 'Logic', 'Grid', 'Number']).slugs).toContain('logic'); // Hitori
  });
});

describe('category evidence and sandbox', () => {
  it('only puts a game into Sudoku when its own text mentions it', () => {
    expect(mapLabelsToCategories(['sudoku'], 'Dentist Inc: fix teeth')).not.toContain('sudoku');
    expect(mapLabelsToCategories(['sudoku'], 'Killer Sudoku with cages')).toEqual(expect.arrayContaining(['sudoku', 'puzzle']));
    expect(mapLabelsToCategories(['sudoku'])).not.toContain('sudoku');
  });
  it('serves GameZipper without popups and other partners unchanged', () => {
    expect(sandboxFor('gamezipper')).not.toMatch(/allow-popups/);
    expect(sandboxFor('gamezipper')).toMatch(/allow-scripts/);
    expect(sandboxFor('gamepix')).toMatch(/allow-popups-to-escape-sandbox/);
  });
});
