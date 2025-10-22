/* eslint-disable import/no-extraneous-dependencies */
import { useTranslation } from "react-i18next";
import { Stack, createListCollection } from "@chakra-ui/react";
import { useBgUrl } from "@/context/bgurl-context";
import { settingStyles } from "./setting-styles";
import { useConfig } from "@/context/character-config-context";
import { useGeneralSettings } from "@/hooks/sidebar/setting/use-general-settings";
import { useWebSocket } from "@/context/websocket-context";
import { SelectField, SwitchField, InputField } from "./common";

interface GeneralProps {
  onSave?: (callback: () => boolean | void) => () => void;
  onCancel?: (callback: () => void) => () => void;
}

// Data collection definition
const useCollections = () => {
  const { backgroundFiles } = useBgUrl() || {};
  const { configFiles } = useConfig();

  const languages = createListCollection({
    items: [
      { label: "English", value: "en" },
      { label: "中文", value: "zh" },
    ],
  });

  const backgrounds = createListCollection({
    items: (backgroundFiles ?? [])
      .map((raw) => {
        const entry = raw as unknown as { name?: string; url?: string } | string | null | undefined;
        if (entry == null) {
          return null;
        }
        if (typeof entry === 'string') {
          const trimmed = entry.trim();
          if (!trimmed) {
            return null;
          }
          const label = trimmed.split('/').filter(Boolean).pop() ?? trimmed;
          return {
            label: label || trimmed,
            value: trimmed,
          };
        }
        const name = entry.name?.trim();
        const url = entry.url?.trim();
        const fallbackValue = name || url || '';
        if (!fallbackValue) {
          return null;
        }
        const labelSource = name || url;
        const label = labelSource?.split('/').filter(Boolean).pop() ?? labelSource;
        return {
          label: label || fallbackValue,
          value: name || fallbackValue,
        };
      })
      .filter((item): item is { label: string; value: string } => Boolean(item?.value)),
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
  const {
    wsUrl,
    setWsUrl,
    baseUrl,
    setBaseUrl,
    basicAuthEnabled,
    setBasicAuthEnabled,
    basicAuthUsername,
    setBasicAuthUsername,
    basicAuthPassword,
    setBasicAuthPassword,
  } = useWebSocket();
  const collections = useCollections();

  const {
    settings,
    handleSettingChange,
    handleCameraToggle,
    handleCharacterPresetChange,
    showSubtitle,
    setShowSubtitle,
    basicAuthErrors,
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
    basicAuthEnabled,
    basicAuthUsername,
    basicAuthPassword,
    onBasicAuthEnabledChange: setBasicAuthEnabled,
    onBasicAuthUsernameChange: setBasicAuthUsername,
    onBasicAuthPasswordChange: setBasicAuthPassword,
  });

  if (settings.language[0] !== i18n.language) {
    handleSettingChange("language", [i18n.language]);
  }

  return (
    <Stack {...settingStyles.common.container}>
      <SelectField
        label={t("settings.general.language")}
        value={settings.language}
        onChange={(value) => handleSettingChange("language", value)}
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

      <SwitchField
        label={t("settings.general.basicAuthEnabled")}
        checked={settings.basicAuthEnabled}
        onChange={(checked) => handleSettingChange("basicAuthEnabled", checked)}
      />

      <InputField
        label={t("settings.general.basicAuthUsername")}
        value={settings.basicAuthUsername}
        onChange={(value) => handleSettingChange("basicAuthUsername", value)}
        placeholder={t("settings.general.basicAuthUsernamePlaceholder")}
        disabled={!settings.basicAuthEnabled}
        error={settings.basicAuthEnabled ? basicAuthErrors.username : undefined}
      />

      <InputField
        label={t("settings.general.basicAuthPassword")}
        value={settings.basicAuthPassword}
        onChange={(value) => handleSettingChange("basicAuthPassword", value)}
        placeholder={t("settings.general.basicAuthPasswordPlaceholder")}
        disabled={!settings.basicAuthEnabled}
        error={settings.basicAuthEnabled ? basicAuthErrors.password : undefined}
        type="password"
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
