import { execSync } from 'node:child_process';
import { loadConfig } from './env.ts';

/** Env for wrangler/astro child processes: scoped API token if present, else global key (local only). */
export function cfEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const c = loadConfig();
  const e: NodeJS.ProcessEnv = { ...process.env, ...extra };
  if (c.CLOUDFLARE_API_TOKEN) {
    // Prefer the scoped token; wrangler would otherwise pick up the global key (also via legacy CF_* names).
    for (const k of ['CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CF_API_KEY', 'CF_EMAIL', 'CF_GLOBAL_API_KEY']) delete e[k];
    e.CLOUDFLARE_API_TOKEN = c.CLOUDFLARE_API_TOKEN;
  } else if (c.CF_EMAIL && c.CF_API_KEY) {
    e.CLOUDFLARE_EMAIL = c.CF_EMAIL;
    e.CLOUDFLARE_API_KEY = c.CF_API_KEY;
  }
  if (c.CF_ACCOUNT_ID) e.CLOUDFLARE_ACCOUNT_ID = c.CF_ACCOUNT_ID;
  return e;
}

export function sh(cmd: string, env: NodeJS.ProcessEnv = cfEnv()): void {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', env });
}
