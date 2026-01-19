/**
 * Language display names mapping (FALLBACK ONLY)
 *
 * Backend already provides labels, this mapping is only used when API fails.
 * Should match backend I18nManager.LANGUAGE_LABELS.
 */

/**
 * Get human-readable language name from language code (fallback only)
 *
 * @param code - ISO 639-1 language code (e.g., 'en', 'zh', 'ko')
 * @returns Display name for the language
 *
 * @example
 * // Normal usage (use backend API)
 * const languages = await fetchAvailableLanguages();
 * languages.forEach(lang => console.log(lang.label)); // Use backend-provided label
 *
 * @example
 * // Fallback usage (only when API fails)
 * const fallbackLabel = getLanguageLabel('ko'); // "한국어"
 */
export function getLanguageLabel(code: string): string {
  const languageMap: Record<string, string> = {
    en: 'English',
    zh: '中文',
    ko: '한국어',
    ja: '日本語',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    ru: 'Русский',
    pt: 'Português',
    it: 'Italiano',
  };

  return languageMap[code] || code.toUpperCase();
}
