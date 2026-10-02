/**
 * Hardened JSON fetcher for partner feeds: host allowlist (also for every
 * redirect hop), timeout, response size cap, content-type check, retry with
 * exponential backoff + jitter, and a minimum delay between requests per host
 * (GameMonetize answers Cloudflare error 1015 when hit too fast).
 */

export interface FetchOptions {
  allowHosts: string[];
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  minIntervalMs?: number;
  userAgent?: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** POST JSON body (Playgama's export API is POST-only). */
  method?: 'GET' | 'POST';
  body?: unknown;
}

export class FeedError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FeedError';
  }
}

const lastHit = new Map<string, number>();
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function assertAllowedUrl(raw: string, allowHosts: string[]): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FeedError(`invalid URL`, false);
  }
  if (u.protocol !== 'https:') throw new FeedError(`non-https URL refused: ${u.protocol}`, false);
  if (u.username || u.password) throw new FeedError('credentials in URL refused', false);
  if (!allowHosts.includes(u.hostname)) throw new FeedError(`host not allowlisted: ${u.hostname}`, false);
  return u;
}

export async function fetchJson(url: string, opts: FetchOptions): Promise<unknown> {
  const {
    allowHosts,
    timeoutMs = 45_000,
    maxBytes = 12 * 1024 * 1024,
    retries = 4,
    minIntervalMs = 0,
    userAgent = 'PixuvoCatalogBot/1.0 (+https://pixuvo.com/about/)',
    fetchImpl = fetch,
    sleep = defaultSleep,
    method = 'GET',
    body,
  } = opts;

  let attempt = 0;
  for (;;) {
    try {
      return await fetchOnce(url);
    } catch (e) {
      const err = e instanceof FeedError ? e : new FeedError(String((e as Error)?.message ?? e), true);
      if (!err.retryable || attempt >= retries) throw err;
      const base = err.status === 429 || err.message.includes('1015') ? 30_000 : 2_000;
      const wait = Math.min(base * 2 ** attempt, 180_000) + Math.floor(Math.random() * 1000);
      attempt++;
      await sleep(wait);
    }
  }

  async function fetchOnce(start: string): Promise<unknown> {
    let current = assertAllowedUrl(start, allowHosts);
    for (let hop = 0; hop < 5; hop++) {
      const prev = lastHit.get(current.hostname) ?? 0;
      const gap = Date.now() - prev;
      if (minIntervalMs > 0 && gap < minIntervalMs) await sleep(minIntervalMs - gap);
      lastHit.set(current.hostname, Date.now());

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl(current.toString(), {
          method,
          redirect: 'manual',
          signal: ctrl.signal,
          headers: { accept: 'application/json', 'user-agent': userAgent, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
          ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
        });
      } catch (e) {
        clearTimeout(timer);
        throw new FeedError(`network error: ${(e as Error).name}`, true);
      }
      try {
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) throw new FeedError(`redirect without location`, false, res.status);
          current = assertAllowedUrl(new URL(loc, current).toString(), allowHosts);
          continue;
        }
        const body = await readCapped(res, maxBytes);
        if (res.status === 429 || res.status >= 500) throw new FeedError(`HTTP ${res.status}`, true, res.status);
        if (/^error code: 10\d\d/.test(body.trim())) throw new FeedError(`Cloudflare ${body.trim()}`, true, res.status);
        if (!res.ok) throw new FeedError(`HTTP ${res.status}`, false, res.status);
        const ct = res.headers.get('content-type') ?? '';
        if (!/json|javascript|text\/plain|text\/html/i.test(ct)) throw new FeedError(`unexpected content-type ${ct}`, false);
        try {
          return JSON.parse(body);
        } catch {
          throw new FeedError(`invalid JSON (${body.length} bytes)`, true);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new FeedError('too many redirects', false);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const len = Number(res.headers.get('content-length') ?? '0');
  if (len > maxBytes) throw new FeedError(`response too large (${len} bytes)`, false);
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FeedError(`response exceeded ${maxBytes} bytes`, false);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}
