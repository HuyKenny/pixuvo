/** Rebuilds games_fts from games/tags/categories (after a restore or a taxonomy rename). Batched. */
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/env.ts';
import { openTarget } from './lib/target.ts';
const { values } = parseArgs({ options: { target: { type: 'string', default: 'local' } } });
const db = openTarget(values.target!, loadConfig());
await db.batch([{ sql: 'DELETE FROM games_fts' }]);
let last = 0;
for (;;) {
  const ids = (await db.all<{ id: number }>("SELECT id FROM games WHERE id > ? AND status != 'merged' ORDER BY id LIMIT 500", [last])).rows.map((r) => r.id);
  if (!ids.length) break;
  await db.batch([{
    sql: `INSERT INTO games_fts (rowid, title, aliases, developer, labels)
          SELECT g.id, g.title, coalesce((SELECT group_concat(alias, ' ') FROM game_aliases a WHERE a.game_id = g.id), ''), '',
                 trim(coalesce((SELECT group_concat(c.name, ' ') FROM game_categories gc JOIN categories c ON c.id = gc.category_id WHERE gc.game_id = g.id), '') || ' ' ||
                      coalesce((SELECT group_concat(t.name, ' ') FROM game_tags gt JOIN tags t ON t.id = gt.tag_id WHERE gt.game_id = g.id), ''))
            FROM games g WHERE g.id IN (${ids.map(() => '?').join(',')})`,
    params: ids,
  }]);
  last = ids[ids.length - 1]!;
  process.stdout.write(`\rindexed up to ${last}`);
}
console.log('\ndone');
db.close?.();
