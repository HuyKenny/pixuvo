/** Normalised record produced by every adapter. */
export interface SourceItem {
  providerId: string;
  providerGameId: string;
  title: string;
  description: string;
  instructions: string;
  embedUrl: string;
  thumbUrl: string;
  thumbW: number | null;
  thumbH: number | null;
  width: number | null;
  height: number | null;
  /** Provider category + tags as delivered (trimmed). */
  labels: string[];
  developer: string | null;
  releaseDate: string | null;
  qualityScore: number | null;
  orientation: 'landscape' | 'portrait' | 'any' | null;
  mobileFriendly: 1 | null;
  playersMax: number | null;
  multiplayerMode: 'local' | 'online' | null;
  technology: string | null;
  visualStyle: '2d' | '3d' | 'pixel' | null;
  restrictions: Record<string, unknown>;
}

export type ParseResult = { ok: true; item: SourceItem } | { ok: false; error: string; id?: string };

export interface FeedPage {
  page: number;
  items: unknown[];
  isLast: boolean;
}

export interface AdapterContext {
  fetchJson: (url: string) => Promise<unknown>;
  startPage: number;
  /** Local file for providers without a feed URL. */
  file?: string | undefined;
  config: Record<string, string | undefined>;
}

export interface ProviderAdapter {
  id: string;
  /** Hosts the feed may be fetched from (incl. redirects). */
  feedHosts: string[];
  /** Hosts allowed in embed/thumbnail URLs. */
  embedHosts: string[];
  imageHosts: string[];
  /** Technical readiness (config present). Publishing permission lives in the providers table. */
  ready(config: Record<string, string | undefined>): { ok: true } | { ok: false; reason: string };
  pages(ctx: AdapterContext): AsyncGenerator<FeedPage>;
  parse(raw: unknown, config: Record<string, string | undefined>): ParseResult;
  /** Minimum number of items a complete feed must have before missing-detection is trusted. */
  minCompleteItems: number;
}
