import {
  createContext, useState, useMemo, useContext, memo,
} from 'react';

/**
 * Subtitle styling configuration
 * @interface SubtitleConfig
 */
export interface SubtitleConfig {
  fontSize: string
  color: string
  backgroundColor: string
  fontFamily: string
}

/**
 * Subtitle context state interface
 * @interface SubtitleState
 */
interface SubtitleState {
  /** Current subtitle text */
  subtitleText: string

  /** Set subtitle text */
  setSubtitleText: (text: string) => void

  /** Whether to show subtitle */
  showSubtitle: boolean

  /** Toggle subtitle visibility */
  setShowSubtitle: (show: boolean) => void

  /** Subtitle style configuration */
  subtitleConfig: SubtitleConfig

  /** Update subtitle style configuration */
  setSubtitleConfig: (config: Partial<SubtitleConfig>) => void
}

/**
 * Default values and constants
 */
const DEFAULT_SUBTITLE = {
  text: "Hi, I'm some random AI VTuber. Who the hell are ya? "
        + 'Ahh, you must be amazed by my awesomeness, right? right?',
  config: {
    fontSize: '1.5rem',
    color: 'white',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    fontFamily: 'inherit',
  },
};

const SUBTITLE_CONFIG_KEY = 'appSubtitleConfig';

/**
 * Create the subtitle context
 */
export const SubtitleContext = createContext<SubtitleState | null>(null);

/**
 * Subtitle Provider Component
 * Manages the subtitle display text state
 *
 * @param {Object} props - Provider props
 * @param {React.ReactNode} props.children - Child components
 */
export const SubtitleProvider = memo(({ children }: { children: React.ReactNode }) => {
  // State management
  const [subtitleText, setSubtitleText] = useState<string>(DEFAULT_SUBTITLE.text);
  const [showSubtitle, setShowSubtitle] = useState<boolean>(true);

  const [subtitleConfig, setSubtitleConfigState] = useState<SubtitleConfig>(() => {
    const savedConfig = localStorage.getItem(SUBTITLE_CONFIG_KEY);
    if (savedConfig) {
      try {
        return { ...DEFAULT_SUBTITLE.config, ...JSON.parse(savedConfig) };
      } catch (e) {
        console.error('Failed to parse subtitle config', e);
      }
    }
    return DEFAULT_SUBTITLE.config;
  });

  const setSubtitleConfig = (config: Partial<SubtitleConfig>) => {
    setSubtitleConfigState((prev) => {
      const newConfig = { ...prev, ...config };
      localStorage.setItem(SUBTITLE_CONFIG_KEY, JSON.stringify(newConfig));
      return newConfig;
    });
  };

  // Memoized context value
  const contextValue = useMemo(
    () => ({
      subtitleText,
      setSubtitleText,
      showSubtitle,
      setShowSubtitle,
      subtitleConfig,
      setSubtitleConfig,
    }),
    [subtitleText, showSubtitle, subtitleConfig],
  );

  return (
    <SubtitleContext.Provider value={contextValue}>
      {children}
    </SubtitleContext.Provider>
  );
});

/**
 * Custom hook to use the subtitle context
 * @throws {Error} If used outside of SubtitleProvider
 */
export function useSubtitle() {
  const context = useContext(SubtitleContext);

  if (!context) {
    throw new Error('useSubtitle must be used within a SubtitleProvider');
  }

  return context;
}
