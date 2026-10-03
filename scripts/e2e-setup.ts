/**
 * Prepares the e2e environment: fresh local D1 under tmp/e2e-state with a fixture
 * catalog (real partner records, stored in tests/fixtures), snapshot, and a
 * test-mode build (fixture iframe instead of partner games, consent test script).
 */
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { localD1File } from './lib/env.ts';
import { SqliteDb } from './import/db.ts';
import { runImport } from './import/pipeline.ts';
import { gamemonetize } from './import/adapters/gamemonetize.ts';
import { gamepix } from './import/adapters/gamepix.ts';

const STATE = 'tmp/e2e-state';
rmSync(STATE, { recursive: true, force: true });
execSync(`pnpm exec wrangler d1 migrations apply pixuvo-production --local --persist-to ${STATE}`, { stdio: 'inherit', env: { ...process.env, CI: '1' } });
const file = localD1File(process.cwd(), 'pixuvo-production', STATE)!;
const db = new SqliteDb(file);
const cfg = { GAMEMONETIZE_FEED_URL: 'https://gamemonetize.com/feed.php?format=0', GAMEPIX_SID: 'M7X08' };
const gm = JSON.parse(readFileSync('tests/fixtures/gm-sample.json', 'utf8'));
const gp = JSON.parse(readFileSync('tests/fixtures/gp-sample.json', 'utf8'));
const now = new Date('2026-10-01T12:00:00Z');
const r1 = await runImport(db, gamemonetize, { dryRun: false, budgetRows: 1e7, config: cfg, minCompleteItems: 1, now, fetchJson: async (u) => (new URL(u).searchParams.get('page') === '1' ? gm : []) });
const r2 = await runImport(db, gamepix, { dryRun: false, budgetRows: 1e7, config: cfg, minCompleteItems: 1, now, fetchJson: async () => gp });
console.log(`e2e catalog: ${r1.inserted} + ${r2.inserted} games (${r2.attached} attached)`);
db.close();
execSync(`pnpm exec tsx scripts/snapshot.ts --target sqlite:${file} --games 60`, { stdio: 'inherit' });
execSync('pnpm exec astro build && pnpm exec tsx scripts/postbuild.ts', {
  stdio: 'inherit',
  env: { ...process.env, PUBLIC_TEST_MODE: '1', PUBLIC_CONSENT_CATEGORIES: 'analytics', PUBLIC_ANALYTICS_SRC: '/e2e-fixture/analytics.js', BUILD_ID: 'e2e' },
});
writeFileSync('dist/server/.dev.vars', 'ENVIRONMENT=test\nADMIN_DEV_BYPASS=0\nIP_HASH_SALT=e2e-salt\nCRON_SECRET=e2e-cron-secret-e2e-cron-secret-e2e-cron\n');
console.log('e2e build ready');
