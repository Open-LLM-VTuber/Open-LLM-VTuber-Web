import {
  createContext, useMemo, useContext, useState, useCallback, useEffect,
} from 'react';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { useWebSocket } from './websocket-context';

/**
 * Background file interface
 * @interface BackgroundFile
 */
interface BackgroundFile {
  name: string;
  url: string;
}

/**
 * Background URL context state interface
 * @interface BgUrlContextState
 */
export interface BgUrlContextState {
  backgroundUrl: string;
  setBackgroundUrl: (url: string) => void;
  backgroundFiles: BackgroundFile[];
  setBackgroundFiles: (files: BackgroundFile[]) => void;
  resetBackground: () => void;
  addBackgroundFile: (file: BackgroundFile) => void;
  removeBackgroundFile: (name: string) => void;
  isDefaultBackground: boolean;
  useCameraBackground: boolean;
  setUseCameraBackground: (use: boolean) => void;
}

/**
 * Create the background URL context
 */
const BgUrlContext = createContext<BgUrlContextState | null>(null);

/**
 * Background URL Provider Component
 * @param {Object} props - Provider props
 * @param {React.ReactNode} props.children - Child components
 */
const normalizeBackgroundUrl = (base: string, resource?: string) => {
  if (resource === undefined || resource === null) {
    return '';
  }
  const normalizeScheme = (value: string) => {
    if (!value) return value;
    if (value.startsWith('ws://')) return `http://${value.slice(5)}`;
    if (value.startsWith('wss://')) return `https://${value.slice(6)}`;
    return value;
  };

  const safeBase = normalizeScheme(base);
  const safeResource = normalizeScheme(resource);

  try {
    return new URL(safeResource).toString();
  } catch {
    try {
      return new URL(safeResource, safeBase).toString();
    } catch {
      return safeResource;
    }
  }
};

export function BgUrlProvider({ children }: { children: React.ReactNode }) {
  const { baseUrl } = useWebSocket();
  const DEFAULT_BACKGROUND = normalizeBackgroundUrl(baseUrl, '/bg/ceiling-window-room-night.jpeg');
  console.debug('[BgUrl] Provider init', { baseUrl, DEFAULT_BACKGROUND });

  const [storedBackgroundUrl, setStoredBackgroundUrl] = useLocalStorage<string>(
    'backgroundUrl',
    DEFAULT_BACKGROUND,
  );
  const backgroundUrl = useMemo(
    () => normalizeBackgroundUrl(baseUrl, storedBackgroundUrl),
    [baseUrl, storedBackgroundUrl],
  );
  const setBackgroundUrl = useCallback((value: string) => {
    const normalized = normalizeBackgroundUrl(baseUrl, value);
    console.debug('[BgUrl] setBackgroundUrl', { value, normalized });
    setStoredBackgroundUrl(normalized);
  }, [baseUrl, setStoredBackgroundUrl]);

  // State for background files list
  const [backgroundFilesState, setBackgroundFilesState] = useState<BackgroundFile[]>([]);
  const backgroundFiles = backgroundFilesState;
  const setBackgroundFiles = useCallback((files: BackgroundFile[]) => {
    console.debug('[BgUrl] setBackgroundFiles', { incoming: files });
    setBackgroundFilesState(files);
  }, []);

  // Reset background to default
  const resetBackground = useCallback(() => {
    setBackgroundUrl(DEFAULT_BACKGROUND);
  }, [setBackgroundUrl, DEFAULT_BACKGROUND]);

  // Add new background file
  const addBackgroundFile = useCallback((file: BackgroundFile) => {
    console.debug('[BgUrl] addBackgroundFile', file);
    setBackgroundFilesState((prev) => [
      ...prev,
      file,
    ]);
  }, []);

  // Remove background file
  const removeBackgroundFile = useCallback((name: string) => {
    setBackgroundFilesState((prev) => prev.filter((file) => file.name !== name));
  }, []);

  // Check if current background is default
  const isDefaultBackground = useMemo(
    () => backgroundUrl === DEFAULT_BACKGROUND,
    [backgroundUrl, DEFAULT_BACKGROUND],
  );

  const [useCameraBackground, setUseCameraBackground] = useState<boolean>(false);

  useEffect(() => {
    if (storedBackgroundUrl !== backgroundUrl) {
      console.debug('[BgUrl] syncing storedBackgroundUrl', { storedBackgroundUrl, backgroundUrl });
      setStoredBackgroundUrl(backgroundUrl);
    }
  }, [storedBackgroundUrl, backgroundUrl, setStoredBackgroundUrl]);

  useEffect(() => {
    console.debug('[BgUrl] backgroundFilesState updated', backgroundFilesState);
  }, [backgroundFilesState]);

  useEffect(() => {
    console.debug('[BgUrl] baseUrl changed', baseUrl);
  }, [baseUrl]);

  // Memoized context value
  const contextValue = useMemo(() => ({
    backgroundUrl,
    setBackgroundUrl,
    backgroundFiles,
    setBackgroundFiles,
    resetBackground,
    addBackgroundFile,
    removeBackgroundFile,
    isDefaultBackground,
    useCameraBackground,
    setUseCameraBackground,
  }), [backgroundUrl, setBackgroundUrl, backgroundFiles, setBackgroundFiles, resetBackground, addBackgroundFile, removeBackgroundFile, isDefaultBackground, useCameraBackground, baseUrl]);

  return (
    <BgUrlContext.Provider value={contextValue}>
      {children}
    </BgUrlContext.Provider>
  );
}

/**
 * Custom hook to use the background URL context
 * @throws {Error} If used outside of BgUrlProvider
 */
export function useBgUrl() {
  const context = useContext(BgUrlContext);

  if (!context) {
    throw new Error('useBgUrl must be used within a BgUrlProvider');
  }

  return context;
}
