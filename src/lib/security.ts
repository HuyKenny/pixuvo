/** Security headers shared by the middleware (SSR) and scripts/postbuild.ts (_headers for static files). */
export const GAME_FRAME_HOSTS = ['https://html5.gamemonetize.co', 'https://html5.gamemonetize.com', 'https://play.gamepix.com', 'https://playgama.com'];
export const IMAGE_HOSTS = ['https://img.gamemonetize.com', 'https://img.gamepix.com', 'https://static.playgama.com'];

const TEST_MODE = (typeof process !== 'undefined' && process.env?.PUBLIC_TEST_MODE === '1') || import.meta.env?.PUBLIC_TEST_MODE === '1';

export function csp(): string {
  return [
    "default-src 'self'",
    // Google Analytics (consent-gated in src/scripts/analytics.ts).
    "script-src 'self' 'inline-speculation-rules' https://challenges.cloudflare.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${IMAGE_HOSTS.join(' ')} https://www.googletagmanager.com https://*.google-analytics.com`,
    `frame-src ${TEST_MODE ? "'self' " : ''}${GAME_FRAME_HOSTS.join(' ')} https://challenges.cloudflare.com`,
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "font-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': csp(),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-site',
};

/** Game frames may only come from partner hosts the CSP allows. */
export function isAllowedEmbed(u: URL): boolean {
  return u.protocol === 'https:' && GAME_FRAME_HOSTS.includes(u.origin);
}

/** Cache API key that marks "this visitor already started this game today". */
export function playKey(visitor: string, id: number, day: string): string {
  return `https://pixuvo.com/__play-seen/${visitor}/${id}/${day}`;
}

/** Same-site admin path only: `/admin/..//evil.com` normalises to `//evil.com`, so check AFTER parsing. */
export function safeAdminReturn(ret: string): string {
  if (!/^\/admin\/[a-z0-9\-/?=&%._]*$/i.test(ret)) return '/admin/';
  const u = new URL(ret, 'https://pixuvo.com');
  if (u.origin !== 'https://pixuvo.com' || !u.pathname.startsWith('/admin/') || u.pathname.includes('//')) return '/admin/';
  return u.pathname + u.search;
}
