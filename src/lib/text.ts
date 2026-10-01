/** Text helpers shared by the importer and the site. No DOM, no Node APIs. */

const ENTITY: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith('#x')) return safeCodePoint(parseInt(k.slice(2), 16)) ?? m;
    if (k.startsWith('#')) return safeCodePoint(parseInt(k.slice(1), 10)) ?? m;
    return ENTITY[k] ?? m;
  });
}

function safeCodePoint(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return null;
  return String.fromCodePoint(n);
}

/**
 * Provider HTML → plain text. We never store or render provider HTML: tags are
 * dropped (block tags become line breaks), entities decoded, control chars and
 * lone surrogates removed, whitespace collapsed. Output is rendered escaped.
 */
export function htmlToText(input: unknown, maxLen = 5000): string {
  if (typeof input !== 'string') return '';
  let s = input
    .replace(/<\s*(script|style|iframe|object|embed|noscript)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/?\s*(p|div|li|ul|ol|h[1-6]|tr|table|section|article)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s);
  s = stripUnsafeChars(s);
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (s.length > maxLen) s = s.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
  return s;
}

export function stripUnsafeChars(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '');
}

export function cleanTitle(input: unknown): string {
  if (typeof input !== 'string') return '';
  return stripUnsafeChars(decodeEntities(input.replace(/<[^>]*>/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Lowercase ASCII form used for exact/prefix matching and duplicate detection. */
export function normTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Title key for duplicate detection: ignores trivial suffixes like "game", "online", "html5". */
export function dedupeKey(title: string): string {
  return normTitle(title)
    .replace(/\b(the|game|games|online|html5|free|play|new|io)\b/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

export function slugify(s: string, maxLen = 80): string {
  const out = normTitle(s).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return out.slice(0, maxLen).replace(/-+$/, '') || 'game';
}

/** Word shingles for description similarity. */
export function shingles(s: string, n = 3): Set<string> {
  const w = normTitle(s).split(' ').filter((x) => x.length > 1);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

const STOP = new Set('a an and are as at be but by can for from has have in into is it its of on or that the their them then there these this to up was will with you your yours our we all any each more most other some such than too very just only also over out off get got make made use using play player players game games level levels way new one two'.split(' '));

/** Content words (no stopwords, ≥3 chars, crude plural folding) for loose topical similarity. */
export function contentWords(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of normTitle(s).split(' ')) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.add(w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
  }
  return out;
}

/** A title is distinctive when it is unlikely to be shared by unrelated games. */
export function isDistinctiveTitle(title: string): boolean {
  const n = normTitle(title);
  const words = n.split(' ').filter(Boolean);
  return n.replace(/ /g, '').length >= 8 && words.length >= 2;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Deterministic controls parser over the provider's own instruction text.
 * Stored as `controls_inferred` — shown as "mentioned in instructions", never as a guarantee.
 */
export function inferControls(instructions: string): string[] {
  const t = instructions.toLowerCase();
  const out: string[] = [];
  if (/\b(arrow keys?|wasd|keyboard|space ?bar|spacebar|press [a-z0-9]\b|enter key|shift key|ctrl)\b/.test(t)) out.push('keyboard');
  if (/\b(mouse|left[- ]click|right[- ]click|click|drag)\b/.test(t)) out.push('mouse');
  if (/\b(tap|touch|swipe|touchscreen)\b/.test(t)) out.push('touch');
  return out;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

/** Stable FNV-1a 64-bit hex hash (no crypto needed; used for change detection only). */
export function hashString(s: string): string {
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x01000193 | 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** Stable JSON (sorted keys) for hashing. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
}
