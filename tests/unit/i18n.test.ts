import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { detectLang, fromAcceptLanguage, fromCountry, isBot, langFromPath, localePath, stripLocale, LOCALES } from '../../src/i18n/locales.ts';
import { localiseHtml } from '../../src/i18n/links.ts';
import { i18nFor, makeT } from '../../src/i18n/index.ts';

describe('language detection', () => {
  it('uses the browser language first, with q-weights', () => {
    expect(fromAcceptLanguage('cs-CZ,cs;q=0.9,en;q=0.8')).toBe('cs');
    expect(fromAcceptLanguage('en-US,en;q=0.9,cs;q=0.8')).toBe('en');
    expect(fromAcceptLanguage('xx,de;q=0.5')).toBe('de');
    expect(fromAcceptLanguage('zh-TW,zh;q=0.9')).toBe('zh-hant');
    expect(fromAcceptLanguage('zh-CN')).toBe('zh-hans');
    expect(fromAcceptLanguage('zh-Hant-HK')).toBe('zh-hant');
    expect(fromAcceptLanguage('pt-BR')).toBe('pt');
    expect(fromAcceptLanguage('nb-NO')).toBeNull();
    expect(fromAcceptLanguage('')).toBeNull();
  });
  it('falls back to the Cloudflare country, then English', () => {
    expect(fromCountry('CZ')).toBe('cs');
    expect(fromCountry('BR')).toBe('pt');
    expect(fromCountry('TW')).toBe('zh-hant');
    expect(fromCountry('XX')).toBeNull();
    const ua = 'Mozilla/5.0 (Windows NT 10.0) Chrome/140';
    expect(detectLang({ acceptLanguage: null, country: 'SK', ua })).toBe('sk');
    expect(detectLang({ acceptLanguage: 'fr', country: 'SK', ua })).toBe('fr');
    expect(detectLang({ acceptLanguage: null, country: 'SE', ua })).toBe('en');
  });
  it('remembers a manual choice and never redirects bots', () => {
    const ua = 'Mozilla/5.0 Safari/605';
    expect(detectLang({ cookie: 'a=1; pixuvo_lang=ja', acceptLanguage: 'cs', ua })).toBe('ja');
    expect(detectLang({ cookie: 'pixuvo_lang=en', acceptLanguage: 'cs', ua })).toBe('en');
    expect(detectLang({ cookie: 'pixuvo_lang=xx', acceptLanguage: 'cs', ua })).toBe('cs');
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(detectLang({ acceptLanguage: 'cs', country: 'CZ', ua: 'Googlebot' })).toBe('en');
    expect(detectLang({ acceptLanguage: 'cs', ua: null })).toBe('en');
  });
});

describe('paths and links', () => {
  it('maps paths between languages', () => {
    expect(langFromPath('/cs/games/x/')).toBe('cs');
    expect(langFromPath('/games/x/')).toBe('en');
    expect(langFromPath('/zh-hant/')).toBe('zh-hant');
    expect(stripLocale('/cs/racing-games/')).toBe('/racing-games/');
    expect(stripLocale('/cs/')).toBe('/');
    expect(localePath('cs', '/games/')).toBe('/cs/games/');
    expect(localePath('en', '/games/')).toBe('/games/');
  });
  it('localises internal links but not assets, APIs, absolute URLs or the language switcher', () => {
    const html = '<a href="/games/x/">x</a><a href="/_astro/a.js">a</a><a href="https://x.com/">b</a><form action="/search/"></form><a data-keep-href href="/games/">en</a><a href="/cs/games/">c</a><img src="/icons/a.webp"><a href="/api/games/">j</a>';
    const out = localiseHtml(html, 'de');
    expect(out).toContain('href="/de/games/x/"');
    expect(out).toContain('href="/_astro/a.js"');
    expect(out).toContain('href="https://x.com/"');
    expect(out).toContain('action="/de/search/"');
    expect(out).toContain('data-keep-href href="/games/"');
    expect(out).toContain('href="/cs/games/"');
    expect(out).toContain('src="/icons/a.webp"');
    expect(out).toContain('href="/api/games/"');
    expect(localiseHtml(html, 'en')).toBe(html);
  });
});

describe('translations', () => {
  it('every language file is complete and keeps placeholders (scripts/i18n-check.ts)', () => {
    const out = execFileSync('pnpm', ['exec', 'tsx', 'scripts/i18n-check.ts'], { encoding: 'utf8' });
    expect(out.trim().split('\n').filter((l) => /^[a-z-]+: /.test(l)).every((l) => l.endsWith(': OK'))).toBe(true);
  }, 60_000);
  it('plural forms follow the language (Czech 1 / 2–4 / 5+)', () => {
    const t = makeT('cs', { 'c.games_one': '{n} hra', 'c.games_few': '{n} hry', 'c.games_many': '{n} hry', 'c.games_other': '{n} her' });
    expect(t('c.games', { n: 1 })).toBe('1 hra');
    expect(t('c.games', { n: 3 })).toBe('3 hry');
    expect(t('c.games', { n: 12 })).toBe('12 her');
    expect(t('c.games', { n: 2000 })).toBe('2 000 her'.replace(' ', ' '));
  });
  it('falls back to English for missing keys', () => {
    expect(makeT('cs', {})('nav.home')).toBe('Home');
  });
  it('has 23 languages with unique codes', () => {
    expect(LOCALES).toHaveLength(23);
    expect(new Set(LOCALES.map((l) => l.code)).size).toBe(23);
  });
});

describe('category "… games" phrases', () => {
  it('gives a heading form and a mid-sentence form', async () => {
    const en = await i18nFor('en');
    expect(en.catGames('racing')).toEqual({ games: 'Racing Games', gamesLc: 'racing games' });
    const cs = await i18nFor('cs');
    expect(cs.catGames('racing').gamesLc).toBe(cs.catGames('racing').games.charAt(0).toLocaleLowerCase('cs') + cs.catGames('racing').games.slice(1));
  });
  it('keeps German capitals and leading acronyms', async () => {
    const de = await i18nFor('de');
    expect(de.catGames('racing').gamesLc).toBe(de.catGames('racing').games);
    for (const lang of ['en', 'cs', 'hu', 'tr'] as const) {
      const g = (await i18nFor(lang)).catGames('first-person-shooter');
      expect(g.gamesLc, lang).not.toMatch(/(^|\s)f[A-Z]/);
    }
  });
});
