import { describe, expect, it } from 'vitest';
import { renderAdsTxt } from '../../src/config/ads-txt.ts';
describe('ads.txt', () => {
  it('renders only valid records', () => {
    const txt = renderAdsTxt();
    expect(txt).toContain('google.com, pub-5519830896693885, DIRECT, f08c47fec0942fa0');
    expect(txt).toContain('#gpx-property-M7X08');
    expect(txt).toContain('rev.iq, Kf077RYmx6XvWT8mhSbYq7LIQTU, DIRECT');
    expect(txt.split('\n').length).toBeGreaterThan(880);
  });
});
