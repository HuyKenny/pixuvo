/**
 * After a deliberate bulk change of source records (e.g. new partner sid rewritten in SQL),
 * store the payload hash of the CURRENT feed so the next sync sees those items as unchanged
 * instead of rewriting every game. Writes only payload_hash (1 row per changed item).
 *   tsx scripts/rehash-provider.ts --provider gamepix --target remote
 */
import { parseArgs } from 'node:util';
import { ADAPTERS } from './import/adapters/index.ts';
import { fetchJson } from './import/http.ts';
import { hashString, stableStringify } from '../src/lib/text.ts';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { provider: { type: 'string' }, target: { type: 'string', default: 'local' } } });
const adapter = ADAPTERS[values.provider ?? ''];
if (!adapter) throw new Error('--provider required');
const cfg = loadConfig();
const db = openTarget(values.target!, cfg);
const current = new Map((await db.all<{ provider_game_id: string; payload_hash: string; embed_url: string }>('SELECT provider_game_id, payload_hash, embed_url FROM game_sources WHERE provider_id = ?', [adapter.id])).rows.map((r) => [r.provider_game_id, r]));
let stmts: Array<{ sql: string; params: string[] }> = [];
let changed = 0, embedMismatch = 0, seen = 0;
for await (const page of adapter.pages({ startPage: 1, config: cfg, fetchJson: (u, init) => fetchJson(u, { allowHosts: adapter.feedHosts, minIntervalMs: 300, ...(init ?? {}) }) })) {
  for (const raw of page.items) {
    const p = adapter.parse(raw, cfg);
    if (!p.ok) continue;
    seen++;
    const cur = current.get(p.item.providerGameId);
    if (!cur) continue;
    if (cur.embed_url !== p.item.embedUrl) { embedMismatch++; continue; } // real change: leave it to the importer
    const h = hashString(stableStringify(p.item));
    if (h === cur.payload_hash) continue;
    stmts.push({ sql: 'UPDATE game_sources SET payload_hash = ? WHERE provider_id = ? AND provider_game_id = ?', params: [h, adapter.id, p.item.providerGameId] });
    changed++;
    if (stmts.length >= 100) { await db.batch(stmts); stmts = []; }
  }
}
if (stmts.length) await db.batch(stmts);
console.log(`${adapter.id}: ${seen} feed items, ${changed} hashes refreshed, ${embedMismatch} left for the importer (embed differs)`);
db.close?.();
