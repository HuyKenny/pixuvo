/** Ad-hoc read-only SQL for operations: tsx scripts/sql.ts --target remote "SELECT ..." (writes need --write). */
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';
const { values, positionals } = parseArgs({ allowPositionals: true, options: { target: { type: 'string', default: 'local' }, write: { type: 'boolean', default: false } } });
const db = openTarget(values.target!, loadConfig());
for (const sql of positionals) {
  if (!values.write && !/^\s*(SELECT|WITH|EXPLAIN|PRAGMA table_info)\b/i.test(sql)) throw new Error('read-only by default; pass --write for changes');
  const r = await db.all(sql);
  console.table(r.rows);
  if (r.meta.rows_read || r.meta.rows_written) console.log(`rows_read=${r.meta.rows_read} rows_written=${r.meta.rows_written}`);
}
db.close?.();
