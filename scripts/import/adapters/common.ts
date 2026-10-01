import { cleanTitle, htmlToText } from '../../../src/lib/text.ts';
import type { SourceItem } from '../types.ts';

export function toInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : null;
}

export function httpsUrlOnHosts(raw: unknown, hosts: string[]): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' || !hosts.includes(u.hostname) || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function splitLabels(...parts: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const arr = Array.isArray(p) ? p : typeof p === 'string' ? p.split(',') : [];
    for (const x of arr) {
      if (typeof x !== 'string') continue;
      const v = cleanTitle(x).slice(0, 40);
      const k = v.toLowerCase();
      if (v && !seen.has(k)) {
        seen.add(k);
        out.push(v);
      }
    }
  }
  return out.slice(0, 40);
}

export function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1995 || d.getTime() > Date.now() + 86_400_000) return null;
  return d.toISOString().slice(0, 10);
}

/** Attributes the provider itself declared through tags/categories. Unknown stays null. */
export function attributesFromLabels(labels: string[]): Pick<SourceItem, 'mobileFriendly' | 'playersMax' | 'multiplayerMode' | 'technology' | 'visualStyle'> {
  const l = new Set(labels.map((x) => x.toLowerCase().trim()));
  const has = (...k: string[]) => k.some((x) => l.has(x));
  let playersMax: number | null = null;
  let multiplayerMode: 'local' | 'online' | null = null;
  if (has('1 player', 'single player', 'singleplayer')) playersMax = 1;
  if (has('2 player', '2 player games', 'two-player', 'two player', '2 players')) playersMax = 2;
  if (has('.io', 'io', '.io games', 'io games')) multiplayerMode = 'online';
  if (has('multiplayer') && playersMax === null) playersMax = 2;
  if (has('online multiplayer')) multiplayerMode = 'online';
  if (has('local multiplayer', 'same device')) multiplayerMode = 'local';
  const visualStyle = has('pixel', 'pixel art') ? 'pixel' : has('3d', '3d games') ? '3d' : has('2d') ? '2d' : null;
  const technology = has('unity3d', 'unity') ? 'unity' : has('webgl') ? 'webgl' : has('html5', 'h5') ? 'html5' : null;
  const mobileFriendly = has('mobile', 'android', 'iphone', 'ipad', 'mobile games') ? 1 : null;
  return { mobileFriendly, playersMax, multiplayerMode, technology, visualStyle };
}

export function baseText(description: unknown, instructions: unknown) {
  return { description: htmlToText(description, 4000), instructions: htmlToText(instructions, 2000) };
}
