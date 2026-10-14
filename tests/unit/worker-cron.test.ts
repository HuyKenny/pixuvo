import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The daily sync stopped for 11 days (3.–14. 10. 2026) because a refactor of src/worker.ts dropped scheduled().
describe('worker cron wiring', () => {
  it('declares a cron trigger and exports a scheduled handler that dispatches the sync', () => {
    const cfg = readFileSync('wrangler.jsonc', 'utf8');
    const src = readFileSync('src/worker.ts', 'utf8');
    expect(cfg).toMatch(/"crons":\s*\[\s*"[^"]+"/);
    expect(src).toMatch(/async scheduled\(/);
    expect(src).toMatch(/dispatchSync\(/);
  });
});
