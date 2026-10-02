/**
 * POST /api/cron/sync — manual/external trigger (the daily run is the Worker Cron Trigger) with
 * "Authorization: Bearer <CRON_SECRET>". Triggers the GitHub Actions sync
 * workflow (import → publish → deploy-if-changed). Heavy work never runs here.
 */
import type { APIRoute } from 'astro';
import { dispatchSync, type DispatchEnv } from '../../../lib/server/dispatch';
import { getEnv } from '../../../lib/server/env';
import { error, json, timingSafeEqual } from '../../../lib/server/http';
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) return error(503, 'Cron is not configured.');
  const auth = request.headers.get('authorization') ?? '';
  if (!timingSafeEqual(auth, `Bearer ${env.CRON_SECRET}`)) return error(401, 'Unauthorized.');
  const r = await dispatchSync(env as unknown as DispatchEnv);
  return r.ok ? json(r) : error(r.status, r.error);
};
export const GET: APIRoute = () => error(405, 'Use POST.');
