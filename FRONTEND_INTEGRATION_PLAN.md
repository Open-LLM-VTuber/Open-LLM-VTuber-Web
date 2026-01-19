# Frontend Integration Plan - Dynamic Languages API

## ⚠️ 구현 시 주의사항

### 1. Vite 동적 import 제한

Vite는 완전 동적 경로 import에 제한이 있습니다. glob import 패턴을 사용해야 합니다:

```typescript
// ❌ 문제 발생 가능 - Vite에서 경로를 정적으로 분석할 수 없음
const translation = await import(`./locales/${lang}/translation.json`);

// ✅ Vite 권장 방식 - glob 패턴으로 가능한 경로를 미리 정의
const modules = import.meta.glob('./locales/*/translation.json');
const translation = await modules[`./locales/${lang}/translation.json`]();
```

**이유**: Vite는 빌드 시 정적 분석으로 번들링하므로, 런타임에 결정되는 완전 동적 경로는 지원하지 않습니다.

### 2. 이중 초기화 방지

`i18n.ts` 파일 끝의 자동 초기화와 `App.tsx`의 초기화가 충돌할 수 있습니다:

```typescript
// i18n.ts 끝부분 - 자동 초기화
initializeI18n().catch(error => {
  console.error('Auto-initialization failed:', error);
});

// App.tsx - 명시적 초기화
useEffect(() => {
  initializeI18n(baseUrl).then(...)
}, [baseUrl]);
```

**해결 방법**: `App.tsx`에서만 `initializeI18n()` 호출하도록 통일하고, `i18n.ts`의 자동 초기화는 제거하거나 조건부로 실행합니다.

### 3. useEffect cleanup 필수

컴포넌트가 unmount될 때 비동기 작업의 상태 업데이트를 방지해야 합니다:

```typescript
// ❌ 문제 발생 가능 - cleanup 없음
useEffect(() => {
  const loadLanguages = async () => {
    const codes = await fetchLanguagesWithFallback(baseUrl);
    setLanguageItems(items); // 컴포넌트가 이미 unmount되었을 수 있음
  };
  loadLanguages();
}, [baseUrl]);

// ✅ cleanup으로 메모리 누수 방지
useEffect(() => {
  let cancelled = false;

  const loadLanguages = async () => {
    const codes = await fetchLanguagesWithFallback(baseUrl);
    if (!cancelled) {  // 컴포넌트가 마운트된 경우만 업데이트
      setLanguageItems(items);
    }
  };

  loadLanguages();

  return () => {
    cancelled = true;  // cleanup 시 플래그 설정
  };
}, [baseUrl]);
```

**이유**: 비동기 작업이 완료되기 전에 컴포넌트가 unmount되면 "Can't perform a React state update on an unmounted component" 경고가 발생합니다.

---

## 현재 상태 분석

### 문제점

**1. 하드코딩된 언어 목록 (3곳)**

```typescript
// src/renderer/src/i18n.ts (라인 7-8)
import enTranslation from "./locales/en/translation.json";
import zhTranslation from "./locales/zh/translation.json";

// src/renderer/src/i18n.ts (라인 26-33)
resources: {
  en: { translation: enTranslation },
  zh: { translation: zhTranslation },
}

// src/renderer/src/components/sidebar/setting/general.tsx (라인 21-26)
const languages = createListCollection({
  items: [
    { label: "English", value: "en" },
    { label: "中文", value: "zh" },
  ],
});
```

**결과**: 백엔드에 새 언어(ko 등)를 추가해도 프론트엔드에 자동으로 나타나지 않음

### 기존 아키텍처

- **프레임워크**: Electron + React + TypeScript + Vite
- **i18n 라이브러리**: i18next + react-i18next
- **UI 라이브러리**: Chakra UI v3
- **상태 관리**: zustand, React Context
- **언어 감지**: i18next-browser-languagedetector (localStorage 캐싱)

## 개선 목표

1. **동적 언어 목록**: 백엔드 `/api/languages` API에서 언어 목록 가져오기
2. **자동 반영**: 새 언어 추가 시 프론트엔드 코드 변경 없이 자동 표시
3. **타입 안정성**: TypeScript 타입 정의로 런타임 에러 방지
4. **에러 처리**: API 실패 시 기본 언어(en, zh)로 폴백
5. **코드 품질**: 재사용 가능한 유틸리티 함수, 명확한 책임 분리

## 구현 계획

### 1. API Utility 함수 생성

**파일**: `src/renderer/src/utils/languageApi.ts` (신규 생성)

