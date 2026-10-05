/**
 * HTMLGames.com (Zygomatic) — public feed https://www.htmlgames.com/rss/games.php?json (checked 2026-10-05: 1 242
 * games). The RSS page says "Feel free to publish our html5 games on your site"; no account or key.
 * Fields: name, category, create_date, description, url (https://cdn.htmlgames.com/<Id>/index.html), youtube, embed,
 * width/height (always 800×480, also for portrait games, so ignored), thumb1–thumb8.
 * Consent: live test 2026-10-05 from an EU IP — a certified InMobi TCF dialog with "Reject all" before ads.
 */
import { cleanTitle } from '../../../src/lib/text.ts';
import type { ProviderAdapter, SourceItem } from '../types.ts';
import { attributesFromLabels, baseText, httpsUrlOnHosts, isoDate, splitLabels } from './common.ts';

const FEED = 'https://www.htmlgames.com/rss/games.php?json';

/**
 * Their 56 genres → Pixuvo labels. Solitaire and mahjong variants keep a precise tag for the landing pages
 * ("spider solitaire", "mahjong connect"); brand words (Tetris, Zuma, Bejeweled, Pac-Man, Arkanoid) never become tags,
 * and "Tripeaks & Golf" never yields a bare "golf" (that is the sports category).
 */
export const HG_GENRES: Record<string, string[]> = {
  'Mahjong Solitaire': ['mahjong', 'mahjong solitaire'],
  'Mahjong Connect': ['mahjong', 'mahjong connect'],
  'Mahjong Games': ['mahjong'],
  '3D Mahjong': ['mahjong', '3d mahjong'],
  'Mahjong Slide': ['mahjong', 'mahjong slide'],
  'Mahjong Tower': ['mahjong', 'mahjong tower'],
  Klondike: ['solitaire', 'klondike'],
  Spider: ['solitaire', 'spider solitaire'],
  Freecell: ['solitaire', 'freecell'],
  Pyramid: ['solitaire', 'pyramid solitaire'],
  'Tripeaks & Golf': ['solitaire', 'tripeaks', 'golf solitaire'],
  Montana: ['solitaire', 'montana solitaire'],
  'Solitaire Games': ['solitaire'],
  'Card Games': ['card'],
  'Puzzle Games': ['puzzle'],
  Puzzles: ['puzzle', 'jigsaw'],
  'Daily Puzzles': ['puzzle', 'daily puzzle'],
  'Brain Games': ['puzzle', 'brain'],
  'Hidden Object Games': ['hidden object'],
  'Difference Games': ['hidden object', 'spot the difference'],
  'Hidden Alphabet': ['hidden object', 'hidden letters'],
  'Hidden Numbers': ['hidden object', 'hidden numbers'],
  'Hidden Clues': ['hidden object'],
  'Bubble Shooter': ['bubble shooter'],
  'Match 3 Games': ['match 3'],
  Bejeweled: ['match 3'],
  'Connect 3': ['match 3'],
  'Collapse Games': ['puzzle', 'collapse'],
  'Tile Games': ['puzzle', 'tile matching'],
  'Word Games': ['word'],
  Crosswords: ['word', 'crossword'],
  Sudoku: ['sudoku'],
  'Math Games': ['math'],
  Memory: ['memory'],
  'Maze Games': ['maze'],
  'Pac Maze': ['maze', 'arcade'],
  '2048 & Merge': ['2048', 'merge'],
  Tetris: ['block puzzle'],
  '1010 Block': ['block puzzle'],
  'Sorting Games': ['puzzle', 'sorting'],
  Board: ['board'],
  Skill: ['arcade'],
  Platform: ['platformer'],
  Retro: ['arcade', 'retro'],
  Arkanoid: ['arcade', 'brick breaker'],
  'Zuma Games': ['arcade', 'marble shooter'],
  Snake: ['snake'],
  Pinball: ['arcade', 'pinball'],
  Billiards: ['sports', 'pool'],
  Golf: ['sports', 'golf'],
  Sports: ['sports'],
  Racing: ['racing'],
  'Shooting & War': ['shooting'],
  'Tower Defense': ['tower defense'],
  'Time management': ['simulation', 'time management'],
  'Escape Games': ['escape'],
};

export const htmlgames: ProviderAdapter = {
  id: 'htmlgames',
  feedHosts: ['www.htmlgames.com'],
  embedHosts: ['cdn.htmlgames.com'],
  imageHosts: ['www.htmlgames.com', 'cdn.htmlgames.com'],
  minCompleteItems: 1000,
  ready() {
    return { ok: true };
  },
  async *pages(ctx) {
    const data = await ctx.fetchJson(FEED);
    if (!Array.isArray(data)) throw new Error('HTMLGames feed: expected a JSON array');
    yield { page: 1, items: data, isLast: true };
  },
  parse(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
    const r = raw as Record<string, unknown>;
    const embedUrl = httpsUrlOnHosts(r.url, this.embedHosts);
    // Most URLs end in /index.html, some only in / (TerraMahjong/, PacMaze/); a few ids contain "+" (DailyBinairo+).
    const id = embedUrl ? /^\/([A-Za-z0-9_+-]{1,80})\/(index\.html)?$/.exec(new URL(embedUrl).pathname)?.[1] : undefined;
    if (!embedUrl || !id) return { ok: false, error: 'url is not https://cdn.htmlgames.com/<id>/[index.html]' };
    const title = cleanTitle(r.name);
    if (title.length < 2) return { ok: false, error: 'missing title', id };
    const thumbUrl = ['thumb6', 'thumb5', 'thumb3'].map((k) => httpsUrlOnHosts(r[k], this.imageHosts)).find(Boolean);
    if (!thumbUrl) return { ok: false, error: 'thumbnail not on allowed host', id };
    const genre = typeof r.category === 'string' ? r.category.trim() : '';
    const labels = splitLabels(HG_GENRES[genre] ?? (genre ? [genre] : []));
    const { description } = baseText(r.description, '');
    const item: SourceItem = {
      providerId: 'htmlgames',
      providerGameId: id,
      title,
      description,
      instructions: '',
      embedUrl,
      thumbUrl,
      thumbW: null,
      thumbH: null,
      width: null,
      height: null,
      labels,
      developer: 'Zygomatic',
      releaseDate: isoDate(r.create_date),
      qualityScore: null,
      ...attributesFromLabels(labels),
      orientation: null,
      // "Our games work on iOS (iPhone, iPad), Android and PC/Mac" (htmlgames.com).
      mobileFriendly: 1,
      restrictions: {},
    };
    return { ok: true, item };
  },
};
