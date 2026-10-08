import { describe, expect, it } from 'vitest';
import { renderAdsTxt } from '../../src/config/ads-txt.ts';
describe('ads.txt', () => {
  it('renders only valid records', () => {
    const txt = renderAdsTxt();
    expect(txt).toContain('google.com, pub-5519830896693885, DIRECT, f08c47fec0942fa0');
    expect(txt).toContain('#gpx-property-9O09X');
    expect(txt).toContain('rev.iq, Kf077RYmx6XvWT8mhSbYq7LIQTU, DIRECT');
    expect(txt.split('\n').length).toBeGreaterThan(920);
  });
  it('carries the HTMLGames (Zygomatic) partner lines verbatim, including an empty cert field', () => {
    const txt = renderAdsTxt();
    expect(txt).toContain('# HTMLGames.com (Zygomatic)');
    expect(txt).toContain('yollamedia.com, 1aa310c633fb5a7cc62be96a2d7bda1e, DIRECT');
    expect(txt).toContain('contextweb.com, 558511, RESELLER,');
  });
  it('carries the GameFlare revenue-share lines', () => {
    const txt = renderAdsTxt();
    expect(txt).toContain('# GameFlare.com');
    expect(txt).toContain('cpmstar.com, 23984, RESELLER');
    expect(txt).toContain('google.com, pub-7020262665364086, RESELLER, f08c47fec0942fa0');
  });
});
