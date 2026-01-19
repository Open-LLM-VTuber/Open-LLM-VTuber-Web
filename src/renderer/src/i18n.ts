/* eslint-disable import/no-extraneous-dependencies */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Static imports for synchronous initialization
import enTranslation from "./locales/en/translation.json";
import zhTranslation from "./locales/zh/translation.json";

// Vite glob import for dynamic language loading
const translationModules = import.meta.glob('./locales/*/translation.json');

/**
 * Dynamically load translation file for a language
 * This is used when user selects a new language that isn't loaded yet
 *
 * @param lang - Language code (e.g., 'ko', 'ja')
 * @returns Promise<Record<string, unknown> | null> - Translation object or null if not found
 */
export async function loadLanguageDynamically(lang: string): Promise<Record<string, unknown> | null> {
  try {
    // Check if language is already loaded
    if (i18n.hasResourceBundle(lang, 'translation')) {
      console.log(`Language ${lang} is already loaded`);
      return i18n.getResourceBundle(lang, 'translation') as Record<string, unknown>;
    }

    // Load translation file using Vite glob pattern
    const modulePath = `./locales/${lang}/translation.json`;
    const moduleLoader = translationModules[modulePath];

    if (!moduleLoader) {
      console.warn(`Translation file not found for language: ${lang}`);
      return null;
    }

    const translation = await moduleLoader() as { default: Record<string, unknown> };

    // Add resource bundle to i18n
    i18n.addResourceBundle(lang, 'translation', translation.default, true, true);

    console.log(`Successfully loaded language: ${lang}`);
    return translation.default;
  } catch (error) {
    console.error(`Failed to load translation for language: ${lang}`, error);
    return null;
  }
}

// Synchronous i18n initialization with static resources
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    debug: process.env.NODE_ENV === "development",
    defaultNS: "translation",
    ns: ["translation"],
    // Static resources for synchronous initialization
    resources: {
      en: {
        translation: enTranslation,
      },
      zh: {
        translation: zhTranslation,
      },
    },
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

// Save language change to localStorage
i18n.on("languageChanged", (lng) => {
  localStorage.setItem("i18nextLng", lng);
  document.documentElement.lang = lng;
});

export default i18n;
