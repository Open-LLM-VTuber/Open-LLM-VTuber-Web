/* eslint-disable import/no-extraneous-dependencies */
import { useTranslation } from "react-i18next";
import { Stack, createListCollection } from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { useBgUrl } from "@/context/bgurl-context";
import { settingStyles } from "./setting-styles";
import { useConfig } from "@/context/character-config-context";
import { useGeneralSettings } from "@/hooks/sidebar/setting/use-general-settings";
import { useWebSocket } from "@/context/websocket-context";
import { SelectField, SwitchField, InputField } from "./common";
import { fetchLanguagesWithFallback, DEFAULT_BASE_URL, type LanguageInfo } from "@/utils/languageApi";
import { loadLanguageDynamically } from "@/i18n";

interface GeneralProps {
  onSave?: (callback: () => void) => () => void;
  onCancel?: (callback: () => void) => () => void;
}

// Data collection definition
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
    let cancelled = false;  // Cleanup flag

    const loadLanguages = async () => {
      try {
        // Fetch LanguageInfo[] from backend: [{code, label}, ...]
        const languages: LanguageInfo[] = await fetchLanguagesWithFallback(
          baseUrl || DEFAULT_BASE_URL
        );

        if (!cancelled) {  // Only update if component is still mounted
          // Use backend-provided labels directly
          const items = languages.map(lang => ({
            label: lang.label,  // Use native label from backend
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
      cancelled = true;  // Set flag on cleanup
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

function General({ onSave, onCancel }: GeneralProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const bgUrlContext = useBgUrl();
  const { confName, setConfName } = useConfig();
  const { wsUrl, setWsUrl, baseUrl, setBaseUrl } = useWebSocket();
  const collections = useCollections();

  const {
    settings,
    handleSettingChange,
    handleCameraToggle,
    handleCharacterPresetChange,
    showSubtitle,
    setShowSubtitle,
  } = useGeneralSettings({
    bgUrlContext,
    confName,
    setConfName,
    baseUrl,
    wsUrl,
    onWsUrlChange: setWsUrl,
    onBaseUrlChange: setBaseUrl,
    onSave,
    onCancel,
  });

  // Custom language change handler with dynamic loading
  const handleLanguageChange = async (value: string[]) => {
    const newLang = value[0];

    if (newLang && newLang !== i18n.language) {
      try {
        // Dynamically load the language if not already loaded
        await loadLanguageDynamically(newLang);

        // Change the language
        await i18n.changeLanguage(newLang);

        // Update settings
        handleSettingChange("language", value);
      } catch (error) {
        console.error('Failed to change language:', error);
        // Still update settings even if dynamic load fails (fallback will be used)
        handleSettingChange("language", value);
      }
    }
  };

  // Sync settings.language with i18n.language when they differ
  useEffect(() => {
    if (settings.language[0] !== i18n.language) {
      handleSettingChange("language", [i18n.language]);
    }
  }, [settings.language, i18n.language, handleSettingChange]);

  return (
    <Stack {...settingStyles.common.container}>
      <SelectField
        label={t("settings.general.language")}
        value={settings.language}
        onChange={handleLanguageChange}
        collection={collections.languages}
        placeholder={t("settings.general.language")}
      />

      <SwitchField
        label={t("settings.general.useCameraBackground")}
        checked={settings.useCameraBackground}
        onChange={handleCameraToggle}
      />

      <SwitchField
        label={t("settings.general.showSubtitle")}
        checked={showSubtitle}
        onChange={setShowSubtitle}
      />

      {!settings.useCameraBackground && (
        <>
          <SelectField
            label={t("settings.general.backgroundImage")}
            value={settings.selectedBgUrl}
            onChange={(value) => handleSettingChange("selectedBgUrl", value)}
            collection={collections.backgrounds}
            placeholder={t("settings.general.backgroundImage")}
          />

          <InputField
            label={t("settings.general.customBgUrl")}
            value={settings.customBgUrl}
            onChange={(value) => handleSettingChange("customBgUrl", value)}
            placeholder={t("settings.general.customBgUrlPlaceholder")}
          />
        </>
      )}

      <SelectField
        label={t("settings.general.characterPreset")}
        value={settings.selectedCharacterPreset}
        onChange={handleCharacterPresetChange}
        collection={collections.characterPresets}
        placeholder={confName || t("settings.general.characterPreset")}
      />

      <InputField
        label={t("settings.general.wsUrl")}
        value={settings.wsUrl}
        onChange={(value) => handleSettingChange("wsUrl", value)}
        placeholder="Enter WebSocket URL"
      />

      <InputField
        label={t("settings.general.baseUrl")}
        value={settings.baseUrl}
        onChange={(value) => handleSettingChange("baseUrl", value)}
        placeholder="Enter Base URL"
      />

      <InputField
        label={t("settings.general.imageCompressionQuality")}
        value={settings.imageCompressionQuality.toString()}
        onChange={(value) => {
          const quality = parseFloat(value as string);
          if (!Number.isNaN(quality) && quality >= 0.1 && quality <= 1.0) {
            handleSettingChange("imageCompressionQuality", quality);
          } else if (value === "") {
            handleSettingChange("imageCompressionQuality", settings.imageCompressionQuality);
          }
        }}
        help={t("settings.general.imageCompressionQualityHelp")}
      />

      <InputField
        label={t("settings.general.imageMaxWidth")}
        value={settings.imageMaxWidth.toString()}
        onChange={(value) => {
          const maxWidth = parseInt(value as string, 10);
          if (!Number.isNaN(maxWidth) && maxWidth >= 0) {
            handleSettingChange("imageMaxWidth", maxWidth);
          } else if (value === "") {
            handleSettingChange("imageMaxWidth", settings.imageMaxWidth);
          }
        }}
        help={t("settings.general.imageMaxWidthHelp")}
      />
    </Stack>
  );
}

export default General;
