import { describe, expect, it } from 'vitest';
import { playsLabel, rankBadge } from '../../src/lib/plays.ts';

describe('play counts', () => {
  it('never rounds up', () => {
    expect(playsLabel(999)).toBe('999');
    expect(playsLabel(1_000)).toBe('1k');
    expect(playsLabel(1_299)).toBe('1.2k');
    expect(playsLabel(12_999)).toBe('12k');
  });
  it('ranks with medals and only shows meaningful counts', () => {
    expect(rankBadge(0, 120)).toBe('🥇 · 120 plays');
    expect(rankBadge(2)).toBe('🥉');
    expect(rankBadge(5, 3)).toBe('#6');
  });
});
