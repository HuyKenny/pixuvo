/** POST /api/report/ {id, reason, message, path, token} — Turnstile + rate limit; stored for admin review. */
import type { APIRoute } from 'astro';
import { q } from '../../lib/server/db';
import { getEnv, isLocal } from '../../lib/server/env';
import { clientIp, error, json, readJson, sameOrigin, sha256Hex } from '../../lib/server/http';
import { verifyTurnstile } from '../../lib/server/turnstile';
import { htmlToText } from '../../lib/text';
export const prerender = false;
const REASONS = new Set(['not_loading', 'broken_controls', 'inappropriate', 'copyright', 'other']);

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return error(403, 'Cross-site request refused.');
  const env = getEnv();
  const ip = clientIp(request);
  if (!env.RL_WRITE && !isLocal(env)) return error(503, 'Reporting is temporarily unavailable. Please e-mail info@pixuvo.com.');
  if (env.RL_WRITE && !(await env.RL_WRITE.limit({ key: `report:${ip}` })).success) return error(429, 'Too many reports — please try again later.');
  const body = await readJson<{ id?: unknown; reason?: unknown; message?: unknown; path?: unknown; token?: unknown }>(request, 6000);
  const id = Number(body?.id);
  const reason = String(body?.reason ?? '');
  if (!Number.isInteger(id) || id <= 0 || !REASONS.has(reason)) return error(400, 'Invalid report.');
  const ts = await verifyTurnstile(env, body?.token, ip);
  if (!ts.ok) return error(ts.status, ts.reason);
  const message = htmlToText(typeof body?.message === 'string' ? body.message : '', 1000);
  const path = typeof body?.path === 'string' && /^\/[a-z0-9\-/]{0,120}$/.test(body.path) ? body.path : '';
  const voter = (await sha256Hex(`${env.IP_HASH_SALT ?? 'local'}|${ip}`)).slice(0, 32);
  const db = q();
  const [game] = await db.all<{ id: number }>('SELECT id FROM games WHERE id = ? LIMIT 1', [id]);
  if (!game) return error(404, 'Game not found.');
  const [{ n } = { n: 0 }] = await db.all<{ n: number }>("SELECT count(*) AS n FROM reports WHERE voter_hash = ? AND created_at > datetime('now', '-1 day')", [voter]);
  if (n >= 20) return error(429, 'Too many reports today.');
  await db.run('INSERT INTO reports (game_id, reason, message, page_path, voter_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, reason, message, path, voter, new Date().toISOString()]);
  return json({ ok: true }, { status: 201 });
};
