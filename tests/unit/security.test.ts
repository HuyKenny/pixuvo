import { describe, expect, it } from 'vitest';
import { isAllowedEmbed, playKey, safeAdminReturn, SECURITY_HEADERS } from '../../src/lib/security.ts';

describe('admin return path', () => {
  it('keeps admin paths with their query', () => {
    expect(safeAdminReturn('/admin/games/?status=hidden')).toBe('/admin/games/?status=hidden');
  });
  it('refuses anything that leaves /admin/ after normalisation', () => {
    for (const bad of ['/admin/..//evil.com', '//evil.com', 'https://evil.com/admin/', '/admin/../', '/admin/..%2F..%2Fx', '/x/admin/']) {
      const out = safeAdminReturn(bad);
      expect(out.startsWith('/admin/'), bad).toBe(true);
      expect(out.includes('//'), bad).toBe(false);
    }
  });
});

describe('game frames', () => {
  it('allows only partner hosts over https', () => {
    expect(isAllowedEmbed(new URL('https://html5.gamemonetize.co/abc/'))).toBe(true);
    expect(isAllowedEmbed(new URL('https://play.gamepix.com/x/embed?sid=9O09X'))).toBe(true);
    expect(isAllowedEmbed(new URL('https://playgama.com/export/game/x?clid=y'))).toBe(true);
    expect(isAllowedEmbed(new URL('http://html5.gamemonetize.co/abc/'))).toBe(false);
    expect(isAllowedEmbed(new URL('https://evil.example/game'))).toBe(false);
    expect(isAllowedEmbed(new URL('https://html5.gamemonetize.co.evil.example/'))).toBe(false);
  });
  it('dedupes plays per visitor, game and day', () => {
    expect(playKey('v1', 5, '2026-10-02')).toBe(playKey('v1', 5, '2026-10-02'));
    expect(playKey('v1', 5, '2026-10-02')).not.toBe(playKey('v1', 5, '2026-10-03'));
    expect(playKey('v1', 5, '2026-10-02')).not.toBe(playKey('v2', 5, '2026-10-02'));
  });
});

describe('headers', () => {
  it('HSTS covers subdomains, CSP keeps scripts strict', () => {
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toContain('includeSubDomains');
    expect(SECURITY_HEADERS['Content-Security-Policy']).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(SECURITY_HEADERS['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });
});
