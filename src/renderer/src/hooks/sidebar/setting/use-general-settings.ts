/* eslint-disable import/order */
/* eslint-disable no-use-before-define */
import { useState, useEffect, useCallback } from 'react';
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
  basicAuthEnabled: boolean;
  basicAuthUsername: string;
  basicAuthPassword: string;
}

interface UseGeneralSettingsProps {
  bgUrlContext: BgUrlContextState | null
  confName: string | undefined
  setConfName: (name: string) => void
  baseUrl: string
  wsUrl: string
  onWsUrlChange: (url: string) => void
  onBaseUrlChange: (url: string) => void
  onSave?: (callback: () => boolean | void) => () => void
  onCancel?: (callback: () => void) => () => void
  basicAuthEnabled: boolean
  basicAuthUsername: string
  basicAuthPassword: string
  onBasicAuthEnabledChange: (enabled: boolean) => void
  onBasicAuthUsernameChange: (username: string) => void
  onBasicAuthPasswordChange: (password: string) => void
}

interface BasicAuthErrors {
  username?: string;
  password?: string;
}

const arraysShallowEqual = (a: string[], b: string[]) => (
  a.length === b.length && a.every((value, index) => value === b[index])
);

const settingsEqual = (prev: GeneralSettings, next: GeneralSettings) => (
  arraysShallowEqual(prev.language, next.language)
  && prev.customBgUrl === next.customBgUrl
  && arraysShallowEqual(prev.selectedBgUrl, next.selectedBgUrl)
  && prev.backgroundUrl === next.backgroundUrl
  && arraysShallowEqual(prev.selectedCharacterPreset, next.selectedCharacterPreset)
  && prev.useCameraBackground === next.useCameraBackground
  && prev.wsUrl === next.wsUrl
  && prev.baseUrl === next.baseUrl
  && prev.showSubtitle === next.showSubtitle
  && prev.imageCompressionQuality === next.imageCompressionQuality
  && prev.imageMaxWidth === next.imageMaxWidth
  && prev.basicAuthEnabled === next.basicAuthEnabled
  && prev.basicAuthUsername === next.basicAuthUsername
  && prev.basicAuthPassword === next.basicAuthPassword
);

type BackgroundFile = BgUrlContextState['backgroundFiles'][number];

type BackgroundEntry = BackgroundFile | string;

const toBackgroundEntry = (value: BackgroundEntry | null | undefined): BackgroundEntry | undefined => {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'object') {
    return value;
  }
  return undefined;
};

const getEntryName = (entry: BackgroundEntry | undefined): string => {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  return entry.name?.trim() || '';
};

const getEntryUrl = (entry: BackgroundEntry | undefined): string => {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  return entry.url?.trim() || '';
};

const normalizeScheme = (value: string): string => {
  if (!value) return value;
  if (/^ws:\/\//i.test(value)) {
    return value.replace(/^ws:\/\//i, 'http://');
  }
  if (/^wss:\/\//i.test(value)) {
    return value.replace(/^wss:\/\//i, 'https://');
  }
  return value;
};

const ensureTrailingSlash = (value: string): string => (
  value.endsWith('/') ? value : `${value}/`
);

const stripProtocolAndHost = (value: string): string => value.replace(/^https?:\/\/[^/]+/i, '');

const stripLeadingSlashes = (value: string): string => value.replace(/^[/\\]+/, '');

const stripBgPrefix = (value: string): string => value.replace(/^bg[/\\]/i, '');

const computeBackgroundOptionValue = (entry: BackgroundEntry): string => {
  const name = getEntryName(entry);
  if (name) {
    return name;
  }
  const url = getEntryUrl(entry);
  if (!url) {
    return '';
  }
  const filename = url.split('/').filter(Boolean).pop();
  return filename || url;
};

const matchBackgroundFile = (
  candidateRaw: string,
  files?: BackgroundEntry[],
): BackgroundEntry | undefined => {
  const entries = files
    ?.map((value) => toBackgroundEntry(value))
    .filter((value): value is BackgroundEntry => Boolean(value));

  if (!entries?.length) {
    return undefined;
  }
  const candidate = candidateRaw.trim();
  if (!candidate) {
    return undefined;
  }

  const candidateWithoutHost = stripProtocolAndHost(candidate);
  const candidateWithoutLeading = stripLeadingSlashes(candidateWithoutHost);
  const candidateCore = stripBgPrefix(candidateWithoutLeading);

  return entries.find((entry) => {
    const sources = [getEntryUrl(entry), getEntryName(entry)].filter(Boolean);
    if (!sources.length) {
      return false;
    }
    return sources.some((source) => {
      const trimmedSource = source.trim();
      const sourceWithoutHost = stripProtocolAndHost(trimmedSource);
      const sourceWithoutLeading = stripLeadingSlashes(sourceWithoutHost);
      const sourceCore = stripBgPrefix(sourceWithoutLeading);

      return candidate === trimmedSource
        || candidateWithoutLeading === sourceWithoutLeading
        || candidateCore === sourceCore;
    });
  });
};

const normalizeBackgroundResourcePath = (
  value: string,
  fallbackToBgDirectory: boolean,
): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  if (trimmed.startsWith('bg/')) {
    return `/${trimmed}`;
  }
  if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed;
  }
  if (fallbackToBgDirectory) {
    if (trimmed.includes('/')) {
      return `/${trimmed}`;
    }
    return `/bg/${trimmed}`;
  }
  return trimmed;
};

