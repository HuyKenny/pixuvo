export interface GameCard {
  id: number;
  slug: string;
  title: string;
  thumb: string;
  /** Primary category name (English), if any. */
  cat: string | null;
  /** Primary category slug (for translated names). */
  catSlug?: string | null;
  mobile: boolean;
  players: number | null;
  /** Times the game was started on Pixuvo in the last 7 days (counted once per visitor and day). */
  plays7d?: number;
  /** Added to Pixuvo in the last 7 days (after the launch import). */
  isNew?: boolean;
}

export interface CategoryRef {
  slug: string;
  name: string;
}

export interface CategoryInfo extends CategoryRef {
  id: number;
  kind: 'genre' | 'subgenre' | 'mode';
  parent: string | null;
  blurb: string;
  nav: boolean;
  count: number;
}

export interface GameDetail extends GameCard {
  description: string;
  instructions: string;
  controls: string[];
  categories: CategoryRef[];
  tags: CategoryRef[];
  primaryCategory: CategoryRef | null;
  releaseDate: string | null;
  addedAt: string;
  updatedAt: string;
  orientation: string | null;
  multiplayerMode: string | null;
  technology: string | null;
  visualStyle: string | null;
  ratingUp: number;
  ratingDown: number;
  providerName: string | null;
  width: number | null;
  height: number | null;
  /** Declared by the partner (Playgama); false when unknown. */
  inAppPurchases: boolean;
  related: GameCard[];
  /** Next games of the primary category by id (chain through the whole category, see neighborGames). */
  neighbors?: GameCard[];
}

export type ListSort = 'featured' | 'new' | 'az';

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}
