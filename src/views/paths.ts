/** getStaticPaths helpers shared by the English routes and the /{lang}/ routes. */
import { snapshot, snapshotGames } from '../lib/snapshot';
import { MIN_CATEGORY_GAMES } from '../lib/taxonomy';
import { OTHER_LANGS } from '../i18n/locales';

export function categoryLandingPaths() {
  const cats = snapshot.categories.filter((c) => c.count >= MIN_CATEGORY_GAMES).map((c) => ({ params: { cat: c.slug }, props: { kind: 'category' as const, slug: c.slug } }));
  const lands = snapshot.landings.map((l) => ({ params: { cat: l.slug }, props: { kind: 'landing' as const, slug: l.slug } }));
  return [...cats, ...lands];
}

export const langPaths = () => OTHER_LANGS.map((lang) => ({ params: { lang } }));

export function withLangs<P extends { params: Record<string, string>; props?: unknown }>(paths: P[]) {
  return OTHER_LANGS.flatMap((lang) => paths.map((p) => ({ ...p, params: { ...p.params, lang } })));
}

export const gamePaths = () => snapshotGames.map((g) => ({ params: { slug: g.slug }, props: { game: g } }));
