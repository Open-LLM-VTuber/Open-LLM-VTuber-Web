/**
 * Language display names mapping (FALLBACK ONLY)
 *
 * 백엔드가 이미 label을 제공하므로, 이 매핑은 API 실패 시에만 사용됩니다.
 * 백엔드 I18nManager.LANGUAGE_LABELS와 일치해야 합니다.
 */

/**
 * Get human-readable language name from language code (fallback only)
 *
 * @param code - ISO 639-1 language code (e.g., 'en', 'zh', 'ko')
 * @returns Display name for the language
 *
 * @example
 * // 일반적인 사용 (백엔드 API 사용)
 * const languages = await fetchAvailableLanguages();
 * languages.forEach(lang => console.log(lang.label)); // 백엔드가 제공한 label 사용
 *
 * @example
 * // 폴백 사용 (API 실패 시만)
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
