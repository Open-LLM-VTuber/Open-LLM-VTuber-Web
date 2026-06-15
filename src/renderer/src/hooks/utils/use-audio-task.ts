/* eslint-disable func-names */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiState } from '@/context/ai-state-context';
import { useSubtitle } from '@/context/subtitle-context';
import { useChatHistory } from '@/context/chat-history-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { audioManager } from '@/utils/audio-manager';
import { toaster } from '@/components/ui/toaster';
import { useWebSocket } from '@/context/websocket-context';
import { DisplayText, wsService } from '@/services/websocket-service';
import { useLive2DExpression } from '@/hooks/canvas/use-live2d-expression';
import * as LAppDefine from '../../../WebSDK/src/lappdefine';

interface AudioTaskOptions {
  audioBase64: string
  volumes: number[]
  sliceLength: number
  displayText?: DisplayText | null
  expressions?: string[] | number[] | null
  speaker_uid?: string
  forwarded?: boolean
}

interface StreamingAudioOptions {
  displayText?: DisplayText | null
  actions?: { expressions?: string[] | number[]; pictures?: string[]; sounds?: string[] } | null
  sampleRate: number
  forwarded?: boolean
}

export const useAudioTask = () => {
  const { t } = useTranslation();
  const { aiState, backendSynthComplete, setBackendSynthComplete } = useAiState();
  const { setSubtitleText } = useSubtitle();
  const { appendResponse, appendAIMessage } = useChatHistory();
  const { sendMessage } = useWebSocket();
  const { setExpression } = useLive2DExpression();

  const stateRef = useRef({
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  });

  stateRef.current = {
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  };

  // Track binary subscription for streaming
  const binarySubRef = useRef<{ unsubscribe: () => void } | null>(null);

  const stopCurrentAudioAndLipSync = useCallback(() => {
    audioManager.stopCurrentAudioAndLipSync();
  }, []);

  /**
   * Get Live2D model and set up expression + talk motion
   */
  const setupLive2D = (expressions?: string[] | number[] | null) => {
    const live2dManager = (window as any).getLive2DManager?.();
    if (!live2dManager) return null;
    const model = live2dManager.getModel(0);
    if (!model) return null;

    const lappAdapter = (window as any).getLAppAdapter?.();
    if (lappAdapter && expressions?.[0] !== undefined) {
      setExpression(expressions[0], lappAdapter, `Set expression to: ${expressions[0]}`);
    }

    if (LAppDefine?.PriorityNormal) {
      model.startRandomMotion("Talk", LAppDefine.PriorityNormal);
    }

    return model;
  };

  /**
   * Handle non-streaming audio playback with Live2D lip sync
   */
  const handleAudioPlayback = (options: AudioTaskOptions): Promise<void> => new Promise((resolve) => {
    const {
      aiState: currentAiState,
      setSubtitleText: updateSubtitle,
      appendResponse: appendText,
      appendAIMessage: appendAI,
    } = stateRef.current;

    if (currentAiState === 'interrupted') {
      resolve();
      return;
    }

    const { audioBase64, displayText, expressions, forwarded } = options;

    if (displayText) {
      appendText(displayText.text);
      appendAI(displayText.text, displayText.name, displayText.avatar);
      if (audioBase64) {
        updateSubtitle(displayText.text);
      }
      if (!forwarded) {
        sendMessage({
          type: "audio-play-start",
          display_text: displayText,
          forwarded: true,
        });
      }
    }

    try {
      if (audioBase64) {
        const audioDataUrl = `data:audio/wav;base64,${audioBase64}`;
        const model = setupLive2D(expressions);

        if (!model) {
          console.error('Live2D model not found');
          resolve();
          return;
        }

        const audio = new Audio(audioDataUrl);
        audioManager.setCurrentAudio(audio, model);
        let isFinished = false;

        const cleanup = () => {
          audioManager.clearCurrentAudio(audio);
          if (!isFinished) {
            isFinished = true;
            resolve();
          }
        };

        const lipSyncScale = 2.0;

        audio.addEventListener('canplaythrough', () => {
          if (stateRef.current.aiState === 'interrupted' || !audioManager.hasCurrentAudio()) {
            cleanup();
            return;
          }

          audio.play().catch((err) => {
            console.error("Audio play error:", err);
            cleanup();
          });

          if (model._wavFileHandler) {
            if (!model._wavFileHandler._initialized) {
              model._wavFileHandler._initialized = true;
              const originalUpdate = model._wavFileHandler.update.bind(model._wavFileHandler);
              model._wavFileHandler.update = function (deltaTimeSeconds: number) {
                const result = originalUpdate(deltaTimeSeconds);
                // @ts-ignore
                this._lastRms = Math.min(2.0, this._lastRms * lipSyncScale);
                return result;
              };
            }

            if (audioManager.hasCurrentAudio()) {
              model._wavFileHandler.start(audioDataUrl);
            }
          }
        });

        audio.addEventListener('ended', () => cleanup());
        audio.addEventListener('error', () => cleanup());
        audio.load();
      } else {
        resolve();
      }
    } catch (error) {
      console.error('Audio playback setup error:', error);
      toaster.create({
        title: `${t('error.audioPlayback')}: ${error}`,
        type: "error",
        duration: 2000,
      });
      resolve();
    }
  });

  /**
   * Handle streaming audio with AudioWorklet
   */
  const handleStreamingAudio = (options: StreamingAudioOptions): Promise<void> => new Promise((resolve) => {
    const {
      aiState: currentAiState,
      setSubtitleText: updateSubtitle,
      appendResponse: appendText,
      appendAIMessage: appendAI,
    } = stateRef.current;

    if (currentAiState === 'interrupted') {
      resolve();
      return;
    }

    const { displayText, actions, sampleRate, forwarded } = options;

    if (displayText) {
      appendText(displayText.text);
      appendAI(displayText.text, displayText.name, displayText.avatar);
      updateSubtitle(displayText.text);
      if (!forwarded) {
        sendMessage({
          type: "audio-play-start",
          display_text: displayText,
          forwarded: true,
        });
      }
    }

    const model = setupLive2D(actions?.expressions);
    if (!model) {
      console.error('Live2D model not found for streaming');
      resolve();
      return;
    }

    audioManager.startStream(sampleRate, model).then(() => {
      // Subscribe to binary frames for this stream
      binarySubRef.current = wsService.onBinary((data: ArrayBuffer) => {
        audioManager.feedStream(data);
      });
    }).catch((err) => {
      console.error('Failed to start audio stream:', err);
      resolve();
    });

    // Store resolve for when stream ends
    (audioManager as any)._taskResolve = resolve;
  });

  /**
   * Called when audio-stream-end is received
   */
  const endStreamingAudio = useCallback(() => {
    // Unsubscribe from binary frames
    if (binarySubRef.current) {
      binarySubRef.current.unsubscribe();
      binarySubRef.current = null;
    }

    audioManager.endStream().then(() => {
      const resolve = (audioManager as any)._taskResolve;
      if (resolve) {
        resolve();
        (audioManager as any)._taskResolve = null;
      }
    });
  }, []);

  // Handle backend synthesis completion
  useEffect(() => {
    let isMounted = true;

    const handleComplete = async () => {
      await audioTaskQueue.waitForCompletion();
      if (isMounted && backendSynthComplete) {
        stopCurrentAudioAndLipSync();
        sendMessage({ type: "frontend-playback-complete" });
        setBackendSynthComplete(false);
      }
    };

    handleComplete();

    return () => {
      isMounted = false;
    };
  }, [backendSynthComplete, sendMessage, setBackendSynthComplete, stopCurrentAudioAndLipSync]);

  const addAudioTask = async (options: AudioTaskOptions) => {
    const { aiState: currentState } = stateRef.current;

    if (currentState === 'interrupted') {
      return;
    }

    audioTaskQueue.addTask(() => handleAudioPlayback(options));
  };

  const addStreamingAudioTask = async (options: StreamingAudioOptions) => {
    const { aiState: currentState } = stateRef.current;

    if (currentState === 'interrupted') {
      return;
    }

    audioTaskQueue.addTask(() => handleStreamingAudio(options));
  };

  return {
    addAudioTask,
    addStreamingAudioTask,
    endStreamingAudio,
    appendResponse,
    stopCurrentAudioAndLipSync,
  };
};
