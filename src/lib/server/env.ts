import { env as cfEnv } from 'cloudflare:workers';

export interface AppEnv {
  DB: D1Database;
  /** Optional: machine translations of game texts (pixuvo-i18n). */
  I18N?: D1Database;
  ASSETS: Fetcher;
  RL_WRITE?: RateLimit;
  RL_PLAY?: RateLimit;
  /** Cache-missed search/filter reads (D1). */
  RL_READ?: RateLimit;
  ENVIRONMENT?: string;
  SITE_URL?: string;
  ADMIN_DEV_BYPASS?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  CRON_SECRET?: string;
  GH_DISPATCH_TOKEN?: string;
  GH_REPO?: string;
  IP_HASH_SALT?: string;
}

export function getEnv(): AppEnv {
  return cfEnv as unknown as AppEnv;
}

/** local/test only — never true in production even if a variable leaks in. */
export function isLocal(e: AppEnv = getEnv()): boolean {
  return e.ENVIRONMENT === 'local' || e.ENVIRONMENT === 'test';
}
