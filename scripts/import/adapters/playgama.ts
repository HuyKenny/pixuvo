/**
 * Playgama — partner catalogue export.
 * Source: https://wiki.playgama.com/playgama/for-partners/import-the-game-catalog and the
 * partner dashboard (widgets.playgama.com), verified 2026-10-02: the dashboard's
 * "Download all Games" calls POST https://playgama.com/api/v1/partner/export/catalogue/games
 * with {pagination:{limit,offset}, filters, sort}; response {games[], totalCount} (2 367 games).
 * Fields: id, slug, title, description, howToPlayText, gameURL, genres, tags, images[],
 * mobileReady[], inGamePurchases, supportedLanguages, screenOrientation{horizontal,vertical}.
 * Attribution: the partner `clid` is appended to gameURL (`?clid=`), exactly as the dashboard's
 * embed code does. Without PLAYGAMA_CLID the adapter refuses to run.
 */
import { cleanTitle } from '../../../src/lib/text.ts';
import type { ProviderAdapter, SourceItem } from '../types.ts';
import { attributesFromLabels, baseText, httpsUrlOnHosts, splitLabels } from './common.ts';

const API = 'https://playgama.com/api/v1/partner/export/catalogue/games';
const PAGE = 100;
const MAX_PAGES = 400;

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export const playgama: ProviderAdapter = {
  id: 'playgama',
  feedHosts: ['playgama.com'],
  embedHosts: ['playgama.com'],
  imageHosts: ['static.playgama.com'],
  minCompleteItems: 1500,
  ready(config) {
    if (!config.PLAYGAMA_CLID || !/^p_[0-9a-f-]{36}$/.test(config.PLAYGAMA_CLID)) return { ok: false, reason: 'PLAYGAMA_CLID is not set' };
    return { ok: true };
  },
  async *pages(ctx) {
    let total = Infinity;
    for (let page = Math.max(1, ctx.startPage); page <= MAX_PAGES; page++) {
      const offset = (page - 1) * PAGE;
      if (offset >= total) return;
      const data = (await ctx.fetchJson(API, { method: 'POST', body: { pagination: { limit: PAGE, offset }, filters: {}, sort: {} } })) as { games?: unknown[]; totalCount?: unknown };
      if (!data || !Array.isArray(data.games)) throw new Error(`Playgama page ${page}: missing games[]`);
      if (typeof data.totalCount === 'number') total = data.totalCount;
      const isLast = data.games.length < PAGE || offset + data.games.length >= total;
      yield { page, items: data.games, isLast };
      if (isLast) return;
    }
    throw new Error(`Playgama: more than ${MAX_PAGES} pages — refusing to continue`);
  },
  parse(raw, config) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id).trim() : '';
    if (!/^[0-9A-Za-z_-]{1,40}$/.test(id)) return { ok: false, error: 'invalid id' };
    const title = cleanTitle(r.title);
    if (title.length < 2) return { ok: false, error: 'missing title', id };
    const base = httpsUrlOnHosts(r.gameURL, this.embedHosts);
    if (!base || !new URL(base).pathname.startsWith('/export/game/')) return { ok: false, error: 'embed url not an export game URL', id };
    const embed = new URL(base);
    embed.searchParams.set('clid', config.PLAYGAMA_CLID!);
    const images = asStrings(r.images);
    const thumbUrl = images.map((u) => httpsUrlOnHosts(u, this.imageHosts)).find((u) => u && /big_preview/.test(u)) ?? images.map((u) => httpsUrlOnHosts(u, this.imageHosts)).find(Boolean);
    if (!thumbUrl) return { ok: false, error: 'thumbnail not on allowed host', id };
    // Tags are slugs such as "relaxing-games" / "android-games" — drop platform/engine noise.
    const tags = asStrings(r.tags)
      .map((t) => t.replace(/-games?(-online)?$/, '').replace(/-/g, ' '))
      .filter((t) => !/^(android|ios|defold|unity|gam supported|html5|construct|cocos)\b/.test(t));
    const labels = splitLabels(asStrings(r.genres), tags);
    const { description, instructions } = baseText(r.description, r.howToPlayText);
    const mobile = asStrings(r.mobileReady).some((m) => /android|ios/i.test(m)) ? 1 : null;
    const o = (r.screenOrientation ?? {}) as { horizontal?: unknown; vertical?: unknown };
    const orientation = o.horizontal === true && o.vertical === true ? 'any' : o.horizontal === true ? 'landscape' : o.vertical === true ? 'portrait' : null;
    const langs = asStrings(r.supportedLanguages);
    const item: SourceItem = {
      providerId: 'playgama',
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
      developer: null,
      releaseDate: null,
      qualityScore: null,
      ...attributesFromLabels(labels),
      orientation,
      mobileFriendly: mobile,
      restrictions: { in_game_purchases: r.inGamePurchases === 'Yes', languages: langs.slice(0, 10) },
    };
    return { ok: true, item };
  },
};
