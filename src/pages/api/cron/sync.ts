/**
 * POST /api/cron/sync — called once a day by cron-job.org with
 * "Authorization: Bearer <CRON_SECRET>". Triggers the GitHub Actions sync
 * workflow (import → publish → deploy-if-changed). Heavy work never runs here.
 */
import type { APIRoute } from 'astro';
import { q } from '../../../lib/server/db';
import { getEnv } from '../../../lib/server/env';
import { error, json, timingSafeEqual } from '../../../lib/server/http';
export const prerender = false;
const MIN_INTERVAL_H = 6;

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) return error(503, 'Cron is not configured.');
  const auth = request.headers.get('authorization') ?? '';
  if (!timingSafeEqual(auth, `Bearer ${env.CRON_SECRET}`)) return error(401, 'Unauthorized.');
  if (!env.GH_DISPATCH_TOKEN || !env.GH_REPO) return error(503, 'Dispatch token is not configured.');
  const db = q();
  const [last] = await db.all<{ value: string }>("SELECT value FROM site_settings WHERE key = 'last_sync_dispatch'");
  if (last && Date.now() - Date.parse(last.value) < MIN_INTERVAL_H * 3600_000) return json({ ok: true, skipped: 'dispatched recently', last: last.value });
  const res = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/sync.yml/dispatches`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'pixuvo-cron', 'x-github-api-version': '2022-11-28' },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (res.status !== 204) return error(502, `GitHub dispatch failed (${res.status}).`);
  const now = new Date().toISOString();
  await db.run("INSERT INTO site_settings (key, value, updated_at) VALUES ('last_sync_dispatch', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [now, now]);
  return json({ ok: true, dispatched: now });
};
export const GET: APIRoute = () => error(405, 'Use POST.');
