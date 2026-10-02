import { describe, expect, it } from 'vitest';
import { FeedError, fetchJson } from '../../scripts/import/http.ts';

const sleep = async () => {};
const res = (body: string, init: ResponseInit = {}) => new Response(body, { headers: { 'content-type': 'application/json' }, ...init });

describe('feed fetcher', () => {
  it('refuses hosts outside the allowlist, also via redirect', async () => {
    await expect(fetchJson('https://evil.com/x', { allowHosts: ['a.com'], sleep })).rejects.toThrow(/not allowlisted/);
    const f = (async () => new Response(null, { status: 302, headers: { location: 'https://evil.com/' } })) as typeof fetch;
    await expect(fetchJson('https://a.com/x', { allowHosts: ['a.com'], fetchImpl: f, sleep })).rejects.toThrow(/not allowlisted/);
    await expect(fetchJson('http://a.com/x', { allowHosts: ['a.com'], sleep })).rejects.toThrow(/non-https/);
  });
  it('retries 5xx and Cloudflare 1015, then succeeds', async () => {
    let n = 0;
    const f = (async () => (++n === 1 ? res('error code: 1015', { status: 200, headers: { 'content-type': 'text/plain' } }) : n === 2 ? res('x', { status: 503 }) : res('[1,2]'))) as typeof fetch;
    expect(await fetchJson('https://a.com/x', { allowHosts: ['a.com'], fetchImpl: f, sleep })).toEqual([1, 2]);
    expect(n).toBe(3);
  });
  it('does not retry 404 and caps response size', async () => {
    let n = 0;
    const f404 = (async () => { n++; return res('nope', { status: 404 }); }) as typeof fetch;
    await expect(fetchJson('https://a.com/x', { allowHosts: ['a.com'], fetchImpl: f404, sleep })).rejects.toBeInstanceOf(FeedError);
    expect(n).toBe(1);
    const big = (async () => res('x'.repeat(5000))) as typeof fetch;
    await expect(fetchJson('https://a.com/x', { allowHosts: ['a.com'], fetchImpl: big, sleep, maxBytes: 1000, retries: 0 })).rejects.toThrow(/exceeded|too large/);
  });
  it('gives up after the retry limit', async () => {
    let n = 0;
    const f = (async () => { n++; return res('x', { status: 500 }); }) as typeof fetch;
    await expect(fetchJson('https://a.com/x', { allowHosts: ['a.com'], fetchImpl: f, sleep, retries: 2 })).rejects.toThrow(/HTTP 500/);
    expect(n).toBe(3);
  });
});
