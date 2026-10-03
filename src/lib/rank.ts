/**
 * Ordering score used for "Featured" lists and default category order.
 * Inputs are real signals only; a game with no signal gets the neutral base.
 *  - provider quality score (GamePix, 0..1)
 *  - Pixuvo play clicks in the last 7 days (log-scaled)
 *  - Pixuvo user ratings (needs ≥ 5 votes to count)
 *  - search demand for the game's own title (monthly Google searches, Ahrefs; hero games), log-scaled
 */
export interface RankInput {
  qualityScore: number | null;
  plays7d: number;
  ratingUp: number;
  ratingDown: number;
  searchVolume?: number;
}

export const NEUTRAL_QUALITY = 0.35;

export function rankScore(g: RankInput): number {
  const q = g.qualityScore ?? NEUTRAL_QUALITY;
  const plays = Math.log10(1 + Math.max(0, g.plays7d)) / 4; // 10k plays ≈ +1
  const votes = g.ratingUp + g.ratingDown;
  const rating = votes >= 5 ? (g.ratingUp / votes - 0.5) * 0.4 : 0;
  const demand = Math.log10(1 + Math.max(0, g.searchVolume ?? 0)) / 12; // 100k searches ≈ +0.42
  return Math.round((q + plays + rating + demand) * 1e6) / 1e6;
}
