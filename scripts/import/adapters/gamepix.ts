/**
 * GamePix — publisher JSON feed (JSON Feed 1.1).
 * Source: https://partners.gamepix.com/publishers + dashboard feed URL
 * https://feeds.gamepix.com/v2/json?sid=<SID>&pagination=96&page=N (verified 2026-10-02:
 * 145 pages × 96, `next_url` paging; items carry `url` = play.gamepix.com/<ns>/embed?sid=<SID>).
 * Attribution: the publisher `sid` must stay in the embed URL. We check it is ours.
 */
import { cleanTitle } from '../../../src/lib/text.ts';
import type { ProviderAdapter, SourceItem } from '../types.ts';
import { assertAllowedUrl } from '../http.ts';
import { attributesFromLabels, baseText, httpsUrlOnHosts, isoDate, splitLabels, toInt } from './common.ts';

const PAGE_SIZE = 96;
const MAX_PAGES = 600;

export const gamepix: ProviderAdapter = {
  id: 'gamepix',
  feedHosts: ['feeds.gamepix.com'],
  embedHosts: ['play.gamepix.com'],
  imageHosts: ['img.gamepix.com'],
  minCompleteItems: 8_000,
  ready(config) {
    if (!config.GAMEPIX_SID || !/^[A-Z0-9]{3,12}$/.test(config.GAMEPIX_SID)) return { ok: false, reason: 'GAMEPIX_SID is not set' };
    return { ok: true };
  },
  async *pages(ctx) {
    const sid = ctx.config.GAMEPIX_SID!;
    let page = Math.max(1, ctx.startPage);
    let url: string | null = `https://feeds.gamepix.com/v2/json?sid=${encodeURIComponent(sid)}&pagination=${PAGE_SIZE}&page=${page}`;
    while (url) {
      if (page > MAX_PAGES) throw new Error(`GamePix: more than ${MAX_PAGES} pages — refusing to continue`);
      const data = (await ctx.fetchJson(url)) as Record<string, unknown>;
      if (!data || !Array.isArray(data.items)) throw new Error(`GamePix page ${page}: missing items[]`);
      let next: string | null = null;
      if (typeof data.next_url === 'string' && data.next_url) {
        const u = assertAllowedUrl(data.next_url, this.feedHosts);
        if (u.searchParams.get('sid') !== sid) throw new Error('GamePix next_url changed the sid — refusing');
        next = u.toString();
      }
      yield { page, items: data.items, isLast: !next };
      url = next;
      page++;
    }
  },
  parse(raw, config) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'not an object' };
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!/^[A-Za-z0-9]{1,20}$/.test(id)) return { ok: false, error: 'invalid id' };
    const title = cleanTitle(r.title);
    if (title.length < 2) return { ok: false, error: 'missing title', id };
    const embedUrl = httpsUrlOnHosts(r.url, this.embedHosts);
    if (!embedUrl) return { ok: false, error: 'embed url not on allowed host', id };
    if (new URL(embedUrl).searchParams.get('sid') !== config.GAMEPIX_SID) return { ok: false, error: 'embed url lacks our sid', id };
    const thumbUrl = httpsUrlOnHosts(r.banner_image, this.imageHosts) ?? httpsUrlOnHosts(r.image, this.imageHosts);
    if (!thumbUrl) return { ok: false, error: 'thumbnail not on allowed host', id };
    const labels = splitLabels(typeof r.category === 'string' ? r.category.replace(/-/g, ' ') : null);
    const { description, instructions } = baseText(r.description, null);
    const o = r.orientation;
    const orientation = o === 'landscape' || o === 'portrait' ? o : o === 'all' ? 'any' : null;
    const q = typeof r.quality_score === 'number' && r.quality_score >= 0 && r.quality_score <= 1 ? r.quality_score : null;
    const attrs = attributesFromLabels(labels);
    const item: SourceItem = {
      providerId: 'gamepix',
      providerGameId: id,
      title,
      description,
      instructions,
      embedUrl,
      thumbUrl,
      thumbW: null,
      thumbH: null,
      width: toInt(r.width),
      height: toInt(r.height),
      labels,
      developer: null,
      releaseDate: isoDate(r.date_published),
      qualityScore: q,
      orientation,
      ...attrs,
      // GamePix does not declare device support per game; unknown stays unknown.
      mobileFriendly: null,
      restrictions: {},
    };
    return { ok: true, item };
  },
};
