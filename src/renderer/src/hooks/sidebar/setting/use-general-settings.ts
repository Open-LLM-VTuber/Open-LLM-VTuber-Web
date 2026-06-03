/* eslint-disable import/order */
/* eslint-disable no-use-before-define */
import { useState, useEffect } from 'react';
import { BgUrlContextState } from '@/context/bgurl-context';
import { defaultBaseUrl, defaultWsUrl } from '@/context/websocket-context';
import { useSubtitle } from '@/context/subtitle-context';
import { useCamera } from '@/context/camera-context';
import { useSwitchCharacter } from '@/hooks/utils/use-switch-character';
import { useConfig } from '@/context/character-config-context';
import i18n from 'i18next';

export const IMAGE_COMPRESSION_QUALITY_KEY = 'appImageCompressionQuality';
export const DEFAULT_IMAGE_COMPRESSION_QUALITY = 0.8;
export const IMAGE_MAX_WIDTH_KEY = 'appImageMaxWidth';
export const DEFAULT_IMAGE_MAX_WIDTH = 0;

interface GeneralSettings {
  language: string[]
  customBgUrl: string
  selectedBgUrl: string[]
  backgroundUrl: string
  selectedCharacterPreset: string[]
  useCameraBackground: boolean
  wsUrl: string
  baseUrl: string
  showSubtitle: boolean
  imageCompressionQuality: number;
  imageMaxWidth: number;
}

interface UseGeneralSettingsProps {
  bgUrlContext: BgUrlContextState | null
  confName: string | undefined
  setConfName: (name: string) => void
  baseUrl: string
  wsUrl: string
  onWsUrlChange: (url: string) => void
  onBaseUrlChange: (url: string) => void
  onSave?: (callback: () => void) => () => void
  onCancel?: (callback: () => void) => () => void
}

const loadInitialCompressionQuality = (): number => {
  const storedQuality = localStorage.getItem(IMAGE_COMPRESSION_QUALITY_KEY);
  if (storedQuality) {
    const quality = parseFloat(storedQuality);
    if (!Number.isNaN(quality) && quality >= 0.1 && quality <= 1.0) {
      return quality;
    }
  }
  return DEFAULT_IMAGE_COMPRESSION_QUALITY;
};

const loadInitialImageMaxWidth = (): number => {
  const storedMaxWidth = localStorage.getItem(IMAGE_MAX_WIDTH_KEY);
  if (storedMaxWidth) {
    const maxWidth = parseInt(storedMaxWidth, 10);
    if (!Number.isNaN(maxWidth) && maxWidth >= 0) {
      return maxWidth;
    }
  }
  return DEFAULT_IMAGE_MAX_WIDTH;
};

