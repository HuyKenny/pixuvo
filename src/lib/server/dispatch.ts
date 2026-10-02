/**
 * Starts the GitHub "Sync and publish" workflow. Shared by the daily Cron Trigger
 * (src/worker.ts), POST /api/cron/sync/ (manual/external trigger) and the admin button.
 * Refuses a second dispatch within MIN_INTERVAL_H hours.
 */
export const MIN_INTERVAL_H = 6;

export interface DispatchEnv {
  DB: D1Database;
  GH_DISPATCH_TOKEN?: string;
  GH_REPO?: string;
}

export type DispatchResult = { ok: true; dispatched: string } | { ok: true; skipped: string; last: string } | { ok: false; status: number; error: string };

export async function dispatchSync(env: DispatchEnv, opts: { force?: boolean } = {}): Promise<DispatchResult> {
  if (!env.GH_DISPATCH_TOKEN || !env.GH_REPO) return { ok: false, status: 503, error: 'Dispatch token is not configured.' };
  const last = await env.DB.prepare("SELECT value FROM site_settings WHERE key = 'last_sync_dispatch'").first<{ value: string }>();
  if (!opts.force && last && Date.now() - Date.parse(last.value) < MIN_INTERVAL_H * 3600_000) return { ok: true, skipped: 'dispatched recently', last: last.value };
  const res = await fetch(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/sync.yml/dispatches`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'pixuvo-cron', 'x-github-api-version': '2022-11-28' },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (res.status !== 204) return { ok: false, status: 502, error: `GitHub dispatch failed (${res.status}).` };
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO site_settings (key, value, updated_at) VALUES ('last_sync_dispatch', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(now, now).run();
  return { ok: true, dispatched: now };
}
