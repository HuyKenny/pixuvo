/**
 * POST /api/play/ {id, source?}
 * Returns the embed for a game ONLY if the game is published, the source is
 * active (or within its missing-from-feed grace period), and the provider is
 * approved for publishing with a usable consent mode. Revoking any of these
 * stops new starts immediately, even from cached HTML.
 */
import type { APIRoute } from 'astro';
import { q } from '../../lib/server/db';
import { getEnv } from '../../lib/server/env';
import { clientIp, error, json, readJson, sameOrigin, sha256Hex } from '../../lib/server/http';
import { isAllowedEmbed, playKey, sandboxFor } from '../../lib/security';

export const prerender = false;

interface SourceRow {
  id: number;
  embed_url: string;
  status: string;
  restrictions: string;
  provider_id: string;
  provider_name: string;
  publish_status: string;
  consent_mode: string;
  game_status: string;
  primary_source_id: number;
}

const ALLOW = 'autoplay; fullscreen; gamepad; accelerometer; gyroscope';

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return error(403, 'Cross-site request refused.');
  const env = getEnv();
  // Fail closed: without the limiter every page view could hammer D1.
  if (!env.RL_PLAY) return error(503, 'Games are temporarily unavailable.');
  const { success } = await env.RL_PLAY.limit({ key: clientIp(request) });
  if (!success) return error(429, 'Too many requests — please wait a moment.');
  const body = await readJson<{ id?: unknown; source?: unknown }>(request);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return error(400, 'Invalid game.');
  const pinned = Number(body?.source);
  const db = q();
  const rows = await db.all<SourceRow>(
    `SELECT s.id, s.embed_url, s.status, s.restrictions, s.provider_id, p.name AS provider_name, p.publish_status, p.consent_mode,
            g.status AS game_status, g.primary_source_id
       FROM games g JOIN game_sources s ON s.game_id = g.id JOIN providers p ON p.id = s.provider_id
      WHERE g.id = ? LIMIT 10`,
    [id],
  );
  if (!rows.length) return error(404, 'This game does not exist.');
  if (rows[0]!.game_status !== 'published') return error(410, 'This game is no longer available on Pixuvo.');
  const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? null;
  const mobile = /Mobi|Android|iPhone|iPad/i.test(request.headers.get('user-agent') ?? '');
  const usable = rows.filter((r) => {
    if (r.status !== 'active' && r.status !== 'missing') return false;
    if (r.publish_status !== 'approved' || r.consent_mode === 'blocked') return false;
    let rs: { countries_block?: string[]; devices?: string[] } = {};
    try {
      rs = JSON.parse(r.restrictions || '{}');
    } catch {
      return false;
    }
    if (country && Array.isArray(rs.countries_block) && rs.countries_block.includes(country)) return false;
    if (Array.isArray(rs.devices) && rs.devices.length && !rs.devices.includes(mobile ? 'mobile' : 'desktop')) return false;
    return true;
  });
  if (!usable.length) return error(403, 'This game is not available in your region or on this device right now.');
  // Keep the visitor on the same source for the whole session; otherwise primary, then lowest id.
  const pick = usable.find((r) => r.id === pinned) ?? usable.find((r) => r.id === r.primary_source_id) ?? usable.sort((a, b) => a.id - b.id)[0]!;
  let embed: URL;
  try {
    embed = new URL(pick.embed_url);
    // Only partner hosts the CSP allows; anything else would just be a blocked frame.
    if (!isAllowedEmbed(embed)) throw new Error('host');
  } catch {
    return error(500, 'This game is misconfigured. Please report it.');
  }
  // e2e/test mode: never load real partner games (no ad impressions from tests). Relative URL on purpose:
  // `wrangler dev` rewrites request.url to the route host (pixuvo.com) when routes are configured.
  const sandbox = sandboxFor(pick.provider_id);
  if (env.ENVIRONMENT === 'test') return json({ embedUrl: `/e2e-fixture/game/?id=${id}`, sourceId: pick.id, provider: pick.provider_name, allow: ALLOW, sandbox });
  // One aggregated write per play, counted at most once per visitor, game and day: the game starts
  // on page open, so reloads must not inflate trending (or cost a D1 write each time).
  const day = new Date().toISOString().slice(0, 10);
  if (await firstPlayToday(env.IP_HASH_SALT, clientIp(request), id, day)) await db.run(
    `INSERT INTO aggregate_metrics (day, game_id, play_clicks) VALUES (?, ?, 1)
     ON CONFLICT(day, game_id) DO UPDATE SET play_clicks = play_clicks + 1`,
    [day, id],
  );
  return json({ embedUrl: embed.toString(), sourceId: pick.id, provider: pick.provider_name, allow: ALLOW, sandbox });
};

export const GET: APIRoute = () => error(405, 'Use POST.');

/** Dedupe in the colo's Cache API (no storage writes). Best effort: a cache miss just counts once more. */
async function firstPlayToday(salt: string | undefined, ip: string, id: number, day: string): Promise<boolean> {
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : null;
  if (!cache) return true;
  const visitor = (await sha256Hex(`${salt ?? 'local'}|${ip}`)).slice(0, 24);
  const key = playKey(visitor, id, day);
  try {
    if (await cache.match(key)) return false;
    await cache.put(key, new Response('1', { headers: { 'cache-control': 'public, max-age=86400' } }));
  } catch {
    /* count it */
  }
  return true;
}
