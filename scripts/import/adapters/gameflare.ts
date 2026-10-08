/**
 * GameFlare — public feed https://distribution.gameflare.com/feed.json (164 games on 2026-10-05):
 * {games:[{game:{title, url (https://distribution.gameflare.com/embed/<slug>/), description, instructions, width, height,
 * assetList:[{name: 400×300 jpg on data.gameflare.com}], categoryList:[{name: "Action Games"…}]}}]}.
 * Revenue share (35 % for publishers) needs a publisher account and their ads.txt lines (src/config/ads-gameflare.ts).
 * Consent: their page only says "by clicking Play Game you agree…" (no TCF dialog); published as owner_accepted.
 * Their WAF answers 403 to a HeadlessChrome user agent — use a normal UA in browser tests.
 */
import { cleanTitle } from '../../../src/lib/text.ts';
import type { ProviderAdapter, SourceItem } from '../types.ts';
import { attributesFromLabels, baseText, httpsUrlOnHosts, splitLabels, toInt } from './common.ts';

const FEED = 'https://distribution.gameflare.com/feed.json';

// Category names are "<Thing> Games"; these need a different label or none at all.
const RENAME: Record<string, string[]> = {
  'two players': ['2 player'],
  '3+ player': ['multiplayer'],
  bike: ['motorcycle'],
  soccer: ['football'],
  platform: ['platformer'],
  jumping: ['platformer', 'jumping'],
  skill: ['arcade', 'skill'],
  train: ['simulation', 'train'],
  'roller coaster': ['simulation', 'roller coaster'],
};
// Engine/marketing names, a brand (Minecraft) and labels that make no sense as a tag on a kids' site.
const DROP = new Set(['html5', 'webgl', 'minecraft', 'bloody', 'company', 'crazy', 'funny']);

export function gameflareLabels(categories: string[]): string[] {
  const out: string[] = [];
  for (const c of categories) {
    const base = c.trim().toLowerCase().replace(/\s+games?$/, '');
    if (!base || DROP.has(base)) continue;
    out.push(...(RENAME[base] ?? [base]));
  }
  return splitLabels(out);
}

export const gameflare: ProviderAdapter = {
  id: 'gameflare',
  feedHosts: ['distribution.gameflare.com'],
  embedHosts: ['distribution.gameflare.com'],
  imageHosts: ['data.gameflare.com'],
  minCompleteItems: 120,
  ready() {
    return { ok: true };
  },
  async *pages(ctx) {
    const data = (await ctx.fetchJson(FEED)) as { games?: Array<{ game?: unknown }> };
    if (!data || !Array.isArray(data.games)) throw new Error('GameFlare feed: missing games[]');
    yield { page: 1, items: data.games.map((x) => x?.game), isLast: true };
  },
  parse(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
    const r = raw as Record<string, unknown>;
    const embedUrl = httpsUrlOnHosts(r.url, this.embedHosts);
    const id = embedUrl ? /^\/embed\/([a-z0-9-]{1,100})\/$/.exec(new URL(embedUrl).pathname)?.[1] : undefined;
    if (!embedUrl || !id) return { ok: false, error: 'url is not https://distribution.gameflare.com/embed/<slug>/' };
    const title = cleanTitle(r.title);
    if (title.length < 2) return { ok: false, error: 'missing title', id };
    const assets = Array.isArray(r.assetList) ? (r.assetList as Array<{ name?: unknown }>) : [];
    const thumbUrl = assets.map((a) => httpsUrlOnHosts(a?.name, this.imageHosts)).find(Boolean);
    if (!thumbUrl) return { ok: false, error: 'thumbnail not on allowed host', id };
    const cats = Array.isArray(r.categoryList) ? (r.categoryList as Array<{ name?: unknown }>).map((c) => (typeof c?.name === 'string' ? c.name : '')) : [];
    const labels = gameflareLabels(cats);
    const { description, instructions } = baseText(r.description, r.instructions);
    const item: SourceItem = {
      providerId: 'gameflare',
      providerGameId: id,
      title,
      description,
      instructions,
      embedUrl,
      thumbUrl,
      thumbW: 400,
      thumbH: 300,
      width: toInt(r.width),
      height: toInt(r.height),
      labels,
      developer: null,
      releaseDate: null,
      qualityScore: null,
      ...attributesFromLabels(labels),
      orientation: null,
      // Not declared in the feed; most games are 3D WebGL.
      mobileFriendly: null,
      restrictions: {},
    };
    return { ok: true, item };
  },
};
