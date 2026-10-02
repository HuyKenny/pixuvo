/**
 * pnpm import:games  [--provider gamemonetize|gamepix|all] [--target local|remote|sqlite:<f>]
 *                    [--budget 90000] [--resume] [--start-page N] [--cache-dir dir] [--technical-only]
 * pnpm import:dry-run  (same flags, no writes; prints the plan and an estimate)
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { ADAPTERS } from './adapters/index.ts';
import { fetchJson } from './http.ts';
import { runImport, type RunReport } from './pipeline.ts';
import { loadConfig } from '../lib/env.ts';
import { openTarget } from '../lib/target.ts';

const { values } = parseArgs({
  options: {
    provider: { type: 'string', default: 'all' },
    target: { type: 'string', default: 'local' },
    budget: { type: 'string', default: '90000' },
    'dry-run': { type: 'boolean', default: false },
    resume: { type: 'boolean', default: false },
    'start-page': { type: 'string' },
    'cache-dir': { type: 'string' },
    'technical-only': { type: 'boolean', default: false },
    json: { type: 'string' },
  },
});

const cfg = loadConfig();
const db = openTarget(values.target!, cfg);
const providers = values.provider === 'all' ? ['gamemonetize', 'gamepix', 'playgama'] : values.provider!.split(',');
let budget = Number(values.budget);
if (!Number.isFinite(budget) || budget <= 0) throw new Error('--budget must be a positive number');

const reports: RunReport[] = [];
let failed = false;
for (const id of providers) {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`unknown provider ${id}`);
  const ready = adapter.ready(cfg);
  if (!ready.ok) {
    console.log(`skip ${id}: ${ready.reason}`);
    continue;
  }
  const minInterval = id === 'gamemonetize' ? 8_000 : 400; // GameMonetize answers Cloudflare 1015 to bursts
  const fetcher = cached(values['cache-dir'], (url, init) => fetchJson(url, { allowHosts: adapter.feedHosts, minIntervalMs: minInterval, ...(init ?? {}) }));
  const rep = await runImport(db, adapter, {
    dryRun: values['dry-run']!,
    budgetRows: budget,
    resume: values.resume,
    startPage: values['start-page'] ? Number(values['start-page']) : undefined,
    technicalOnly: values['technical-only'],
    config: cfg,
    fetchJson: fetcher,
    log: (m) => console.log(m),
  });
  reports.push(rep);
  budget -= values['dry-run'] ? rep.estimatedRows : rep.rowsWritten;
  console.log(summary(rep));
  if (rep.status === 'failed') failed = true;
  if (rep.status === 'budget_stopped' || budget < 1000) {
    console.log('budget exhausted — remaining providers are left for the next run');
    break;
  }
}
if (values.json) writeFileSync(values.json, JSON.stringify(reports, null, 2));
db.close?.();
process.exit(failed ? 1 : 0);

function summary(r: RunReport): string {
  return [
    `── ${r.provider}: ${r.status}${r.error ? ` (${r.error})` : ''}`,
    `   pages ${r.pagesFetched}, items ${r.itemsSeen} (invalid ${r.itemsInvalid}), complete feed: ${r.completeFeed}`,
    `   new ${r.inserted}, attached to existing ${r.attached}, updated ${r.updated}, unchanged ${r.unchanged}, reactivated ${r.reactivated}`,
    `   to review ${r.reviewQueued}, duplicate candidates ${r.duplicateCandidates}, marked missing ${r.markedMissing}, archived ${r.archived}`,
    `   rows written ${r.rowsWritten} (estimate ${r.estimatedRows}), rows read ${r.rowsRead}`,
    r.checkpoint ? `   checkpoint: page ${r.checkpoint.page} (resume with --resume)` : '',
    r.invalidSamples.length ? `   invalid samples: ${r.invalidSamples.slice(0, 5).join(' | ')}` : '',
  ].filter(Boolean).join('\n');
}

type Init = { method?: 'GET' | 'POST'; body?: unknown };
function cached(dir: string | undefined, f: (url: string, init?: Init) => Promise<unknown>) {
  if (!dir) return f;
  mkdirSync(dir, { recursive: true });
  return async (url: string, init?: Init) => {
    const p = join(dir, createHash('sha1').update(url + JSON.stringify(init?.body ?? '')).digest('hex') + '.json');
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
    const v = await f(url, init);
    writeFileSync(p, JSON.stringify(v));
    return v;
  };
}
