export interface GameCard {
  id: number;
  slug: string;
  title: string;
  thumb: string;
  /** Primary category name, if any. */
  cat: string | null;
  mobile: boolean;
  players: number | null;
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
  related: GameCard[];
}

export type ListSort = 'featured' | 'new' | 'az';

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}
