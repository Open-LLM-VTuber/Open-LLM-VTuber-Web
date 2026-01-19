/**
 * API utility for fetching available languages from backend
 *
 * Backend API changes (v2.0+):
 * - Before: languages: string[] (e.g., ["en", "zh", "ko"])
 * - Now: languages: LanguageInfo[] (e.g., [{code: "en", label: "English"}, ...])
 * - Backend now provides native language labels directly
 */

/**
 * Default backend base URL
 */
export const DEFAULT_BASE_URL = 'http://localhost:12393';

export interface LanguageInfo {
  code: string;
  label: string;
}

export interface LanguageApiResponse {
  type: string;
  count: number;
  languages: LanguageInfo[];
}

/**
 * Fetch available languages from backend /api/languages endpoint
 *
 * @param baseUrl - Backend base URL (default: DEFAULT_BASE_URL)
 * @returns Promise<LanguageInfo[]> - Array of language objects with code and label
 * @throws Error if API call fails
 */
export async function fetchAvailableLanguages(
  baseUrl: string = DEFAULT_BASE_URL
): Promise<LanguageInfo[]> {
  try {
    const response = await fetch(`${baseUrl}/api/languages`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: LanguageApiResponse = await response.json();

    // Validate response
    if (!data.languages || !Array.isArray(data.languages)) {
      throw new Error('Invalid API response format');
    }

    // Backend already provides {code, label} format, return as-is
    return data.languages;
  } catch (error) {
    console.error('Error fetching languages from API:', error);
    throw error;
  }
}

/**
 * Fetch available languages with fallback
 *
 * @param baseUrl - Backend base URL (default: DEFAULT_BASE_URL)
 * @returns Promise<LanguageInfo[]> - Array of language objects (never fails)
 */
export async function fetchLanguagesWithFallback(
  baseUrl: string = DEFAULT_BASE_URL
): Promise<LanguageInfo[]> {
  try {
    return await fetchAvailableLanguages(baseUrl);
  } catch (error) {
    console.warn('Failed to fetch languages, using fallback:', error);
    // Fallback to default languages with labels
    return [
      { code: 'en', label: 'English' },
      { code: 'zh', label: '中文' },
    ];
  }
}