export const useGeneralSettings = ({
  bgUrlContext,
  confName,
  setConfName,
  baseUrl,
  wsUrl,
  onWsUrlChange,
  onBaseUrlChange,
  onSave,
  onCancel,
}: UseGeneralSettingsProps) => {
  const {
    showSubtitle,
    setShowSubtitle,
    subtitleConfig,
    setSubtitleConfig,
  } = useSubtitle();
  const { setUseCameraBackground } = bgUrlContext || {};
  const { startBackgroundCamera, stopBackgroundCamera } = useCamera();
  const { configFiles, getFilenameByName } = useConfig();
  const { switchCharacter } = useSwitchCharacter();

  const getCurrentBgKey = (): string[] => {
    if (!bgUrlContext?.backgroundUrl) return [];
    const currentBgUrl = bgUrlContext.backgroundUrl;
    const path = currentBgUrl.replace(baseUrl, '');
    return path.startsWith('/bg/') ? [path] : [];
  };

  const getCurrentCharacterFilename = (): string[] => {
    if (!confName) return [];
    const filename = getFilenameByName(confName);
    return filename ? [filename] : [];
  };

  const initialSettings: GeneralSettings = {
    language: [i18n.language || 'en'],
    customBgUrl: !bgUrlContext?.backgroundUrl?.includes('/bg/')
      ? bgUrlContext?.backgroundUrl || ''
      : '',
    selectedBgUrl: getCurrentBgKey(),
    backgroundUrl: bgUrlContext?.backgroundUrl || '',
    selectedCharacterPreset: getCurrentCharacterFilename(),
    useCameraBackground: bgUrlContext?.useCameraBackground || false,
    wsUrl: wsUrl || defaultWsUrl,
    baseUrl: baseUrl || defaultBaseUrl,
    showSubtitle,
    imageCompressionQuality: loadInitialCompressionQuality(),
    imageMaxWidth: loadInitialImageMaxWidth(),
  };

  const [settings, setSettings] = useState<GeneralSettings>(initialSettings);
  const [originalSettings, setOriginalSettings] = useState<GeneralSettings>(initialSettings);
  const originalConfName = confName;

  useEffect(() => {
    setShowSubtitle(settings.showSubtitle);

    const newBgUrl = settings.customBgUrl || settings.selectedBgUrl[0];
    if (newBgUrl && bgUrlContext) {
      const fullUrl = newBgUrl.startsWith('http') ? newBgUrl : `${baseUrl}${newBgUrl}`;
      bgUrlContext.setBackgroundUrl(fullUrl);
    }

    onWsUrlChange(settings.wsUrl);
    onBaseUrlChange(settings.baseUrl);

    // Apply language change if it differs from current language
    if (settings.language && settings.language[0] && settings.language[0] !== i18n.language) {
      i18n.changeLanguage(settings.language[0]);
    }
    localStorage.setItem(IMAGE_COMPRESSION_QUALITY_KEY, settings.imageCompressionQuality.toString());
    localStorage.setItem(IMAGE_MAX_WIDTH_KEY, settings.imageMaxWidth.toString());
  }, [settings, bgUrlContext, baseUrl, onWsUrlChange, onBaseUrlChange, setShowSubtitle]);

  useEffect(() => {
    if (confName) {
      const filename = getFilenameByName(confName);
      if (filename) {
        const newSettings = {
          ...settings,
          selectedCharacterPreset: [filename],
        };
        setSettings(newSettings);
        setOriginalSettings(newSettings);
      }
    }
  }, [confName]);

  // Add save/cancel effect
  useEffect(() => {
    if (!onSave || !onCancel) return;

    const cleanupSave = onSave(() => {
      handleSave();
    });

    const cleanupCancel = onCancel(() => {
      handleCancel();
    });

    return () => {
      cleanupSave?.();
      cleanupCancel?.();
    };
  }, [onSave, onCancel]);

  const handleSettingChange = (
    key: keyof GeneralSettings,
    value: GeneralSettings[keyof GeneralSettings],
  ): void => {
    setSettings((prev) => ({ ...prev, [key]: value }));

    if (key === 'wsUrl') {
      onWsUrlChange(value as string);
    }
    if (key === 'baseUrl') {
      onBaseUrlChange(value as string);
    }
    // Immediately change language when it's updated
    if (key === 'language' && Array.isArray(value) && value.length > 0) {
      i18n.changeLanguage(value[0]);
    }
  };

  const handleSave = (): void => {
    setOriginalSettings(settings);
  };

  const handleCancel = (): void => {
    setSettings(originalSettings);

    // Restore all settings to original values
    setShowSubtitle(originalSettings.showSubtitle);
    if (bgUrlContext) {
      bgUrlContext.setBackgroundUrl(originalSettings.backgroundUrl);
      bgUrlContext.setUseCameraBackground(originalSettings.useCameraBackground);
    }
    onWsUrlChange(originalSettings.wsUrl);
    onBaseUrlChange(originalSettings.baseUrl);

    // Restore original character preset
    if (originalConfName) {
      setConfName(originalConfName);
    }

    // Handle camera state
    if (originalSettings.useCameraBackground) {
      startBackgroundCamera();
    } else {
      stopBackgroundCamera();
    }
  };

  const handleCharacterPresetChange = (value: string[]): void => {
    const selectedFilename = value[0];
    const selectedConfig = configFiles.find((config) => config.filename === selectedFilename);
    const currentFilename = confName ? getFilenameByName(confName) : '';

    handleSettingChange('selectedCharacterPreset', value);

    if (currentFilename === selectedFilename) {
      return;
    }

    if (selectedConfig) {
      switchCharacter(selectedFilename);
    }
  };

  const handleCameraToggle = async (checked: boolean) => {
    if (!setUseCameraBackground) return;

    if (checked) {
      try {
        await startBackgroundCamera();
        handleSettingChange('useCameraBackground', true);
        setUseCameraBackground(true);
      } catch (error) {
        console.error('Failed to start camera:', error);
        handleSettingChange('useCameraBackground', false);
        setUseCameraBackground(false);
      }
    } else {
      stopBackgroundCamera();
      handleSettingChange('useCameraBackground', false);
      setUseCameraBackground(false);
    }
  };

  return {
    settings,
    handleSettingChange,
    handleSave,
    handleCancel,
    handleCameraToggle,
    handleCharacterPresetChange,
    showSubtitle,
    setShowSubtitle,
    subtitleConfig,
    setSubtitleConfig,
  };
};