```typescript
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
  languages: LanguageInfo[];  // 변경: string[] → LanguageInfo[]
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
): Promise<LanguageInfo[]> {  // 변경: Promise<string[]> → Promise<LanguageInfo[]>
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
): Promise<LanguageInfo[]> {  // 변경: Promise<string[]> → Promise<LanguageInfo[]>
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
```

**개선 포인트**:
- TypeScript interface로 API 응답 타입 정의
- JSDoc으로 함수 사용법 문서화
- 명확한 에러 처리 (throw vs fallback)
- baseUrl 파라미터화로 재사용성 향상
- **백엔드가 label을 제공**하므로 프론트엔드에서 매핑 불필요

---

### 2. 언어 이름 매핑 유틸리티 (폴백용)

**파일**: `src/renderer/src/utils/languageNames.ts` (신규 생성)

> **⚠️ 중요**: 백엔드 API가 이미 언어 라벨을 제공하므로, 이 파일은 **API 실패 시 폴백용으로만** 사용됩니다.
> 일반적인 경우에는 백엔드에서 받은 `label`을 직접 사용하세요.

```typescript
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
```

**개선 포인트**:
- **폴백 전용**: 백엔드 API가 실패할 경우에만 사용
- **단순화**: 백엔드가 label을 제공하므로 복잡한 매핑 불필요
- 주요 언어 10개만 포함 (필요시 확장 가능)
- 타입 안정성 유지

---

### 3. i18n.ts 리팩토링 - 동적 언어 로딩

**파일**: `src/renderer/src/i18n.ts` (수정)

#### 현재 코드 문제점:
- 번역 파일을 정적 import (라인 7-8)
- resources에 하드코딩 (라인 26-33)
- 동기 초기화 (새 언어 추가 시 코드 수정 필요)

#### 개선 방안:

```typescript
/* eslint-disable import/no-extraneous-dependencies */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { fetchLanguagesWithFallback } from "./utils/languageApi";

// Vite glob import - 가능한 모든 번역 파일을 미리 정의
const translationModules = import.meta.glob('./locales/*/translation.json');

/**
 * Dynamically import translation file using Vite glob pattern
 *
 * @param lang - Language code
 * @returns Translation object or null if not found
 */
async function loadTranslation(lang: string): Promise<Record<string, unknown> | null> {
  try {
    // Vite glob pattern을 사용한 동적 import
    const modulePath = `./locales/${lang}/translation.json`;
    const moduleLoader = translationModules[modulePath];

    if (!moduleLoader) {
      console.warn(`Translation file not found for language: ${lang}`);
      return null;
    }

    const translation = await moduleLoader();
    return (translation as any).default;
  } catch (error) {
    console.warn(`Failed to load translation for language: ${lang}`, error);
    return null;
  }
}

/**
 * Initialize i18n with dynamic languages from backend API
 *
 * @param baseUrl - Backend base URL for API calls
 */
export async function initializeI18n(baseUrl: string = 'http://localhost:12393'): Promise<void> {
  try {
    // Step 1: Fetch available languages from backend
    const availableLanguages = await fetchLanguagesWithFallback(baseUrl);
    console.log('Available languages from backend:', availableLanguages);

    // Step 2: Load translation files for all available languages
    const resources: Record<string, { translation: Record<string, unknown> }> = {};

    await Promise.all(
      availableLanguages.map(async (lang) => {
        const translation = await loadTranslation(lang);
        if (translation) {
          resources[lang] = { translation };
        }
      })
    );

    // Step 3: Ensure at least English is available (fallback)
    if (!resources.en) {
      const enTranslation = await loadTranslation('en');
      if (enTranslation) {
        resources.en = { translation: enTranslation };
      }
    }

    // Step 4: Initialize i18next with dynamic resources
    await i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        fallbackLng: "en",
        debug: process.env.NODE_ENV === "development",
        defaultNS: "translation",
        ns: ["translation"],
        resources, // Dynamic resources from API
        supportedLngs: Object.keys(resources), // Dynamic supported languages
        detection: {
          order: ["localStorage", "navigator"],
          caches: ["localStorage"],
          htmlTag: document.documentElement,
        },
        interpolation: {
          escapeValue: false,
        },
        react: {
          useSuspense: true,
        },
      });

    console.log('i18n initialized with languages:', Object.keys(resources));
  } catch (error) {
    console.error('Failed to initialize i18n:', error);

    // Fallback: Initialize with minimal config
    await i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        fallbackLng: "en",
        debug: false,
        resources: {}, // Will be populated by lazy loading
      });
  }
}

// Save language change to localStorage
i18n.on("languageChanged", (lng) => {
  localStorage.setItem("i18nextLng", lng);
  document.documentElement.lang = lng;
});

// ⚠️ 이중 초기화 방지: 자동 초기화를 제거하거나 조건부로 실행
// 옵션 1: 완전히 제거 (권장) - App.tsx에서만 초기화
// (아래 코드 주석 처리 또는 삭제)

// 옵션 2: 조건부 실행 - Electron 환경에서만 자동 초기화
if (typeof window !== 'undefined' && !(window as any).electron) {
  // 웹 환경에서만 자동 초기화
  initializeI18n().catch(error => {
    console.error('Auto-initialization failed:', error);
  });
}

export default i18n;
```

