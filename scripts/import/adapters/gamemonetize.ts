/**
 * GameMonetize — public publisher feed.
 * Source: https://gamemonetize.com/rss-builder and the publisher dashboard
 * (feed URL https://gamemonetize.com/feed.php?format=0&page=N, verified 2026-10-02:
 * 2 000 items per page, JSON array; fields id,title,description,instructions,url,
 * category,tags,thumb,width,height). Revenue is attributed by the verified domain
 * and ads.txt in the dashboard — the embed URL carries no publisher id.
 * Rate limit: Cloudflare error 1015 after ~5 fast requests → 15 s between pages.
 */
import { cleanTitle } from '../../../src/lib/text.ts';
import type { ProviderAdapter, SourceItem } from '../types.ts';
import { attributesFromLabels, baseText, httpsUrlOnHosts, splitLabels, toInt } from './common.ts';

const PAGE_SIZE = 2000;
const MAX_PAGES = 60;

export const gamemonetize: ProviderAdapter = {
  id: 'gamemonetize',
  feedHosts: ['gamemonetize.com'],
  embedHosts: ['html5.gamemonetize.co', 'html5.gamemonetize.com'],
  imageHosts: ['img.gamemonetize.com'],
  minCompleteItems: 20_000,
  ready(config) {
    const u = config.GAMEMONETIZE_FEED_URL;
    if (!u) return { ok: false, reason: 'GAMEMONETIZE_FEED_URL is not set' };
    return { ok: true };
  },
  async *pages(ctx) {
    const base = new URL(ctx.config.GAMEMONETIZE_FEED_URL ?? 'https://gamemonetize.com/feed.php?format=0');
    for (let page = Math.max(1, ctx.startPage); page <= MAX_PAGES; page++) {
      base.searchParams.set('page', String(page));
      const data = await ctx.fetchJson(base.toString());
      if (!Array.isArray(data)) throw new Error(`GameMonetize page ${page}: expected an array`);
      const isLast = data.length < (Number(ctx.config.GAMEMONETIZE_PAGE_SIZE) || PAGE_SIZE);
      yield { page, items: data, isLast };
      if (isLast) return;
    }
    throw new Error(`GameMonetize: more than ${MAX_PAGES} pages — refusing to continue`);
  },
  parse(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id).trim() : '';
    if (!/^\d{1,12}$/.test(id)) return { ok: false, error: 'invalid id' };
    const title = cleanTitle(r.title);
    if (title.length < 2) return { ok: false, error: 'missing title', id };
    const embedUrl = httpsUrlOnHosts(r.url, this.embedHosts);
    if (!embedUrl) return { ok: false, error: 'embed url not on allowed host', id };
    const thumbUrl = httpsUrlOnHosts(r.thumb, this.imageHosts);
    if (!thumbUrl) return { ok: false, error: 'thumbnail not on allowed host', id };
    const labels = splitLabels(r.category, r.tags);
    const { description, instructions } = baseText(r.description, r.instructions);
    const item: SourceItem = {
      providerId: 'gamemonetize',
      providerGameId: id,
      title,
      description,
      instructions,
      embedUrl,
      thumbUrl,
      thumbW: 512,
      thumbH: 384,
      width: toInt(r.width),
      height: toInt(r.height),
      labels,
      developer: null,
      releaseDate: null,
      qualityScore: null,
      orientation: null,
      ...attributesFromLabels(labels),
      restrictions: {},
    };
    return { ok: true, item };
  },
};
