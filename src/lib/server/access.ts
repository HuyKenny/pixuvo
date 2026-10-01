/**
 * Cloudflare Access JWT verification (admin). We verify the signed
 * `Cf-Access-Jwt-Assertion` ourselves — RS256 signature against the team JWKS,
 * issuer, audience, expiry and not-before — instead of trusting an e-mail header.
 * Without ACCESS_TEAM_DOMAIN + ACCESS_AUD the admin stays closed in production.
 */
import { isLocal, type AppEnv } from './env';

export type AdminAuth = { ok: true; email: string; via: 'access' | 'local-bypass' } | { ok: false; status: 401 | 403 | 503; reason: string };

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}
let jwksCache: { team: string; at: number; keys: Jwk[] } | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getJwks(team: string, fetchImpl: typeof fetch): Promise<Jwk[]> {
  if (jwksCache && jwksCache.team === team && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetchImpl(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = (data.keys ?? []).filter((k) => k.kty === 'RSA');
  jwksCache = { team, at: Date.now(), keys };
  return keys;
}

export async function verifyAccessJwt(
  token: string,
  opts: { team: string; aud: string; now?: number; fetchImpl?: typeof fetch; jwks?: Jwk[] },
): Promise<{ ok: true; email: string } | { ok: false; reason: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };
  let header: { alg?: string; kid?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; iat?: number; email?: string; sub?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]!)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]!)));
  } catch {
    return { ok: false, reason: 'undecodable token' };
  }
  if (header.alg !== 'RS256' || !header.kid) return { ok: false, reason: 'unexpected alg' };
  const keys = opts.jwks ?? (await getJwks(opts.team, opts.fetchImpl ?? fetch));
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: 'unknown key id' };
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) return { ok: false, reason: 'bad signature' };
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (payload.iss !== `https://${opts.team}`) return { ok: false, reason: 'wrong issuer' };
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(opts.aud)) return { ok: false, reason: 'wrong audience' };
  if (typeof payload.exp !== 'number' || payload.exp < now - 30) return { ok: false, reason: 'expired' };
  if (typeof payload.nbf === 'number' && payload.nbf > now + 30) return { ok: false, reason: 'not yet valid' };
  const email = payload.email ?? payload.sub ?? '';
  if (!email) return { ok: false, reason: 'no identity' };
  return { ok: true, email };
}

export async function authenticateAdmin(request: Request, env: AppEnv): Promise<AdminAuth> {
  if (isLocal(env) && env.ADMIN_DEV_BYPASS === '1') return { ok: true, email: 'local-dev@localhost', via: 'local-bypass' };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return { ok: false, status: 503, reason: 'Admin authentication is not configured.' };
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return { ok: false, status: 401, reason: 'Not signed in.' };
  try {
    const r = await verifyAccessJwt(token, { team: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD });
    return r.ok ? { ok: true, email: r.email, via: 'access' } : { ok: false, status: 403, reason: 'Access denied.' };
  } catch {
    return { ok: false, status: 503, reason: 'Could not verify sign-in.' };
  }
}