const resolveBackgroundUrl = (
  candidate: string | undefined,
  baseUrl: string,
  files?: BackgroundEntry[],
  matchedFile?: BackgroundEntry,
): string | undefined => {
  const trimmedCandidate = candidate?.trim();
  if (!trimmedCandidate) {
    return undefined;
  }
  const normalizedBase = ensureTrailingSlash(normalizeScheme(baseUrl));
  const entries = files
    ?.map((value) => toBackgroundEntry(value))
    .filter((value): value is BackgroundEntry => Boolean(value));
  const file = matchedFile ?? matchBackgroundFile(trimmedCandidate, entries);
  const rawSource = [
    getEntryUrl(file),
    getEntryName(file),
    trimmedCandidate,
  ].find((value) => Boolean(value && value.trim())) || trimmedCandidate;

  const rawValue = normalizeScheme(rawSource);

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  const resourcePath = normalizeBackgroundResourcePath(rawValue, Boolean(file));
  if (!resourcePath) {
    return undefined;
  }

  try {
    return new URL(resourcePath, normalizedBase).toString();
  } catch (error) {
    console.error('Failed to resolve background URL:', {
      candidate: trimmedCandidate,
      resourcePath,
      baseUrl: normalizedBase,
      error,
    });
    return resourcePath;
  }
};

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
  basicAuthEnabled,
  basicAuthUsername,
  basicAuthPassword,
  onBasicAuthEnabledChange,
  onBasicAuthUsernameChange,
  onBasicAuthPasswordChange,
}: UseGeneralSettingsProps) => {
  const { showSubtitle, setShowSubtitle } = useSubtitle();
  const { setUseCameraBackground } = bgUrlContext || {};
  const { startBackgroundCamera, stopBackgroundCamera } = useCamera();
  const { configFiles, getFilenameByName } = useConfig();
  const { switchCharacter } = useSwitchCharacter();

  const getCurrentBgKey = (): string[] => {
    if (!bgUrlContext?.backgroundUrl) return [];
    const currentBgUrl = bgUrlContext.backgroundUrl.trim();
    const entries = (bgUrlContext.backgroundFiles ?? []) as unknown as BackgroundEntry[];

    if (entries.length > 0) {
      const matched = entries.find((entry) => {
        const source = typeof entry === 'string'
          ? entry
          : entry?.url ?? entry?.name ?? '';
        const absolute = resolveBackgroundUrl(source, baseUrl, entries, entry);
        return absolute === currentBgUrl;
      });
      if (matched) {
        return [computeBackgroundOptionValue(matched)];
      }
    }

    return [];
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
    basicAuthEnabled,
    basicAuthUsername,
    basicAuthPassword,
  };

  const [settings, setSettings] = useState<GeneralSettings>(initialSettings);
  const [originalSettings, setOriginalSettings] = useState<GeneralSettings>(initialSettings);
  const originalConfName = confName;
  const [basicAuthErrors, setBasicAuthErrors] = useState<BasicAuthErrors>({});

  const validateBasicAuth = useCallback((
    enabled: boolean,
    username: string,
    password: string,
  ): boolean => {
    if (!enabled) {
      setBasicAuthErrors({});
      return true;
    }

    const errors: BasicAuthErrors = {};

    if (!username.trim()) {
      errors.username = i18n.t('settings.general.basicAuthUsernameRequired');
    }

    if (!password.trim()) {
      errors.password = i18n.t('settings.general.basicAuthPasswordRequired');
    }

    setBasicAuthErrors(errors);
    return Object.keys(errors).length === 0;
  }, [setBasicAuthErrors, i18n.language]);

  useEffect(() => {
    console.debug('[useGeneralSettings] settings effect triggered', settings);
    setShowSubtitle(settings.showSubtitle);

    const newBgSelection = settings.customBgUrl || settings.selectedBgUrl[0];
    if (bgUrlContext) {
      const resolvedBackground = resolveBackgroundUrl(
        newBgSelection,
        baseUrl,
        (bgUrlContext.backgroundFiles ?? []) as unknown as BackgroundEntry[],
      );
      if (resolvedBackground && resolvedBackground !== bgUrlContext.backgroundUrl) {
        bgUrlContext.setBackgroundUrl(resolvedBackground);
      }
    }

    onWsUrlChange(settings.wsUrl);
    onBaseUrlChange(settings.baseUrl);
    validateBasicAuth(
      settings.basicAuthEnabled,
      settings.basicAuthUsername,
      settings.basicAuthPassword,
    );

    // Apply language change if it differs from current language
    if (settings.language && settings.language[0] && settings.language[0] !== i18n.language) {
      i18n.changeLanguage(settings.language[0]);
    }
    localStorage.setItem(IMAGE_COMPRESSION_QUALITY_KEY, settings.imageCompressionQuality.toString());
    localStorage.setItem(IMAGE_MAX_WIDTH_KEY, settings.imageMaxWidth.toString());
  }, [
    settings,
    bgUrlContext,
    baseUrl,
    onWsUrlChange,
    onBaseUrlChange,
    setShowSubtitle,
    validateBasicAuth,
  ]);

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

  const handleSettingChange = (
    key: keyof GeneralSettings,
    value: GeneralSettings[keyof GeneralSettings],
  ): void => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value } as GeneralSettings;
      if (
        key === 'basicAuthEnabled'
        || key === 'basicAuthUsername'
        || key === 'basicAuthPassword'
      ) {
        validateBasicAuth(
          next.basicAuthEnabled,
          next.basicAuthUsername,
          next.basicAuthPassword,
        );
      }
      return next;
    });

    if (key === 'wsUrl') {
      onWsUrlChange(value as string);
    }
    if (key === 'baseUrl') {
      onBaseUrlChange(value as string);
    }
    if (key === 'basicAuthEnabled') {
      onBasicAuthEnabledChange(value as boolean);
    }
    if (key === 'basicAuthUsername') {
      onBasicAuthUsernameChange(value as string);
    }
    if (key === 'basicAuthPassword') {
      onBasicAuthPasswordChange(value as string);
    }
    // Immediately change language when it's updated
    if (key === 'language' && Array.isArray(value) && value.length > 0) {
      i18n.changeLanguage(value[0]);
    }
  };

  const handleSave = useCallback((): boolean => {
    const isValid = validateBasicAuth(
      settings.basicAuthEnabled,
      settings.basicAuthUsername,
      settings.basicAuthPassword,
    );
    if (!isValid) {
      return false;
    }

    const changedSinceLastSave = !settingsEqual(originalSettings, settings);
    setOriginalSettings(settings);

    if (changedSinceLastSave && typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.location.reload();
      }, 200);
    }

    return true;
  }, [settings, originalSettings, validateBasicAuth, setOriginalSettings]);

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
    onBasicAuthEnabledChange(originalSettings.basicAuthEnabled);
    onBasicAuthUsernameChange(originalSettings.basicAuthUsername);
    onBasicAuthPasswordChange(originalSettings.basicAuthPassword);
    validateBasicAuth(
      originalSettings.basicAuthEnabled,
      originalSettings.basicAuthUsername,
      originalSettings.basicAuthPassword,
    );

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

  useEffect(() => {
    if (!onSave || !onCancel) return;

    const cleanupSave = onSave(handleSave);

    const cleanupCancel = onCancel(() => {
      handleCancel();
    });

    return () => {
      cleanupSave?.();
      cleanupCancel?.();
    };
  }, [onSave, onCancel, handleSave, handleCancel]);

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
    basicAuthErrors,
  };
};
