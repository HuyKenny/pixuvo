import { describe, expect, it } from 'vitest';
import { verifyAccessJwt } from '../../src/lib/server/access.ts';

const team = 'pixuvo.cloudflareaccess.com';
const aud = 'aud-123';
const b64 = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

async function setup() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = (await crypto.subtle.exportKey('jwk', kp.publicKey)) as { n: string; e: string };
  const sign = async (payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }) => {
    const data = `${b64(header)}.${b64(payload)}`;
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(data));
    return `${data}.${Buffer.from(sig).toString('base64url')}`;
  };
  return { sign, jwks: [{ kid: 'k1', kty: 'RSA', n: jwk.n, e: jwk.e }] };
}
const now = Math.floor(Date.now() / 1000);
const good = { iss: `https://${team}`, aud: [aud], exp: now + 600, nbf: now - 10, email: 'kenny@example.com' };

describe('Cloudflare Access JWT', () => {
  it('accepts a valid token', async () => {
    const { sign, jwks } = await setup();
    expect(await verifyAccessJwt(await sign(good), { team, aud, jwks })).toEqual({ ok: true, email: 'kenny@example.com' });
  });
  it.each([
    ['wrong audience', { ...good, aud: ['other'] }],
    ['wrong issuer', { ...good, iss: 'https://evil.cloudflareaccess.com' }],
    ['expired', { ...good, exp: now - 3600 }],
    ['not yet valid', { ...good, nbf: now + 3600 }],
  ])('rejects %s', async (_n, payload) => {
    const { sign, jwks } = await setup();
    expect((await verifyAccessJwt(await sign(payload), { team, aud, jwks })).ok).toBe(false);
  });
  it('rejects alg=none, unknown kid and a forged signature', async () => {
    const { sign, jwks } = await setup();
    const none = `${b64({ alg: 'none', kid: 'k1' })}.${b64(good)}.`;
    expect((await verifyAccessJwt(none, { team, aud, jwks })).ok).toBe(false);
    expect((await verifyAccessJwt(await sign(good, { alg: 'RS256', kid: 'zzz' }), { team, aud, jwks })).ok).toBe(false);
    const t = await sign(good);
    const forged = t.split('.').slice(0, 2).join('.') + '.' + b64('x'.repeat(256));
    expect((await verifyAccessJwt(forged, { team, aud, jwks })).ok).toBe(false);
    const other = await setup();
    expect((await verifyAccessJwt(await other.sign(good), { team, aud, jwks })).ok).toBe(false);
  });
});
