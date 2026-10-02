/**
 * Minimal SQL client used by offline scripts. Two backends:
 *  - D1 over the Cloudflare REST API (production, CI)
 *  - a local SQLite file (tests, and the wrangler `--local` state for dev)
 * Both report rows_read / rows_written so budgets use real numbers where D1 gives them.
 */
import Database from 'better-sqlite3';

export type SqlValue = string | number | null;
export interface Stmt {
  sql: string;
  params?: SqlValue[];
}
export interface Meta {
  rows_read: number;
  rows_written: number;
}
export interface SqlDb {
  readonly kind: 'd1-http' | 'sqlite';
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<{ rows: T[]; meta: Meta }>;
  batch(stmts: Stmt[]): Promise<Meta>;
  close?(): void;
}

export const MAX_PARAMS = 100;

export function assertParams(s: Stmt) {
  if ((s.params?.length ?? 0) > MAX_PARAMS) throw new Error(`statement has ${s.params!.length} params (> ${MAX_PARAMS}): ${s.sql.slice(0, 60)}`);
  if (s.sql.length > 90_000) throw new Error('statement too long for D1');
}

export class SqliteDb implements SqlDb {
  readonly kind = 'sqlite' as const;
  readonly db: Database.Database;
  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = OFF');
  }
  async all<T>(sql: string, params: SqlValue[] = []) {
    assertParams({ sql, params });
    const st = this.db.prepare(sql);
    const rows = (st.reader ? st.all(...params) : (st.run(...params), [])) as T[];
    return { rows, meta: { rows_read: rows.length, rows_written: 0 } };
  }
  async batch(stmts: Stmt[]) {
    let written = 0;
    const tx = this.db.transaction(() => {
      for (const s of stmts) {
        assertParams(s);
        const st = this.db.prepare(s.sql);
        if (st.reader) st.all(...(s.params ?? []));
        else written += st.run(...(s.params ?? [])).changes;
      }
    });
    tx();
    return { rows_read: 0, rows_written: written };
  }
  close() {
    this.db.close();
  }
}

export interface D1HttpConfig {
  accountId: string;
  databaseId: string;
  apiToken?: string | undefined;
  email?: string | undefined;
  globalKey?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export class D1HttpDb implements SqlDb {
  readonly kind = 'd1-http' as const;
  constructor(private cfg: D1HttpConfig) {
    if (!cfg.apiToken && !(cfg.email && cfg.globalKey)) throw new Error('D1 HTTP: no Cloudflare credentials configured');
  }
  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.cfg.apiToken) h.authorization = `Bearer ${this.cfg.apiToken}`;
    else {
      h['x-auth-email'] = this.cfg.email!;
      h['x-auth-key'] = this.cfg.globalKey!;
    }
    return h;
  }
  private async post(body: unknown): Promise<Array<{ results: unknown[]; meta: Meta; success: boolean }>> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.cfg.accountId}/d1/database/${this.cfg.databaseId}/query`;
    const f = this.cfg.fetchImpl ?? fetch;
    for (let attempt = 0; ; attempt++) {
      const res = await f(url, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
      const json = (await res.json().catch(() => null)) as { success?: boolean; result?: unknown; errors?: Array<{ message: string }> } | null;
      if (res.ok && json?.success) return json.result as Array<{ results: unknown[]; meta: Meta; success: boolean }>;
      const msg = json?.errors?.map((e) => e.message).join('; ') ?? `HTTP ${res.status}`;
      const retryable = res.status === 429 || res.status >= 500 || /overloaded|timeout|reset/i.test(msg);
      if (!retryable || attempt >= 4) throw new Error(`D1 query failed: ${msg}`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  async all<T>(sql: string, params: SqlValue[] = []) {
    assertParams({ sql, params });
    const [r] = await this.post({ sql, params });
    return { rows: (r?.results ?? []) as T[], meta: { rows_read: r?.meta?.rows_read ?? 0, rows_written: r?.meta?.rows_written ?? 0 } };
  }
  async batch(stmts: Stmt[]) {
    if (stmts.length === 0) return { rows_read: 0, rows_written: 0 };
    stmts.forEach(assertParams);
    const res = await this.post({ batch: stmts.map((s) => ({ sql: s.sql, params: s.params ?? [] })) });
    return res.reduce<Meta>((a, r) => ({ rows_read: a.rows_read + (r.meta?.rows_read ?? 0), rows_written: a.rows_written + (r.meta?.rows_written ?? 0) }), { rows_read: 0, rows_written: 0 });
  }
}
