/**
 * Machine-translates partner game texts (description + how to play) into every
 * site language and stores them in the separate D1 "pixuvo-i18n".
 *
 *   tsx scripts/translate.ts [--top 3000] [--langs cs,de,…] [--max-usd 5] [--max-pairs 100000]
 *                            [--concurrency 4] [--dry-run] [--target remote|local]
 *
 * - Priority: best-ranked published games first (rank_score), so the games people see most get translated first.
 * - Idempotent: a (game, lang) pair is skipped while the English source hash is unchanged.
 * - Budget: stops before the estimated spend (Workers AI neurons × $0.011 / 1 000) or pair cap is reached.
 * - Model: @cf/mistralai/mistral-small-3.1-24b-instruct (measured 2026-10-03: better than m2m100 on our texts,
 *   ~14 neurons per game-language pair ≈ $0.00016).
 */
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';
import { D1HttpDb, SqliteDb, type SqlDb, type Stmt } from './import/db.ts';
import { hashString } from '../src/lib/text.ts';
import { LOCALES, OTHER_LANGS } from '../src/i18n/locales.ts';
import { localD1File } from './lib/env.ts';

const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
const USD_PER_NEURON = 0.011 / 1000;
const SEP = '###';

const { values } = parseArgs({
  options: {
    top: { type: 'string', default: '3000' },
    langs: { type: 'string' },
    'max-usd': { type: 'string', default: '5' },
    'max-pairs': { type: 'string', default: '200000' },
    concurrency: { type: 'string', default: '4' },
    'dry-run': { type: 'boolean', default: false },
    target: { type: 'string', default: 'remote' },
  },
});
const cfg = loadConfig();
const main = openTarget(values.target!, cfg);
const i18n: SqlDb =
  values.target === 'remote'
    ? new D1HttpDb({ accountId: cfg.CF_ACCOUNT_ID!, databaseId: cfg.CF_I18N_DATABASE_ID!, apiToken: cfg.CLOUDFLARE_API_TOKEN, email: cfg.CF_EMAIL, globalKey: cfg.CF_API_KEY })
    : new SqliteDb(localD1File(process.cwd(), 'pixuvo-i18n') ?? (() => { throw new Error('local pixuvo-i18n not found — run wrangler d1 migrations apply pixuvo-i18n --local'); })());
const langs = (values.langs?.split(',') ?? OTHER_LANGS).filter((l) => OTHER_LANGS.includes(l));
const top = Number(values.top);
const maxUsd = Number(values['max-usd']);
const maxPairs = Number(values['max-pairs']);
const conc = Math.max(1, Math.min(8, Number(values.concurrency)));

let neurons = 0;
let pairsDone = 0;
let failures = 0;
const spent = () => neurons * USD_PER_NEURON;

async function ai(messages: Array<{ role: string; content: string }>, attempt = 0): Promise<{ text: string; neurons: number }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfg.CF_ACCOUNT_ID}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: 900, temperature: 0.2 }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt + Math.random() * 500));
    return ai(messages, attempt + 1);
  }
  const d = (await res.json()) as { success?: boolean; result?: { response?: string; usage?: { neurons?: number } }; errors?: unknown };
  if (!res.ok || !d.success) throw new Error(`AI ${res.status} ${JSON.stringify(d.errors).slice(0, 200)}`);
  return { text: (d.result?.response ?? '').trim(), neurons: d.result?.usage?.neurons ?? 0 };
}

function prompt(langName: string): string {
  return [
    `You translate short game descriptions for a free browser-games website for children from English into ${langName}.`,
    'Rules: output ONLY the translation. Simple, friendly, natural language a child understands.',
    'Keep game titles, character names, brand names and key names (WASD, Space, Enter, Shift, letters) unchanged; translate "arrow keys", "mouse", "tap".',
    `The input may have two parts separated by a line "${SEP}". Keep exactly one line "${SEP}" between the translated parts. Do not add anything else.`,
  ].join('\n');
}

function plausible(src: string, out: string): boolean {
  if (!src) return out === '';
  if (!out) return false;
  const r = out.length / src.length;
  return r > 0.2 && r < 4 && !/^(here is|translation|sure[,!])/i.test(out);
}