**개선 포인트**:
1. **Vite glob import**: `import.meta.glob()`으로 Vite 제약 해결
2. **API 통합**: 백엔드에서 `LanguageInfo[]` (code + label) 가져옴
3. **백엔드 label 사용**: 프론트엔드 매핑 불필요
4. **에러 처리**: 번역 파일 로드 실패 시 graceful fallback
5. **타입 안정성**: `Record<string, unknown>` 타입 명시
6. **이중 초기화 방지**: 자동 초기화 제거 또는 조건부 실행
7. **로깅**: 디버깅을 위한 console.log
8. **Suspense 지원**: React Suspense로 비동기 로딩 처리

---

### 4. App.tsx 수정 - i18n 초기화 대기

**파일**: `src/renderer/src/App.tsx` (수정 필요)

현재 App.tsx가 어떻게 구성되어 있는지 확인 필요. 일반적인 패턴:

```typescript
import { Suspense, useEffect, useState } from 'react';
import { initializeI18n } from './i18n';
import { useWebSocket } from './context/websocket-context';

function App() {
  const [i18nReady, setI18nReady] = useState(false);
  const { baseUrl } = useWebSocket();

  useEffect(() => {
    let cancelled = false;  // ⚠️ cleanup 플래그

    // Initialize i18n with backend base URL
    const init = async () => {
      try {
        await initializeI18n(baseUrl || 'http://localhost:12393');
        if (!cancelled) {  // 컴포넌트가 마운트된 경우만 업데이트
          setI18nReady(true);
        }
      } catch (error) {
        console.error('i18n initialization failed:', error);
        if (!cancelled) {
          setI18nReady(true); // Continue anyway
        }
      }
    };

    init();

    return () => {
      cancelled = true;  // ⚠️ cleanup 시 플래그 설정
    };
  }, [baseUrl]);

  if (!i18nReady) {
    return <div>Loading...</div>; // Or a proper loading component
  }

  return (
    <Suspense fallback={<div>Loading translations...</div>}>
      {/* Your app content */}
    </Suspense>
  );
}

export default App;
```

**개선 포인트**:
- i18n 초기화 완료 대기
- baseUrl을 i18n 초기화에 전달
- **useEffect cleanup으로 메모리 누수 방지** (⚠️ 필수)
- Suspense로 비동기 번역 로딩 처리

---

### 5. general.tsx 리팩토링 - 동적 언어 목록

**파일**: `src/renderer/src/components/sidebar/setting/general.tsx` (수정)

#### 변경 사항:

```typescript
// 기존 코드 (라인 17-27) 제거:
const useCollections = () => {
  const { backgroundFiles } = useBgUrl() || {};
  const { configFiles } = useConfig();

  const languages = createListCollection({
    items: [
      { label: "English", value: "en" },
      { label: "中文", value: "zh" },
    ],
  });
  // ...
};

// ↓↓↓ 다음으로 교체 ↓↓↓

import { useState, useEffect } from 'react';
import { fetchLanguagesWithFallback, type LanguageInfo } from '@/utils/languageApi';
import { useWebSocket } from '@/context/websocket-context';

const useCollections = () => {
  const { backgroundFiles } = useBgUrl() || {};
  const { configFiles } = useConfig();
  const { baseUrl } = useWebSocket();

  // State for dynamic languages
  const [languageItems, setLanguageItems] = useState<Array<{ label: string; value: string }>>([
    { label: "English", value: "en" },
    { label: "中文", value: "zh" },
  ]);

  // Fetch languages from backend API
  useEffect(() => {
    let cancelled = false;  // ⚠️ cleanup 플래그

    const loadLanguages = async () => {
      try {
        // 백엔드에서 LanguageInfo[] 형태로 받음: [{code, label}, ...]
        const languages: LanguageInfo[] = await fetchLanguagesWithFallback(
          baseUrl || 'http://localhost:12393'
        );

        if (!cancelled) {  // 컴포넌트가 마운트된 경우만 업데이트
          // 백엔드가 이미 label을 제공하므로 직접 사용
          const items = languages.map(lang => ({
            label: lang.label,  // 백엔드에서 제공한 네이티브 라벨 사용
            value: lang.code,
          }));
          setLanguageItems(items);
        }
      } catch (error) {
        console.error('Failed to load languages:', error);
        // Keep default fallback
      }
    };

    loadLanguages();

    return () => {
      cancelled = true;  // ⚠️ cleanup 시 플래그 설정
    };
  }, [baseUrl]);

  const languages = createListCollection({
    items: languageItems,
  });

  const backgrounds = createListCollection({
    items:
      backgroundFiles?.map((filename) => ({
        label: String(filename),
        value: `/bg/${filename}`,
      })) || [],
  });

  const characterPresets = createListCollection({
    items: configFiles.map((config) => ({
      label: config.name,
      value: config.filename,
    })),
  });

  return {
    languages,
    backgrounds,
    characterPresets,
  };
};
```

