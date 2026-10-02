import { describe, expect, it } from 'vitest';
import { cleanTitle, dedupeKey, htmlToText, inferControls, isDistinctiveTitle, normTitle, slugify, stripUnsafeChars } from '../../src/lib/text.ts';

describe('text', () => {
  it('turns provider HTML into plain text and drops scripts', () => {
    const out = htmlToText('<p>Hello <b>world</b></p><script>alert(1)</script><img src=x onerror=alert(1)>Bye &amp; <i>see</i> you&nbsp;soon');
    expect(out).toBe('Hello world\nBye & see you soon');
    expect(out).not.toMatch(/[<>]/);
  });
  it('decodes numeric entities safely and removes lone surrogates / control chars', () => {
    expect(htmlToText('&#60;tag&#62; &#x1F600; &#0; &#xD800;')).toBe('<tag> 😀 &#0; &#xD800;');
    expect(stripUnsafeChars('a\u0000b\ud83ec‮d')).toBe('abcd');
  });
  it('truncates at a word boundary', () => {
    expect(htmlToText('one two three four five', 12)).toBe('one two…');
  });
  it('normalises titles and builds stable slugs', () => {
    expect(normTitle('Héllo  Wörld & Co!')).toBe('hello world and co');
    expect(slugify('Moto X3M: Spooky Land')).toBe('moto-x3m-spooky-land');
    expect(slugify('!!!')).toBe('game');
    expect(cleanTitle('<b>Bold</b>   Title ')).toBe('Bold Title');
  });
  it('dedupe key ignores filler words', () => {
    expect(dedupeKey('Snake Game Online')).toBe(dedupeKey('snake'));
    expect(dedupeKey('Neon Racer HTML5')).toBe('neonracer');
  });
  it('distinctive titles need two words and 8+ letters', () => {
    expect(isDistinctiveTitle('Snake')).toBe(false);
    expect(isDistinctiveTitle('2048')).toBe(false);
    expect(isDistinctiveTitle('Neon Turbo Racer')).toBe(true);
  });
  it('infers controls only from instruction wording', () => {
    expect(inferControls('Use arrow keys to move and mouse to aim. Tap on mobile.')).toEqual(['keyboard', 'mouse', 'touch']);
    expect(inferControls('Have fun!')).toEqual([]);
  });
});
