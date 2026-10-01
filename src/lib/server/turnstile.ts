import { isLocal, type AppEnv } from './env';

export type TurnstileResult = { ok: true } | { ok: false; status: number; reason: string };

/** Server-side Turnstile check. Without a secret in production, writes are refused (fail closed). */
export async function verifyTurnstile(env: AppEnv, token: unknown, ip: string): Promise<TurnstileResult> {
  if (!env.TURNSTILE_SECRET_KEY) {
    if (isLocal(env)) return { ok: true };
    return { ok: false, status: 503, reason: 'Protection is not configured; this form is temporarily unavailable.' };
  }
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return { ok: false, status: 400, reason: 'Missing verification token.' };
  const body = new FormData();
  body.set('secret', env.TURNSTILE_SECRET_KEY);
  body.set('response', token);
  body.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = (await res.json()) as { success?: boolean };
    return data.success ? { ok: true } : { ok: false, status: 403, reason: 'Verification failed. Please try again.' };
  } catch {
    return { ok: false, status: 503, reason: 'Verification service unavailable.' };
  }
}
