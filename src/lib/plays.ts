/** Formatting for real play counts (no rounding up, no invented numbers). */
type T = (key: string, vars?: Record<string, string | number>) => string; // structurally compatible with i18n T
const enT: T = (key, vars) =>
  key === 'badge.hot' ? '🔥 Hot' : key === 'badge.new' ? 'NEW' : `${vars?.place} · ${vars?.plays} plays`;

export const MIN_PLAYS_SHOWN = 5;
export function playsLabel(n: number): string {
  if (n >= 10_000) return `${Math.floor(n / 1000)}k`;
  if (n >= 1_000) return `${(Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}
export function rankBadge(i: number, plays?: number, t: T = enT): string {
  const place = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
  return plays && plays >= MIN_PLAYS_SHOWN ? t('badge.plays', { place, plays: playsLabel(plays) }) : place;
}

/** At most one status badge per card, from real data only: 🔥 HOT (≥ 25 plays this week) beats NEW. */
export const HOT_PLAYS = 25;
export function cardBadge(g: { plays7d?: number; isNew?: boolean }, t: T = enT): string | undefined {
  if ((g.plays7d ?? 0) >= HOT_PLAYS) return t('badge.hot');
  if (g.isNew) return t('badge.new');
  return undefined;
}
