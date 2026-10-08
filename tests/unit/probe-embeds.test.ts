import { describe, expect, it } from 'vitest';
import { extractGameUrl, verdictForStatus } from '../../scripts/probe-embeds.ts';

describe('probe-embeds', () => {
  it('extracts the developer URL from a GameMonetize wrapper', () => {
    expect(extractGameUrl(`<script>var gameUrl = 'https://tinyleafgames.com/games/linerider/';</script>`)).toBe('https://tinyleafgames.com/games/linerider/');
  });
  it('rejects IPs, plain http and hosts without a dot', () => {
    expect(extractGameUrl(`var gameUrl = 'https://10.0.0.1/x';`)).toBeNull();
    expect(extractGameUrl(`var gameUrl = 'http://a.com/x';`)).toBeNull();
    expect(extractGameUrl(`var gameUrl = 'https://localhost/x';`)).toBeNull();
  });
  it('only 404/410 are dead; WAF and server errors are not', () => {
    expect(verdictForStatus(404)).toBe('dead');
    expect(verdictForStatus(410)).toBe('dead');
    expect(verdictForStatus(403)).toBe('ok');
    expect(verdictForStatus(429)).toBe('unknown');
    expect(verdictForStatus(503)).toBe('unknown');
  });
});
