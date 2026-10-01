import { D1HttpDb, SqliteDb, type SqlDb } from '../import/db.ts';
import { localD1File } from './env.ts';

/** --target local (wrangler --local state) | remote (production D1) | sqlite:<file> */
export function openTarget(target: string, cfg: Record<string, string | undefined>): SqlDb {
  if (target === 'remote') {
    const accountId = cfg.CF_ACCOUNT_ID ?? cfg.CLOUDFLARE_ACCOUNT_ID;
    const databaseId = cfg.CF_D1_DATABASE_ID;
    if (!accountId || !databaseId) throw new Error('CF_ACCOUNT_ID / CF_D1_DATABASE_ID not configured');
    return new D1HttpDb({ accountId, databaseId, apiToken: cfg.CLOUDFLARE_API_TOKEN, email: cfg.CF_EMAIL, globalKey: cfg.CF_API_KEY });
  }
  if (target.startsWith('sqlite:')) return new SqliteDb(target.slice('sqlite:'.length));
  if (target === 'local') {
    const f = localD1File();
    if (!f) throw new Error('local D1 not found — run `pnpm db:migrate:local` first');
    return new SqliteDb(f);
  }
  throw new Error(`unknown target ${target}`);
}
