/** Formatting for real play counts (no rounding up, no invented numbers). */
export const MIN_PLAYS_SHOWN = 5;
export function playsLabel(n: number): string {
  if (n >= 10_000) return `${Math.floor(n / 1000)}k`;
  if (n >= 1_000) return `${(Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}
export function rankBadge(i: number, plays?: number): string {
  const place = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
  return plays && plays >= MIN_PLAYS_SHOWN ? `${place} · ${playsLabel(plays)} plays` : place;
}
