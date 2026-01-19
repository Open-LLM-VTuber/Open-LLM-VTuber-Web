/**
 * API utility for fetching available languages from backend
 *
 * 백엔드 API 변경사항 (v2.0+):
 * - 이전: languages: string[] (예: ["en", "zh", "ko"])
 * - 현재: languages: LanguageInfo[] (예: [{code: "en", label: "English"}, ...])
 * - 백엔드가 이제 네이티브 언어 라벨을 직접 제공합니다
 */

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
 * @param baseUrl - Backend base URL (default: http://localhost:12393)
 * @returns Promise<LanguageInfo[]> - Array of language objects with code and label
 * @throws Error if API call fails
 */
export async function fetchAvailableLanguages(
  baseUrl: string = 'http://localhost:12393'
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

    // 백엔드가 이미 {code, label} 형태로 제공하므로 그대로 반환
    return data.languages;
  } catch (error) {
    console.error('Error fetching languages from API:', error);
    throw error;
  }
}

/**
 * Fetch available languages with fallback
 *
 * @param baseUrl - Backend base URL
 * @returns Promise<LanguageInfo[]> - Array of language objects (never fails)
 */
export async function fetchLanguagesWithFallback(
  baseUrl: string = 'http://localhost:12393'
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