**개선 포인트**:
1. **useState + useEffect**: 동적 언어 목록 관리
2. **API 통합**: fetchLanguagesWithFallback 사용
3. **백엔드 label 직접 사용**: `languageNames.ts` 매핑 불필요
4. **타입 안정성**: `LanguageInfo[]` 타입 명시
5. **폴백 전략**: API 실패 시 기본값 유지
6. **baseUrl 연동**: WebSocket context에서 baseUrl 사용
7. **useEffect cleanup**: 메모리 누수 방지 (⚠️ 필수)

---

## 타입 정의 개선

**파일**: `src/renderer/src/types/language.ts` (신규 생성 - 선택사항)

> **참고**: `LanguageInfo` 타입은 이미 `utils/languageApi.ts`에 정의되어 있습니다.
> 추가적인 타입이 필요한 경우에만 이 파일을 생성하세요.

```typescript
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
  availableLanguages: LanguageInfo[];  // 변경: LanguageCode[] → LanguageInfo[]
  isLoading: boolean;
  error: Error | null;
}

// Re-export for convenience
export type { LanguageInfo };
```

**개선 포인트**:
- **중복 제거**: `LanguageInfo`는 `languageApi.ts`에서 정의
- **백엔드 API 반영**: `availableLanguages`가 이제 `LanguageInfo[]`
- **Re-export**: 편의를 위해 `LanguageInfo` 타입 재내보내기

---

## 에러 처리 전략

### 1. API 호출 실패
- **전략**: Fallback to `[{code: 'en', label: 'English'}, {code: 'zh', label: '中文'}]`
- **로깅**: console.warn으로 실패 기록
- **사용자 경험**: 기본 언어로 계속 작동
- **백엔드 변경**: 이제 label도 포함된 객체로 폴백

### 2. 번역 파일 로드 실패
- **전략**: 해당 언어 스킵, 계속 진행
- **로깅**: console.warn으로 파일 누락 기록
- **사용자 경험**: 사용 가능한 언어만 표시
- **Vite 제약**: `import.meta.glob()`으로 미리 정의된 파일만 로드 가능

### 3. i18n 초기화 실패
- **전략**: 최소 설정(en only)으로 초기화
- **로깅**: console.error로 치명적 오류 기록
- **사용자 경험**: 영어로 앱 사용 가능

### 4. 컴포넌트 unmount 시 (⚠️ 새로 추가)
- **전략**: useEffect cleanup으로 state 업데이트 방지
- **로깅**: 필요 없음
- **사용자 경험**: 메모리 누수 및 경고 메시지 방지

---

## 테스트 계획

### 1. API 연동 테스트
```bash
# 백엔드 서버 실행
cd D:\Taniar\Documents\Git\Open-LLM-VTuber
uv run run_server.py

# 프론트엔드 개발 서버 실행
cd D:\Taniar\Documents\Git\Open-LLM-VTuber-Web
npm run dev
```

**검증 항목**:
- [ ] 언어 선택 드롭다운에 en, zh, ko가 표시됨
- [ ] 각 언어 선택 시 UI가 해당 언어로 변경됨
- [ ] localStorage에 언어 설정이 저장됨
- [ ] 페이지 새로고침 시 언어 유지됨

### 2. 폴백 테스트
```bash
# 백엔드 서버 중단 상태에서 프론트엔드 실행
# API 호출 실패 시나리오
```

**검증 항목**:
- [ ] API 실패 시 en, zh 기본 언어로 작동
- [ ] 콘솔에 경고 메시지 출력
- [ ] 앱 정상 실행 (크래시 없음)

