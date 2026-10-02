/**
 * Before any remote migration: record the D1 Time Travel bookmark (restore point,
 * 30 days on Workers Paid / 7 days on Free). `wrangler d1 export` cannot export a
 * database with FTS5 virtual tables, so a full copy is our own paged JSONL dump of
 * every real table (--dump, outside CI; ~1 row read per row). games_fts is rebuilt
 * from games with scripts/rebuild-fts.ts.
 * Restore: wrangler d1 time-travel restore pixuvo-production --bookmark <id>  (OPERATIONS.md)
 */
import { execSync } from 'node:child_process';
import { appendFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createGzip } from 'node:zlib';
import { cfEnv } from './lib/run.ts';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';

const { values } = parseArgs({ options: { dump: { type: 'boolean', default: false } } });
const env = cfEnv();
const info = execSync('pnpm exec wrangler d1 time-travel info pixuvo-production --json', { env, encoding: 'utf8' });
const bookmark = (JSON.parse(info.slice(info.indexOf('{'))) as { bookmark?: string }).bookmark ?? 'unknown';
const stamp = new Date().toISOString();
console.log(`D1 restore bookmark ${stamp}: ${bookmark}`);
if (process.env.CI) process.exit(0);
const dir = join(homedir(), 'ai', 'backups', 'pixuvo');
mkdirSync(dir, { recursive: true });
appendFileSync(join(dir, 'bookmarks.log'), `${stamp} ${bookmark}\n`);
if (!values.dump) process.exit(0);

const db = openTarget('remote', loadConfig());
const out = join(dir, stamp.slice(0, 19).replace(/[:T]/g, '-'));
mkdirSync(out, { recursive: true });
const tables = (await db.all<{ name: string; wr: number }>("SELECT name, instr(sql, 'WITHOUT ROWID') > 0 AS wr FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'games_fts%' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'")).rows;
for (const t of tables) {
  const gz = createGzip();
  gz.pipe(createWriteStream(join(out, `${t.name}.jsonl.gz`)));
  let n = 0;
  if (t.wr) {
    for (let off = 0; ; off += 5000) {
      const rows = (await db.all(`SELECT * FROM "${t.name}" LIMIT 5000 OFFSET ${off}`)).rows;
      for (const r of rows) gz.write(JSON.stringify(r) + '\n');
      n += rows.length;
      if (rows.length < 5000) break;
    }
  } else {
    for (let last = -1; ; ) {
      const rows = (await db.all<{ _rid: number }>(`SELECT rowid AS _rid, * FROM "${t.name}" WHERE rowid > ? ORDER BY rowid LIMIT 5000`, [last])).rows;
      for (const r of rows) gz.write(JSON.stringify(r) + '\n');
      n += rows.length;
      if (rows.length < 5000) break;
      last = rows[rows.length - 1]!._rid;
    }
  }
  gz.end();
  console.log(`  ${t.name}: ${n} rows`);
}
console.log(`dump: ${out}`);
db.close?.();
