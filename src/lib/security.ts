/** Security headers shared by the middleware (SSR) and scripts/postbuild.ts (_headers for static files). */
export const GAME_FRAME_HOSTS = ['https://html5.gamemonetize.co', 'https://html5.gamemonetize.com', 'https://play.gamepix.com'];
export const IMAGE_HOSTS = ['https://img.gamemonetize.com', 'https://img.gamepix.com'];

const TEST_MODE = (typeof process !== 'undefined' && process.env?.PUBLIC_TEST_MODE === '1') || import.meta.env?.PUBLIC_TEST_MODE === '1';

export function csp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${IMAGE_HOSTS.join(' ')}`,
    `frame-src ${TEST_MODE ? "'self' " : ''}${GAME_FRAME_HOSTS.join(' ')} https://challenges.cloudflare.com`,
    "connect-src 'self'",
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
  'Strict-Transport-Security': 'max-age=31536000',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};
