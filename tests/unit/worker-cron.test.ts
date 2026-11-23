import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Since 23 Nov 2026 (Workers Free: 5 cron triggers per account, reserved for another project) the sync is scheduled by
// GitHub Actions (.github/workflows/sync.yml, Mon + Thu). Earlier the daily sync stopped for 11 days (3.–14. 10. 2026)
// because a refactor dropped the trigger, so the schedule is guarded here.
describe('sync schedule wiring', () => {
  it('has no Cloudflare cron trigger and a GitHub schedule that runs the static build', () => {
    const cfg = readFileSync('wrangler.jsonc', 'utf8');
    const wf = readFileSync('.github/workflows/sync.yml', 'utf8');
    expect(cfg).toMatch(/"crons":\s*\[\s*\]/);
    expect(wf).toMatch(/schedule:\s*\n\s*- cron: '[^']+'/);
    expect(wf).toMatch(/scripts\/static\/build\.sh/);
  });
});
