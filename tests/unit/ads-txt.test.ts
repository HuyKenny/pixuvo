import { describe, expect, it } from 'vitest';
import { renderAdsTxt } from '../../src/config/ads-txt.ts';
describe('ads.txt', () => {
  it('renders only valid records', () => {
    const txt = renderAdsTxt();
    for (const line of txt.trim().split('\n')) expect(line.startsWith('#') || /^[a-z0-9.-]+, [A-Za-z0-9._:-]+, (DIRECT|RESELLER)(, [A-Za-z0-9]+)?$/i.test(line)).toBe(true);
    expect(txt).toContain('google.com, pub-5519830896693885, DIRECT, f08c47fec0942fa0');
  });
});
