/**
 * Finds English left on localised pages:
 *   tsx scripts/i18n-audit.ts [--base http://localhost:8799] [--langs cs,de] [--verbose]
 *
 * For each language it loads the main page types and collects visible text plus title, meta description,
 * og:title/description, aria-label, alt, placeholder and JSON-LD. Game links (titles are English by design),
 * the language switcher and "Pixuvo" are removed first. A word counts as English when it is a word of the
 * English UI (src/i18n/messages/en.ts) and does not occur in the same language's own dictionary.
 * Exit code 1 when anything is found.
 */
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import en from '../src/i18n/messages/en.ts';
import { OTHER_LANGS } from '../src/i18n/locales.ts';

const { values } = parseArgs({ options: { base: { type: 'string', default: 'https://pixuvo.com' }, langs: { type: 'string' }, verbose: { type: 'boolean', default: false } } });
const base = values.base!.replace(/\/$/, '');
const langs = values.langs?.split(',') ?? OTHER_LANGS;

// Whole words (diacritics included, so "przeglądarka" is not read as "przegl" + "dark"); only pure a–z words can be English.
const words = (s: string) => (s.toLowerCase().match(/\p{L}[\p{L}']{3,}/gu) ?? []).filter((w) => /^[a-z']+$/.test(w));
// Words that are legitimately the same in many languages or are names.
const ALLOW = new Set(['pixuvo', 'online', 'gamemonetize', 'gamepix', 'playgama', 'google', 'analytics', 'cookie', 'cookies', 'multiplayer', 'puzzle', 'puzzles', 'arcade', 'mahjong', 'sudoku', 'solitaire', 'tetris', 'html', 'wasd', 'space', 'enter', 'shift', 'emoji', 'idle', 'match', 'tower', 'defense', 'stickman', 'zombie', 'zombies', 'parkour', 'pinball', 'bowling', 'golf', 'tennis', 'hockey', 'basketball', 'football', 'soccer', 'baseball', 'billiards', 'snooker', 'ninja', 'pirate', 'pirates', 'robot', 'robots', 'turnstile', 'cloudflare', 'email', 'info', 'privacy', 'android', 'iphone', 'ipad', 'windows', 'chrome', 'firefox', 'safari', 'edge', 'arena', 'mail', 'open', 'font', 'license', 'pixu']);
const enWords = new Set(Object.values(en as Record<string, string>).flatMap(words).filter((w) => !ALLOW.has(w)));

function visible(html: string): string[] {
  const out: string[] = [];
  const attr = (re: RegExp) => { for (const m of html.matchAll(re)) out.push(m[1]!); };
  attr(/<title>([^<]*)<\/title>/g);
  attr(/<meta (?:name="description"|property="og:(?:title|description)") content="([^"]*)"/g);
  attr(/\s(?:aria-label|alt|placeholder|title)="([^"]*)"/g);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const walk = (v: unknown, k = ''): void => {
        if (typeof v === 'string') { if (!['url', 'image', '@type', '@context', 'item', 'name'].includes(k) || k === 'name') out.push(v); }
        else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
        else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) if (!['genre', 'url', 'image', '@id', 'target', 'query-input', 'potentialAction', 'applicationCategory', 'gamePlatform', 'operatingSystem', 'playMode'].includes(kk)) walk(vv, kk);
      };
      walk(JSON.parse(m[1]!));
    } catch { /* ignore */ }
  }
  let body = html
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<a [^>]*href="(?:\/[a-z-]+)?\/games\/[a-z0-9-]+\/"[^>]*>[\s\S]*?<\/a>/g, ' ') // game links: English titles
    .replace(/<details class="langswitch[\s\S]*?<\/details>/g, ' ');
  body = body.replace(/<[^>]+>/g, '\n');
  out.push(...body.split('\n').map((s) => s.trim()).filter(Boolean));
  return out.map(decode).map((s) => s.replace(/pixuvo:[a-z-]+/g, ' '));
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&[a-z#0-9]+;/g, ' ');

async function pagesFor(lang: string): Promise<string[]> {
  const p = ['/', '/categories/', '/racing-games/', '/2-player-games/', '/games/', '/new-games/', '/search/?q=car', '/favorites/', '/parents/', '/about/', '/cookies/', '/no-such-page-xyz/'];
  const api = await fetch(`${base}/api/games/?sort=featured&lang=${lang}`, { headers: { 'accept-language': lang } });
  const slug = ((await api.json()) as { items: Array<{ slug: string }> }).items[0]?.slug;
  if (slug) p.push(`/games/${slug}/`);
  return p.map((x) => `/${lang}${x}`);
}

let total = 0;
for (const lang of langs) {
  // The language's own vocabulary (UI + info pages): words like German "Kind" or Portuguese "serve" are not English there.
  const docs = JSON.parse(readFileSync(`src/i18n/docs/${lang}.json`, 'utf8')) as Record<string, Record<string, string>>;
  const ownText = [...Object.values(JSON.parse(readFileSync(`src/i18n/messages/${lang}.json`, 'utf8')) as Record<string, string>), ...Object.values(docs).flatMap((d) => Object.values(d))];
  const own = new Set(ownText.flatMap((t) => words(t.replace(/<[^>]+>/g, ' '))));
  const found = new Map<string, Set<string>>();
  for (const path of await pagesFor(lang)) {
    const res = await fetch(base + path, { headers: { 'user-agent': 'PixuvoI18nAudit/1.0', 'accept-language': lang } });
    const html = await res.text();
    // Game titles also appear in headings/breadcrumbs/JSON-LD of a game page and in card alt texts: drop them.
    const titles = [...html.matchAll(/<span class="card-title">([^<]*)<\/span>|<h1[^>]*>([^<]*)<\/h1>|data-title="([^"]*)"/g)].map((m) => decode(m[1] ?? m[2] ?? m[3] ?? '').trim().toLowerCase()).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const s of visible(html)) {
      let text = s.toLowerCase();
      for (const t of titles) if (t.length > 2) text = text.split(t).join(' ');
      for (const w of words(text)) {
        if (enWords.has(w) && !own.has(w)) {
          if (!found.has(w)) found.set(w, new Set());
          found.get(w)!.add(`${path}: ${s.slice(0, 90)}`);
        }
      }
    }
  }
  total += found.size;
  console.log(`${lang}: ${found.size ? `${found.size} English words` : 'OK'}`);
  for (const [w, where] of found) console.log(`   ${w}  ←  ${[...where].slice(0, values.verbose ? 10 : 2).join(' | ')}`);
}
process.exit(total ? 1 : 0);
