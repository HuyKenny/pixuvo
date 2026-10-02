import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteDb } from '../scripts/import/db.ts';
import type { Q } from '../src/lib/catalog.ts';

/** Fresh SQLite database with all migrations applied (same SQL as D1). */
export function freshDb(): SqliteDb {
  const dir = mkdtempSync(join(tmpdir(), 'pixuvo-test-'));
  const db = new SqliteDb(join(dir, 'test.sqlite'));
  for (const f of readdirSync('migrations').filter((x) => x.endsWith('.sql')).sort()) db.db.exec(readFileSync(join('migrations', f), 'utf8'));
  return db;
}

export function asQ(db: SqliteDb): Q {
  return { all: async (sql, params = []) => (await db.all(sql, params as never)).rows as never };
}

export function gmItem(id: number, over: Record<string, unknown> = {}) {
  return {
    id: String(id),
    title: `Test Game ${id}`,
    description: `Description of test game number ${id} with some words about racing cars and tracks.`,
    instructions: 'Use arrow keys to drive. Press space to jump.',
    url: `https://html5.gamemonetize.co/hash${id}/`,
    category: 'Racing',
    tags: 'car, racing, 2 player, html5',
    thumb: `https://img.gamemonetize.com/hash${id}/512x384.jpg`,
    width: '800',
    height: '600',
    ...over,
  };
}

/** fetchJson stub serving GameMonetize-style pages (array per page; short page = last). */
export function gmFeed(pages: unknown[][], opts: { failOnPage?: number } = {}) {
  return async (url: string) => {
    const page = Number(new URL(url).searchParams.get('page'));
    if (opts.failOnPage === page) throw new Error('simulated feed outage');
    return pages[page - 1] ?? [];
  };
}

export const GM_CONFIG = { GAMEMONETIZE_FEED_URL: 'https://gamemonetize.com/feed.php?format=0', GAMEPIX_SID: 'M7X08' };
