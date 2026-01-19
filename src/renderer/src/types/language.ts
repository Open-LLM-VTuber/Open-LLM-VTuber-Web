/**
 * Language-related type definitions
 *
 * 참고: LanguageInfo는 utils/languageApi.ts에서 import하세요.
 */

import type { LanguageInfo } from '@/utils/languageApi';

export interface LanguageCollection {
  label: string;
  value: string;
}

export type LanguageCode = string; // Can be extended to union type: 'en' | 'zh' | 'ko' | ...

export interface I18nState {
  currentLanguage: LanguageCode;
  availableLanguages: LanguageInfo[];
  isLoading: boolean;
  error: Error | null;
}

// Re-export for convenience
export type { LanguageInfo };