async function translatePair(g: { id: number; description: string; instructions: string }, lang: string): Promise<Stmt | null> {
  const loc = LOCALES.find((l) => l.code === lang)!;
  const desc = g.description.trim();
  const instr = g.instructions.trim();
  const input = instr ? `${desc}\n${SEP}\n${instr}` : desc;
  const { text, neurons: n } = await ai([
    { role: 'system', content: prompt(`${loc.english} (${loc.name})`) },
    { role: 'user', content: input },
  ]);
  neurons += n;
  const clean = text.replace(/^["“]|["”]$/g, '').trim();
  const [d, ...rest] = clean.split(new RegExp(`\\n?\\s*${SEP}\\s*\\n?`));
  const tDesc = (d ?? '').trim();
  const tInstr = instr ? rest.join(' ').trim() : '';
  if (!plausible(desc, tDesc) || (instr && !plausible(instr, tInstr))) {
    failures++;
    return null;
  }
  return {
    sql: `INSERT INTO game_translations (game_id, lang, description, instructions, source_hash, model, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(game_id, lang) DO UPDATE SET description = excluded.description, instructions = excluded.instructions,
            source_hash = excluded.source_hash, model = excluded.model, updated_at = excluded.updated_at`,
    params: [g.id, lang, tDesc.slice(0, 4000), tInstr.slice(0, 2000), hashString(`${desc}\n${instr}`), MODEL, new Date().toISOString()],
  };
}

const started = new Date().toISOString();
let runId: number | null = null;
if (!values['dry-run']) {
  const r = await i18n.all<{ id: number }>("INSERT INTO translate_runs (started_at, status) VALUES (?, 'running') RETURNING id", [started]);
  runId = r.rows[0]?.id ?? null;
}

let stop = '';
const BATCH = 100;
outer: for (let off = 0; off < top; off += BATCH) {
  const games = (await main.all<{ id: number; description: string; instructions: string }>(
    "SELECT id, description, instructions FROM games WHERE status = 'published' AND description != '' ORDER BY rank_score DESC, id DESC LIMIT ? OFFSET ?",
    [Math.min(BATCH, top - off), off],
  )).rows;
  if (!games.length) break;
  const ids = games.map((g) => g.id);
  const have = new Map<string, string>();
  for (const r of (await i18n.all<{ game_id: number; lang: string; source_hash: string }>(
    `SELECT game_id, lang, source_hash FROM game_translations WHERE game_id IN (${ids.map(() => '?').join(',')})`,
    ids,
  )).rows) have.set(`${r.game_id}:${r.lang}`, r.source_hash);
  const todo: Array<[typeof games[number], string]> = [];
  for (const g of games) {
    const h = hashString(`${g.description.trim()}\n${g.instructions.trim()}`);
    for (const l of langs) if (have.get(`${g.id}:${l}`) !== h) todo.push([g, l]);
  }
  if (values['dry-run']) {
    pairsDone += todo.length;
    continue;
  }
  const writes: Stmt[] = [];
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      if (spent() >= maxUsd) { stop = `budget $${maxUsd} reached`; return; }
      if (pairsDone >= maxPairs) { stop = `pair cap ${maxPairs} reached`; return; }
      const [g, l] = todo[next++]!;
      try {
        const st = await translatePair(g, l);
        if (st) { writes.push(st); pairsDone++; }
      } catch (e) {
        failures++;
        if (failures > 50 && failures > pairsDone) { stop = `too many failures: ${(e as Error).message}`; return; }
      }
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
  for (let i = 0; i < writes.length; i += 40) await i18n.batch(writes.slice(i, i + 40));
  process.stdout.write(`\rgames ${off + games.length}/${top} · pairs ${pairsDone} · failures ${failures} · ~$${spent().toFixed(3)}   `);
  if (stop) break outer;
}
console.log(`\n${values['dry-run'] ? `dry run: ${pairsDone} pairs to translate` : `done: ${pairsDone} pairs, ${failures} rejected, ${neurons.toFixed(0)} neurons ≈ $${spent().toFixed(2)}`}${stop ? ` — stopped: ${stop}` : ''}`);
if (runId) {
  await i18n.batch([{ sql: 'UPDATE translate_runs SET finished_at = ?, status = ?, pairs_done = ?, est_cost_usd = ?, error = ? WHERE id = ?', params: [new Date().toISOString(), stop ? 'stopped' : 'completed', pairsDone, Math.round(spent() * 1000) / 1000, stop || null, runId] }]);
}
main.close?.();
i18n.close?.();
