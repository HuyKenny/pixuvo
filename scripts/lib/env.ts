/** Loads configuration for offline scripts: process.env first, then local credential files (never printed). */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2]!;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]!] = v;
  }
  return out;
}

export function loadConfig(): Record<string, string | undefined> {
  const cfg: Record<string, string | undefined> = {};
  const dir = process.env.PIXUVO_CREDENTIALS_DIR ?? join(homedir(), 'ai', 'credentials');
  for (const f of ['.cloudflare-credentials.env', '.pixuvo-credentials.env']) {
    const p = join(dir, f);
    if (existsSync(p)) Object.assign(cfg, Object.fromEntries(Object.entries(parseEnvFile(p)).filter(([, v]) => v !== '')));
  }
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && v !== '') cfg[k] = v;
  return cfg;
}

/**
 * Local wrangler D1 files are named by hashes, and there are two databases (catalog + i18n),
 * so pick the file by its tables: "pixuvo-production" has `games`, "pixuvo-i18n" has `game_translations`.
 */
export function localD1File(root = process.cwd(), name: 'pixuvo-production' | 'pixuvo-i18n' = 'pixuvo-production', stateDir = '.wrangler/state'): string | null {
  const dir = join(root, stateDir, 'v3/d1/miniflare-D1DatabaseObject');
  if (!existsSync(dir)) return null;
  const want = name === 'pixuvo-i18n' ? 'game_translations' : 'games';
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.sqlite') || f === 'metadata.sqlite') continue;
    const path = join(dir, f);
    try {
      const db = new Database(path, { readonly: true, fileMustExist: true });
      const hit = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(want);
      db.close();
      if (hit) return path;
    } catch {
      /* not a database we can read */
    }
  }
  return null;
}