### 3. 새 언어 추가 테스트
```bash
# 백엔드에 ja (일본어) 추가
# src/open_llm_vtuber/locales/ja/ 생성
# 필요한 JSON 파일 추가

# 프론트엔드에 ja 번역 추가
# src/renderer/src/locales/ja/translation.json 생성
```

**검증 항목**:
- [ ] 서버 재시작 후 ja가 자동으로 드롭다운에 나타남
- [ ] 프론트엔드 코드 변경 없음
- [ ] ja 선택 시 일본어 UI 표시

---

## 구현 순서

1. ✅ **현재 상태 분석 완료**
2. ⏳ **Utility 함수 생성**
   - `src/renderer/src/utils/languageApi.ts`
   - `src/renderer/src/utils/languageNames.ts`
   - `src/renderer/src/types/language.ts`
3. ⏳ **i18n.ts 리팩토링**
   - 동적 import 구현
   - API 통합
4. ⏳ **general.tsx 리팩토리**
   - 동적 언어 목록 사용
5. ⏳ **App.tsx 수정** (필요 시)
   - i18n 초기화 대기 로직
6. ⏳ **테스트 및 검증**
   - 로컬 환경에서 모든 시나리오 테스트
7. ⏳ **문서화**
   - CHANGELOG 작성
   - 사용법 가이드 업데이트

---

## 예상 파일 변경

### 신규 생성 (2-3개)
- `src/renderer/src/utils/languageApi.ts` (약 70줄)
  - **백엔드 변경으로 단순화**: label 매핑 불필요
- `src/renderer/src/utils/languageNames.ts` (약 30줄)
  - **폴백 전용으로 축소**: 백엔드가 label 제공
- `src/renderer/src/types/language.ts` (약 20줄, 선택사항)

### 수정 (2-3개)
- `src/renderer/src/i18n.ts` (기존 61줄 → 약 110줄)
  - **Vite glob 패턴 추가**: +10줄
  - **이중 초기화 방지**: +5줄
- `src/renderer/src/components/sidebar/setting/general.tsx` (기존 175줄 → 약 195줄)
  - **useEffect cleanup 추가**: +3줄
  - **백엔드 label 직접 사용**: 코드 단순화
- `src/renderer/src/App.tsx` (확인 필요, 약 20줄 추가)
  - **useEffect cleanup 추가**: +3줄

### 총 예상 변경량
- **추가**: 약 +220 줄 (백엔드가 label 제공으로 감소)
- **수정**: 약 +70 줄
- **삭제**: 약 -20 줄 (하드코딩 제거)
- **순 증가**: 약 +270 줄 (기존 계획보다 약 110줄 감소)

---

## 코드 품질 기준

### TypeScript
- [ ] 모든 함수에 명시적 타입 선언
- [ ] `any` 타입 사용 금지
- [ ] Interface로 명확한 계약 정의

### 에러 처리
- [ ] try-catch로 모든 async 함수 보호
- [ ] 의미 있는 에러 메시지
- [ ] Fallback 전략 명확히 정의

### 문서화
- [ ] JSDoc으로 모든 public 함수 문서화
- [ ] 복잡한 로직에 주석 추가
- [ ] README 업데이트

### 테스트
- [ ] 수동 테스트로 모든 시나리오 검증
- [ ] 에러 케이스 테스트
- [ ] 브라우저 콘솔에서 에러 없음 확인

---

## 성공 기준

1. ✅ **동적 언어 목록**: 백엔드 API에서 언어 목록 가져오기
2. ✅ **자동 반영**: 새 언어 추가 시 프론트엔드 자동 업데이트
3. ✅ **에러 처리**: API 실패 시 폴백으로 정상 작동
4. ✅ **타입 안정성**: TypeScript 컴파일 에러 없음
5. ✅ **코드 품질**: Lint/Format 통과
6. ✅ **사용자 경험**: 기존 기능 동일하게 작동

---

## 변경 이력

### 2026-01-20 (v2.0 업데이트)
- **백엔드 API 변경 반영**: 이제 백엔드가 `{code, label}` 형태로 언어 정보 제공
- **구현 시 주의사항 추가**: Vite 동적 import 제한, 이중 초기화 방지, useEffect cleanup
- **코드 단순화**: 프론트엔드에서 label 매핑 불필요 (약 110줄 감소)
- **타입 안전성 강화**: `LanguageInfo` 타입 전반 적용

### 2026-01-19 (초기 버전)
- 최초 프론트엔드 통합 계획 작성

---

**Last Updated**: 2026-01-20
**Status**: Planning Updated 📋 | Backend API Enhanced ✅ | Ready for Implementation 🚀
