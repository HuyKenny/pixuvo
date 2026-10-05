/**
 * GameZipper — open embed programme (https://gamezipper.com/publisher-partner.html): no account,
 * no key, no revenue share. The documented feed /api/games.json returns 404 (2026-10-05), so this
 * adapter reads the local catalogue built by scripts/import/gamezipper-catalog.ts
 * (data/providers/gamezipper.json, a hand-picked allowlist of titles with real search demand).
 * Embed: https://gamezipper.com/<slug>/?utm_source=pixuvo.com&utm_medium=embed, as their snippet does.
 * The embedded page runs their own ads (AdSense, Adsterra, ExoClick) without a consent prompt, so
 * /api/play serves these games in a sandbox without popups (sandboxFor in src/lib/security.ts).
 */
import { existsSync, readFileSync } from 'node:fs';
import { cleanTitle } from '../../../src/lib/text.ts';
import { mapLabelsToCategories, getCategoryDef } from '../../../src/lib/taxonomy.ts';
import type { GzGame } from '../gamezipper-catalog.ts';
import type { ProviderAdapter, SourceItem } from '../types.ts';
import { attributesFromLabels, baseText, httpsUrlOnHosts, splitLabels } from './common.ts';

const FILE = 'data/providers/gamezipper.json';
// Tags that are marketing or name someone else's product (UNO, Othello) rather than describe the game.
const NOISE = /^(free( browser| online)? games?|browser( game)?|html5|mobile( game)?|no download|unique solution|free|online|ai|mcts|clone|daily|casual|escape|block escape)$/i;
// GameZipper uses "escape" for "get out of the jam" (Bus Traffic Fever, Klotski), not for escape-room games.
const FOREIGN_BRANDS = /^(uno|othello|cracking the cryptic)$/i;

const inPuzzleTree = (slug: string) => slug === 'puzzle' || getCategoryDef(slug)?.parent === 'puzzle';
const cats = (t: string) => mapLabelsToCategories([t]);

/**
 * GameZipper files almost everything (chess, mancala, mini golf) under "puzzle" and adds generic tags
 * ("Brain", "Strategy", "Puzzle") to most games, so the specific tags decide:
 * - "card"/"solitaire" count only for their card category (Math 24 and Peg Solitaire are not card games);
 * - a real non-puzzle genre in the tags (board, sports, coloring…) drops the puzzle-only tags and their
 *   category, and board/card games drop the generic "strategy";
 * - "logic" + "grid" together is a grid logic puzzle (Hitori, Star Battle);
 * - a Nikoli/sudoku/logic-puzzle tag keeps the game in the puzzle tree even when GameZipper also tags it
 *   "Board Game" or "Drawing" (Slitherlink, Train Tracks).
 */
export function gzLabels(category: string, tags: string[]): [string[], string[]] {
  let t = tags.filter((x) => category === 'card' || !cats(x).some((s) => s === 'card' || s === 'solitaire'));
  const gridLogic = t.some((x) => cats(x).some((s) => s === 'logic' || s === 'sudoku'));
  const strong = new Set(gridLogic ? [] : t.flatMap(cats).filter((s) => getCategoryDef(s)?.kind === 'genre' && !['puzzle', 'casual', 'strategy'].includes(s)));
  if (strong.size) t = t.filter((x) => !cats(x).length || !cats(x).every(inPuzzleTree));
  if (strong.has('board') || strong.has('card')) t = t.filter((x) => !cats(x).includes('strategy'));
  const lower = new Set(t.map((x) => x.toLowerCase()));
  if (!strong.size && lower.has('logic') && lower.has('grid')) t = [...t, 'logic grid'];
  return [strong.size ? [] : [category], t];
}

export const gamezipper: ProviderAdapter = {
  id: 'gamezipper',
  feedHosts: [],
  embedHosts: ['gamezipper.com'],
  imageHosts: ['gamezipper.com'],
  minCompleteItems: 50,
  ready(config) {
    const f = config.GAMEZIPPER_FILE ?? FILE;
    return existsSync(f) ? { ok: true } : { ok: false, reason: `${f} missing — run scripts/import/gamezipper-catalog.ts` };
  },
  async *pages(ctx) {
    const f = ctx.file ?? ctx.config.GAMEZIPPER_FILE ?? FILE;
    const data = JSON.parse(readFileSync(f, 'utf8')) as { games?: unknown[] };
    if (!Array.isArray(data.games)) throw new Error(`${f}: missing games[]`);
    yield { page: 1, items: data.games, isLast: true };
  },
  parse(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
    const g = raw as Partial<GzGame>;
    const id = typeof g.slug === 'string' ? g.slug : '';
    if (!/^[a-z0-9-]{1,60}$/.test(id)) return { ok: false, error: 'invalid slug' };
    const title = cleanTitle(g.title);
    if (title.length < 2) return { ok: false, error: 'missing title', id };
    const thumbUrl = httpsUrlOnHosts(g.thumbUrl, this.imageHosts);
    if (!thumbUrl) return { ok: false, error: 'thumbnail not on allowed host', id };
    const embed = new URL(`https://gamezipper.com/${id}/`);
    embed.searchParams.set('utm_source', 'pixuvo.com');
    embed.searchParams.set('utm_medium', 'embed');

    const rawTags = Array.isArray(g.tags) ? g.tags.filter((t): t is string => typeof t === 'string') : [];
    const declaredMobile = rawTags.some((t) => /^mobile( game)?$/i.test(t.trim()));
    const tags = rawTags.filter((t) => !NOISE.test(t.trim()) && !FOREIGN_BRANDS.test(t.trim()));
    const labels = splitLabels(...gzLabels(typeof g.category === 'string' ? g.category : '', tags));
    const attrs = attributesFromLabels(labels);
    const { description, instructions } = baseText(g.description, g.instructions);
    const players = typeof g.players === 'number' && g.players > 0 ? g.players : null;
    const item: SourceItem = {
      providerId: 'gamezipper',
      providerGameId: id,
      title,
      description,
      instructions,
      embedUrl: embed.toString(),
      thumbUrl,
      thumbW: null,
      thumbH: null,
      width: null,
      height: null,
      labels,
      developer: 'GameZipper',
      releaseDate: null,
      qualityScore: null,
      ...attrs,
      playersMax: attrs.playersMax ?? players,
      multiplayerMode: attrs.multiplayerMode,
      orientation: null,
      // Trust the per-game "mobile game" tag, not the programme's blanket "mobile-first" claim.
      mobileFriendly: attrs.mobileFriendly ?? (declaredMobile ? 1 : null),
      restrictions: { third_party_ads_in_frame: true },
    };
    return { ok: true, item };
  },
};
