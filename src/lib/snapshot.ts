/**
 * Build-time catalog snapshot. Import ONLY from prerendered pages — anything that
 * imports this module from an on-demand route would bundle megabytes of JSON
 * into the Worker. `scripts/postbuild.ts` fails the build if that happens.
 */
import siteJson from '../data/snapshot/site.json';
import gamesJson from '../data/snapshot/games.json';
import type { CategoryInfo, GameCard, GameDetail } from './types';
import type { Landing } from './catalog';

export interface Snapshot {
  generatedAt: string;
  dataVersion: string;
  published: number;
  maxDirSeq: number;
  categories: CategoryInfo[];
  home: { featured: GameCard[]; newest: GameCard[]; sections: Array<{ slug: string; name: string; count: number; games: GameCard[] }>; hasPopular: boolean; hasTrending: boolean };
  categoryPages: Record<string, GameCard[]>;
  landings: Array<Landing & { count: number; games: GameCard[] }>;
}

export const snapshot = siteJson as unknown as Snapshot;
export const snapshotGames = gamesJson as unknown as GameDetail[];
