/**
 * catalog:publish — make catalog changes visible on the static part of the site.
 *   snapshot (from D1) → production build → guards → [deploy] → published_version → live verification
 * Skips the deploy when neither data_version nor the code (git sha) changed since the last publish.
 *
 *   tsx scripts/publish.ts --target remote --deploy [--force] [--preview]
 */
import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/env.ts';
import { cfEnv, sh } from './lib/run.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { target: { type: 'string', default: 'remote' }, deploy: { type: 'boolean', default: false }, force: { type: 'boolean', default: false }, preview: { type: 'boolean', default: false }, games: { type: 'string', default: '3000' } } });
const cfg = loadConfig();
const db = openTarget(values.target!, cfg);
const get = async (k: string) => (await db.all<{ value: string }>('SELECT value FROM site_settings WHERE key = ?', [k])).rows[0]?.value ?? null;
const dataVersion = (await get('data_version')) ?? '0';
const publishedVersion = await get('published_version');
const publishedSha = await get('published_sha');
let sha = process.env.GITHUB_SHA ?? '';
try {
  sha ||= execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch {
  sha ||= 'unknown';
}
if (values.deploy && !values.force && !values.preview && dataVersion === publishedVersion && sha === publishedSha) {
  console.log(`nothing to publish (data_version ${dataVersion}, code ${sha.slice(0, 7)} already live)`);
  process.exit(0);
}

sh(`pnpm exec tsx scripts/snapshot.ts --target ${values.target} --games ${values.games}`);
const buildEnv = cfEnv({ BUILD_ID: `${dataVersion}-${sha.slice(0, 7)}`, ...(values.preview ? { PUBLIC_NOINDEX: '1' } : {}) });
for (const k of ['PUBLIC_TEST_MODE', 'PUBLIC_CONSENT_CATEGORIES', 'PUBLIC_ANALYTICS_SRC']) delete buildEnv[k];
if (cfg.TURNSTILE_SITE_KEY) buildEnv.PUBLIC_TURNSTILE_SITE_KEY = cfg.TURNSTILE_SITE_KEY;
sh('pnpm exec astro build', buildEnv);
sh('pnpm exec tsx scripts/postbuild.ts', buildEnv);
sh('rm -f dist/server/.dev.vars', buildEnv);

if (!values.deploy) {
  console.log('build ready (no --deploy given)');
  process.exit(0);
}
sh('pnpm exec wrangler deploy -c dist/server/wrangler.json', buildEnv);
if (!values.preview) {
  const now = new Date().toISOString();
  await db.batch([
    { sql: "INSERT INTO site_settings (key, value, updated_at) VALUES ('published_version', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", params: [dataVersion, now] },
    { sql: "INSERT INTO site_settings (key, value, updated_at) VALUES ('published_sha', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", params: [sha, now] },
  ]);
  sh('pnpm exec tsx scripts/verify-launch.ts --quick');
}
console.log(`published data_version ${dataVersion} (code ${sha.slice(0, 7)})`);
db.close?.();
