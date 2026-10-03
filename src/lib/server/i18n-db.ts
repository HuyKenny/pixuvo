/**
 * Machine translations of partner texts live in a separate D1 database
 * (binding I18N, "pixuvo-i18n") so the catalog DB stays well under the 500 MB
 * per-database limit. One indexed read per game page.
 */
import { getEnv } from './env';

export interface TranslationLookup {
  translation: { description: string; instructions: string } | null;
  /** Languages with a translation of this game (for hreflang). */
  langs: string[];
}

export async function getTranslation(gameId: number, lang: string): Promise<TranslationLookup> {
  const db = getEnv().I18N;
  if (!db) return { translation: null, langs: [] };
  try {
    const rows = await db
      .prepare('SELECT lang, description, instructions FROM game_translations WHERE game_id = ? LIMIT 40')
      .bind(gameId)
      .all<{ lang: string; description: string; instructions: string }>();
    const list = rows.results ?? [];
    const mine = lang === 'en' ? null : list.find((r) => r.lang === lang);
    return { translation: mine ? { description: mine.description, instructions: mine.instructions } : null, langs: list.map((r) => r.lang) };
  } catch {
    // Translations are optional: a missing table or DB must never break the game page.
    return { translation: null, langs: [] };
  }
}
