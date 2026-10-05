/**
 * Builds data/providers/gamezipper.json, the local catalogue the `gamezipper` adapter imports.
 *   tsx scripts/import/gamezipper-catalog.ts [--only slug1,slug2]
 *
 * GameZipper documents a JSON feed (https://gamezipper.com/api/games.json) that returns 404 (checked
 * 2026-10-05), so the catalogue is rebuilt from the public site, politely:
 * - only the games in data/providers/gamezipper-allowlist.json (chosen by search demand, no brand clones);
 * - /js/games-data.js once for names, categories and tags. It is parsed as text, never executed;
 * - one game page per allowlisted slug, 3 s apart (robots.txt asks for Crawl-delay: 1), for the
 *   og:image thumbnail and the JSON-LD (description, how to play, number of players).
 * Games without their own thumbnail (the site-wide og-image) are left out.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fetchText } from './http.ts';

const HOST = 'gamezipper.com';
const BASE = `https://${HOST}`;
const ALLOWLIST = 'data/providers/gamezipper-allowlist.json';
const OUT = 'data/providers/gamezipper.json';

export interface GzGame {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  description: string;
  instructions: string;
  thumbUrl: string;
  players: number | null;
  multiplayer: boolean;
}

/** One `{name:"…",cat:"…",tags:[…],url:"/slug/",desc:"…",…}` literal per game; string values are JSON strings. */
export function parseGamesData(src: string): Map<string, { name: string; cat: string; tags: string[]; desc: string }> {
  const out = new Map<string, { name: string; cat: string; tags: string[]; desc: string }>();
  const str = (obj: string, key: string) => {
    const m = new RegExp(`[{,]${key}:("(?:[^"\\\\]|\\\\.)*")`).exec(obj);
    return m ? (JSON.parse(m[1]!) as string) : '';
  };
  for (const m of src.matchAll(/\{name:"[^\n]*?status:"[a-z]+"\}/g)) {
    const obj = m[0];
    const url = str(obj, 'url');
    const slug = /^\/([a-z0-9-]+)\/$/.exec(url)?.[1];
    if (!slug) continue;
    const t = /[{,]tags:(\[\s*(?:"(?:[^"\\]|\\.)*"\s*,?\s*)*\])/.exec(obj);
    let tags: string[] = [];
    try {
      tags = t ? (JSON.parse(t[1]!) as string[]) : [];
    } catch {
      tags = [];
    }
    out.set(slug, { name: str(obj, 'name'), cat: str(obj, 'cat'), tags, desc: str(obj, 'desc') });
  }
  return out;
}

type Ld = Record<string, unknown>;
function ldBlocks(html: string): Ld[] {
  const out: Ld[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const v = JSON.parse(m[1]!) as unknown;
      for (const x of Array.isArray(v) ? v : [v]) if (x && typeof x === 'object') out.push(x as Ld);
    } catch {
      /* broken block: ignore */
    }
  }
  return out;
}

const meta = (html: string, prop: string) =>
  new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html)?.[1] ?? '';

/** "Play X online free! …text… No download, mobile-friendly!" → the descriptive middle. */
export function cleanDesc(s: string): string {
  return s
    .replace(/^(play|try)\b[^!.]*?\b(online|free)[^!.]*[!.]\s*/i, '')
    .replace(/\s*(no download|no sign-?up|mobile-friendly|free to play)[^.!]*[.!]?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseGamePage(
  slug: string,
  html: string,
  data: { name: string; cat: string; tags: string[]; desc: string },
  /** The documented /og-images/<slug>.png, used when the page only has the site-wide image and it exists. */
  fallbackThumb?: string,
): GzGame | { error: string } {
  const pageOg = meta(html, 'og:image');
  const og = fallbackThumb && /\/og-image\.(webp|png|jpe?g)$/.test(pageOg) ? fallbackThumb : pageOg;
  let thumb: URL;
  try {
    thumb = new URL(og, BASE);
  } catch {
    return { error: 'no og:image' };
  }
  if (thumb.hostname !== HOST || thumb.protocol !== 'https:') return { error: `thumbnail on ${thumb.hostname}` };
  if (/^\/og-image\.(webp|png|jpe?g)$/.test(thumb.pathname)) return { error: 'only the site-wide og-image' };
  const ld = ldBlocks(html);
  const game = ld.find((b) => b['@type'] === 'VideoGame');
  const faq = ld.find((b) => b['@type'] === 'FAQPage');
  const howto = ld.find((b) => b['@type'] === 'HowTo');
  const howQ = ((faq?.mainEntity as Ld[] | undefined) ?? []).find((q) => /how (do you|to) play/i.test(String(q.name ?? '')));
  const howAnswer = String((howQ?.acceptedAnswer as Ld | undefined)?.text ?? '');
  // HowTo steps, minus the generic "open the game page" step.
  const steps = ((howto?.step as Ld[] | undefined) ?? []).map((s) => String(s.text ?? '')).filter((t) => t && !/gamezipper\.com|loads instantly|no download/i.test(t));
  const players = Number((game?.numberOfPlayers as Ld | undefined)?.value);
  const description = cleanDesc(data.desc) || cleanDesc(String(game?.description ?? '')) || meta(html, 'description');
  return {
    slug,
    title: data.name || String(game?.name ?? slug),
    category: data.cat,
    tags: data.tags,
    description,
    instructions: howAnswer || steps.join(' '),
    thumbUrl: thumb.toString(),
    players: Number.isFinite(players) && players > 0 && players < 100 ? players : null,
    multiplayer: /multi/i.test(String(game?.playMode ?? '')),
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { values } = parseArgs({ options: { only: { type: 'string' } } });
  const allow = (JSON.parse(readFileSync(ALLOWLIST, 'utf8')) as { games: Array<{ slug: string }> }).games.map((g) => g.slug);
  const want = values.only ? allow.filter((s) => values.only!.split(',').includes(s)) : allow;
  const opts = { allowHosts: [HOST], minIntervalMs: 3_000, maxBytes: 2 * 1024 * 1024 };
  const data = parseGamesData(await fetchText(`${BASE}/js/games-data.js`, opts));
  console.log(`games-data.js: ${data.size} games, ${want.length} allowlisted`);
  const prev = (() => {
    try {
      return new Map((JSON.parse(readFileSync(OUT, 'utf8')) as { games: GzGame[] }).games.map((g) => [g.slug, g]));
    } catch {
      return new Map<string, GzGame>();
    }
  })();
  const games: GzGame[] = [];
  for (const slug of want) {
    const d = data.get(slug);
    if (!d) {
      console.warn(`  ${slug}: no longer in games-data.js — dropped`);
      continue;
    }
    try {
      const html = await fetchText(`${BASE}/${slug}/`, opts);
      let r = parseGamePage(slug, html, d);
      if ('error' in r && r.error === 'only the site-wide og-image') {
        const alt = `${BASE}/og-images/${slug}.png`;
        await new Promise((res) => setTimeout(res, 3_000));
        const head = await fetch(alt, { method: 'HEAD', redirect: 'manual', headers: { 'user-agent': 'PixuvoCatalogBot/1.0 (+https://pixuvo.com/about/)' } });
        if (head.status === 200 && /^image\//.test(head.headers.get('content-type') ?? '')) r = parseGamePage(slug, html, d, alt);
      }
      if ('error' in r) console.warn(`  ${slug}: ${r.error} — skipped`);
      else games.push(r);
    } catch (e) {
      // Keep the last good entry so one failing page does not make the game disappear.
      const old = prev.get(slug);
      console.warn(`  ${slug}: ${(e as Error).message}${old ? ' — kept previous entry' : ''}`);
      if (old) games.push(old);
    }
  }
  // --only refreshes some entries and keeps the rest.
  if (values.only) for (const [slug, g] of prev) if (!want.includes(slug)) games.push(g);
  games.sort((a, b) => allow.indexOf(a.slug) - allow.indexOf(b.slug));
  writeFileSync(OUT, JSON.stringify({ fetched_at: new Date().toISOString(), source: `${BASE}/js/games-data.js + game pages`, games }, null, 1) + '\n');
  console.log(`wrote ${OUT}: ${games.length} games`);
}
