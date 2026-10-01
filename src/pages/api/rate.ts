/** POST /api/rate/ {id, value: 1|-1, token} — one vote per anonymous voter hash per game; Turnstile + rate limit. */
import type { APIRoute } from 'astro';
import { q } from '../../lib/server/db';
import { getEnv, isLocal } from '../../lib/server/env';
import { clientIp, error, json, readJson, sameOrigin, sha256Hex } from '../../lib/server/http';
import { verifyTurnstile } from '../../lib/server/turnstile';
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return error(403, 'Cross-site request refused.');
  const env = getEnv();
  const ip = clientIp(request);
  if (!env.RL_WRITE && !isLocal(env)) return error(503, 'Voting is temporarily unavailable.');
  if (env.RL_WRITE && !(await env.RL_WRITE.limit({ key: `rate:${ip}` })).success) return error(429, 'Too many votes — please slow down.');
  const body = await readJson<{ id?: unknown; value?: unknown; token?: unknown }>(request);
  const id = Number(body?.id);
  const value = Number(body?.value);
  if (!Number.isInteger(id) || id <= 0 || (value !== 1 && value !== -1)) return error(400, 'Invalid vote.');
  const ts = await verifyTurnstile(env, body?.token, ip);
  if (!ts.ok) return error(ts.status, ts.reason);
  if (!env.IP_HASH_SALT && !isLocal(env)) return error(503, 'Voting is temporarily unavailable.');
  const voter = (await sha256Hex(`${env.IP_HASH_SALT ?? 'local'}|${ip}`)).slice(0, 32);
  const db = q();
  const [game] = await db.all<{ status: string }>('SELECT status FROM games WHERE id = ? LIMIT 1', [id]);
  if (!game || game.status !== 'published') return error(404, 'Game not found.');
  const [prev] = await db.all<{ value: number }>('SELECT value FROM ratings WHERE game_id = ? AND voter_hash = ? LIMIT 1', [id, voter]);
  if (prev?.value === value) {
    const [r] = await db.all<{ up: number; down: number }>('SELECT rating_up AS up, rating_down AS down FROM games WHERE id = ?', [id]);
    return json(r ?? { up: 0, down: 0 });
  }
  const now = new Date().toISOString();
  const up = (value === 1 ? 1 : 0) - (prev?.value === 1 ? 1 : 0);
  const down = (value === -1 ? 1 : 0) - (prev?.value === -1 ? 1 : 0);
  await db.batch([
    { sql: 'INSERT INTO ratings (game_id, voter_hash, value, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(game_id, voter_hash) DO UPDATE SET value = excluded.value, created_at = excluded.created_at', params: [id, voter, value, now] },
    { sql: 'UPDATE games SET rating_up = max(0, rating_up + ?), rating_down = max(0, rating_down + ?) WHERE id = ?', params: [up, down, id] },
  ]);
  const [r] = await db.all<{ up: number; down: number }>('SELECT rating_up AS up, rating_down AS down FROM games WHERE id = ?', [id]);
  return json(r ?? { up: 0, down: 0 });
};
