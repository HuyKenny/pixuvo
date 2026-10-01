import type { Param, Q } from '../catalog';
import { getEnv } from './env';

/** D1 wrapper implementing the runtime-agnostic Q interface; accumulates D1 meta for logging. */
export class D1Q implements Q {
  rowsRead = 0;
  rowsWritten = 0;
  queries = 0;
  constructor(private db: D1Database) {}
  async all<T>(sql: string, params: Param[] = []): Promise<T[]> {
    this.queries++;
    const res = await this.db.prepare(sql).bind(...params).all<T>();
    this.rowsRead += res.meta?.rows_read ?? 0;
    this.rowsWritten += res.meta?.rows_written ?? 0;
    return res.results ?? [];
  }
  async run(sql: string, params: Param[] = []): Promise<D1Result> {
    this.queries++;
    const res = await this.db.prepare(sql).bind(...params).run();
    this.rowsRead += res.meta?.rows_read ?? 0;
    this.rowsWritten += res.meta?.rows_written ?? 0;
    return res;
  }
  async batch(stmts: Array<{ sql: string; params?: Param[] }>): Promise<void> {
    if (!stmts.length) return;
    this.queries += stmts.length;
    const res = await this.db.batch(stmts.map((s) => this.db.prepare(s.sql).bind(...(s.params ?? []))));
    for (const r of res) {
      this.rowsRead += r.meta?.rows_read ?? 0;
      this.rowsWritten += r.meta?.rows_written ?? 0;
    }
  }
}

export function q(): D1Q {
  return new D1Q(getEnv().DB);
}

let versionCache: { v: string; at: number } | null = null;
/** data_version (bumped by every catalog change); memoised per isolate for 60 s. */
export async function dataVersion(db: D1Q): Promise<string> {
  const now = Date.now();
  if (versionCache && now - versionCache.at < 60_000) return versionCache.v;
  const rows = await db.all<{ value: string }>("SELECT value FROM site_settings WHERE key = 'data_version' LIMIT 1");
  versionCache = { v: rows[0]?.value ?? '0', at: now };
  return versionCache.v;
}

let catCache: { at: number; v: string; cats: import('../types').CategoryInfo[] } | null = null;
export async function categoriesCached(db: D1Q): Promise<import('../types').CategoryInfo[]> {
  const v = await dataVersion(db);
  if (catCache && catCache.v === v && Date.now() - catCache.at < 300_000) return catCache.cats;
  const { getCategories } = await import('../catalog');
  const cats = await getCategories(db);
  catCache = { at: Date.now(), v, cats };
  return cats;
}
