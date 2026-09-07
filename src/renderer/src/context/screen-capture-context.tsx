import {
  createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from "@/components/ui/toaster";

/** A capturable source (screen or window) reported by the Electron main process. */
export interface CaptureSourceInfo {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnail: string;
  appIcon: string | null;
  /** Electron Display.id of a 'screen' source (empty when unavailable). */
  display_id?: string;
}

/** Rect of the screen area being shared, normalized (0-1) to the captured stream. */
export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScreenCaptureContextType {
  stream: MediaStream | null;
  isStreaming: boolean;
  error: string;
  /** Name of the source being shared (null when unknown, e.g. browser picker). */
  sharedSourceName: string | null;
  /** id of the source being shared (null when unknown). */
  sharedSourceId: string | null;
  /** Currently selected region, or null to share the full stream. */
  captureRegion: CaptureRegion | null;
  setCaptureRegion: (region: CaptureRegion | null) => void;
  /** Start sharing. `sourceId` selects a screen/window in Electron;
   *  omitted keeps the legacy behaviour (first screen / browser picker). */
  startCapture: (sourceId?: string, sourceName?: string) => Promise<void>;
  stopCapture: () => void;
}

const ScreenCaptureContext = createContext<ScreenCaptureContextType | undefined>(undefined);

export function ScreenCaptureProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [sharedSourceName, setSharedSourceName] = useState<string | null>(null);
  const [sharedSourceId, setSharedSourceId] = useState<string | null>(null);
  const [captureRegion, setCaptureRegion] = useState<CaptureRegion | null>(null);
  // Keeps the latest stream around for callbacks (track "ended" listener).
  const streamRef = useRef<MediaStream | null>(null);
  // Latest startCapture for IPC listeners (it is re-created every render).
  const startCaptureRef = useRef<(sourceId?: string, sourceName?: string) => Promise<void>>(
    async () => {},
  );

  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
    }
    setStream(null);
    setIsStreaming(false);
    setCaptureRegion(null);
    setSharedSourceName(null);
    setSharedSourceId(null);
  }, []);

  const startCapture = async (sourceId?: string, sourceName?: string) => {
    try {
      // Switching sources while streaming: release the previous stream first
      // so the OS capture indicator does not stay on for the old source.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
        streamRef.current = null;
      }

      let mediaStream: MediaStream;

      if (window.electron) {
        // No explicit source: keep the legacy behaviour (first screen).
        const effectiveSourceId =
          sourceId ?? (await window.electron.ipcRenderer.invoke('get-screen-capture'));

        const displayMediaOptions: DisplayMediaStreamOptions = {
          video: {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: effectiveSourceId,
              // Window sources keep their native aspect ratio; screens stay at
              // the original 1280x720 for backward compatibility.
              ...(effectiveSourceId.startsWith('window:')
                ? { maxWidth: 1920, maxHeight: 1080 }
                : {
                    minWidth: 1280,
                    maxWidth: 1280,
                    minHeight: 720,
                    maxHeight: 720,
                  }),
            },
          },
          audio: false,
        };

        mediaStream = await navigator.mediaDevices.getUserMedia(displayMediaOptions);
      } else {
        const displayMediaOptions: DisplayMediaStreamOptions = {
          video: true,
          audio: false,
        };
        mediaStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setIsStreaming(true);
      setError('');
      setCaptureRegion(null);
      setSharedSourceName(sourceName ?? null);
      setSharedSourceId(sourceId ?? null);

      // Browser "Stop sharing" button or a closed source window ends the track.
      const [track] = mediaStream.getVideoTracks();
      if (track) {
        track.onended = () => {
          stopCapture();
        };
      }
    } catch (err) {
      setError(t('error.failedStartScreenCapture'));
      toaster.create({
        title: `${t('error.failedStartScreenCapture')}: ${err}`,
        type: 'error',
        duration: 2000,
      });
      console.error(err);
    }
  };

  startCaptureRef.current = startCapture;

  // Results from the dedicated share-picker window (opened from the sidebar
  // screen panel and the pet-mode share button): start sharing the picked
  // source, optionally cropped to the picked region.
  useEffect(() => {
    if (!window.electron) return undefined;

    const handleResult = (
      _event: unknown,
      payload: { sourceId: string; sourceName?: string; region: CaptureRegion | null },
    ) => {
      (async () => {
        await startCaptureRef.current(payload.sourceId, payload.sourceName);
        setCaptureRegion(payload.region ?? null);
      })();
    };
    const handleStop = () => {
      stopCapture();
    };

    window.electron.ipcRenderer.on('share-picker-result', handleResult);
    window.electron.ipcRenderer.on('share-picker-stop', handleStop);
    return () => {
      window.electron?.ipcRenderer.removeListener('share-picker-result', handleResult);
      window.electron?.ipcRenderer.removeListener('share-picker-stop', handleStop);
    };
  }, [stopCapture]);

  return (
    <ScreenCaptureContext.Provider
      // eslint-disable-next-line react/jsx-no-constructed-context-values
      value={{
        stream,
        isStreaming,
        error,
        sharedSourceName,
        sharedSourceId,
        captureRegion,
        setCaptureRegion,
        startCapture,
        stopCapture,
      }}
    >
      {children}
    </ScreenCaptureContext.Provider>
  );
}

export const useScreenCaptureContext = () => {
  const context = useContext(ScreenCaptureContext);
  if (context === undefined) {
    throw new Error('useScreenCaptureContext must be used within a ScreenCaptureProvider');
  }
  return context;
};
