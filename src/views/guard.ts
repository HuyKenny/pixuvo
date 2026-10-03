import { DEFAULT_LANG, isLang } from '../i18n/locales';
/** On-demand /{lang}/ routes: only real non-English language codes. */
export const validLang = (x: string | undefined): boolean => isLang(x) && x !== DEFAULT_LANG;
