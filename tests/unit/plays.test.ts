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

import { isNewGame } from '../../src/lib/catalog.ts';
import { cardBadge } from '../../src/lib/plays.ts';
describe('card badges', () => {
  it('NEW only after the launch import and within 7 days', () => {
    const now = Date.parse('2026-10-20T00:00:00Z');
    expect(isNewGame('2026-10-02T10:00:00Z', Date.parse('2026-10-03T12:00:00Z'))).toBe(false); // launch import
    expect(isNewGame('2026-10-15T00:00:00Z', now)).toBe(true);
    expect(isNewGame('2026-10-10T00:00:00Z', now)).toBe(false);
    expect(isNewGame(null, now)).toBe(false);
  });
  it('one badge, real data only', () => {
    expect(cardBadge({ plays7d: 30, isNew: true })).toBe('🔥 Hot');
    expect(cardBadge({ isNew: true })).toBe('NEW');
    expect(cardBadge({ plays7d: 3 })).toBeUndefined();
  });
});
