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
import { streamAudioPlayer } from '@/utils/stream-audio-player';
import { toaster } from '@/components/ui/toaster';
import { useWebSocket } from '@/context/websocket-context';
import { DisplayText } from '@/services/websocket-service';
import { useLive2DExpression } from '@/hooks/canvas/use-live2d-expression';
import * as LAppDefine from '../../../WebSDK/src/lappdefine';

// Simple type alias for Live2D model
type Live2DModel = any;

interface AudioTaskOptions {
  audioBase64: string
  volumes: number[]
  sliceLength: number
  displayText?: DisplayText | null
  expressions?: string[] | number[] | null
  speaker_uid?: string
  forwarded?: boolean
}

interface StreamAudioTaskOptions {
  streamId: string
  displayText?: DisplayText | null
  expressions?: string[] | number[] | null
  forwarded?: boolean
}

/**
 * Custom hook for handling audio playback tasks with Live2D lip sync
 */
export const useAudioTask = () => {
  const { t } = useTranslation();
  const { aiState, backendSynthComplete, setBackendSynthComplete } = useAiState();
  const { setSubtitleText } = useSubtitle();
  const { appendResponse, appendAIMessage } = useChatHistory();
  const { sendMessage } = useWebSocket();
  const { setExpression } = useLive2DExpression();

  // State refs to avoid stale closures
  const stateRef = useRef({
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  });

  // Note: currentAudioRef and currentModelRef are now managed by the global audioManager

  stateRef.current = {
    aiState,
    setSubtitleText,
    appendResponse,
    appendAIMessage,
  };

  /**
   * Stop current audio playback and lip sync (delegates to global audioManager)
   */
  const stopCurrentAudioAndLipSync = useCallback(() => {
    audioManager.stopCurrentAudioAndLipSync();
  }, []);

  /**
   * Handle audio playback with Live2D lip sync
   */
  const handleAudioPlayback = (options: AudioTaskOptions): Promise<void> => new Promise((resolve) => {
    const {
      aiState: currentAiState,
      setSubtitleText: updateSubtitle,
      appendResponse: appendText,
      appendAIMessage: appendAI,
    } = stateRef.current;

    // Skip if already interrupted
    if (currentAiState === 'interrupted') {
      console.warn('Audio playback blocked by interruption state.');
      resolve();
      return;
    }

    const { audioBase64, displayText, expressions, forwarded } = options;

    // Update display text
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
      // Process audio if available
      if (audioBase64) {
        const audioDataUrl = `data:audio/wav;base64,${audioBase64}`;

        // Get Live2D manager and model
        const live2dManager = (window as any).getLive2DManager?.();
        if (!live2dManager) {
          console.error('Live2D manager not found');
          resolve();
          return;
        }

        const model = live2dManager.getModel(0);
        if (!model) {
          console.error('Live2D model not found at index 0');
          resolve();
          return;
        }
        console.log('Found model for audio playback');

        if (!model._wavFileHandler) {
          console.warn('Model does not have _wavFileHandler for lip sync');
        } else {
          console.log('Model has _wavFileHandler available');
        }

        // Set expression if available
        const lappAdapter = (window as any).getLAppAdapter?.();
        if (lappAdapter && expressions?.[0] !== undefined) {
          setExpression(
            expressions[0],
            lappAdapter,
            `Set expression to: ${expressions[0]}`,
          );
        }

        // Start talk motion
        if (LAppDefine && LAppDefine.PriorityNormal) {
          console.log("Starting random 'Talk' motion");
          model.startRandomMotion(
            "Talk",
            LAppDefine.PriorityNormal,
          );
        } else {
          console.warn("LAppDefine.PriorityNormal not found - cannot start talk motion");
        }

        // Setup audio element
        const audio = new Audio(audioDataUrl);
        
        // Register with global audio manager IMMEDIATELY after creating audio
        audioManager.setCurrentAudio(audio, model);
        let isFinished = false;

        const cleanup = () => {
          audioManager.clearCurrentAudio(audio);
          if (!isFinished) {
            isFinished = true;
            resolve();
          }
        };

        // Enhance lip sync sensitivity
        const lipSyncScale = 2.0;

        audio.addEventListener('canplaythrough', () => {
          // Check for interruption before playback
          if (stateRef.current.aiState === 'interrupted' || !audioManager.hasCurrentAudio()) {
            console.warn('Audio playback cancelled due to interruption or audio was stopped');
            cleanup();
            return;
          }

          console.log('Starting audio playback with lip sync');
          audio.play().catch((err) => {
            console.error("Audio play error:", err);
            cleanup();
          });

          // Setup lip sync
          if (model._wavFileHandler) {
            if (!model._wavFileHandler._initialized) {
              console.log('Applying enhanced lip sync');
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
            } else {
              console.warn('WavFileHandler start skipped - audio was stopped');
            }
          }
        });

        audio.addEventListener('ended', () => {
          console.log("Audio playback completed");
          cleanup();
        });

        audio.addEventListener('error', (error) => {
          console.error("Audio playback error:", error);
          cleanup();
        });

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
   * Handle streamed audio playback (chunked PCM via streamAudioPlayer)
   * with the same display/expression handling as file-based playback.
   * Lip sync comes from the stream player's analyser (see lappmodel.ts).
   */
  const handleStreamAudioPlayback = async (options: StreamAudioTaskOptions): Promise<void> => {
    const {
      aiState: currentAiState,
      setSubtitleText: updateSubtitle,
      appendResponse: appendText,
      appendAIMessage: appendAI,
    } = stateRef.current;

    if (currentAiState === 'interrupted') {
      console.warn('Stream audio playback blocked by interruption state.');
      streamAudioPlayer.dropStream(options.streamId);
      return;
    }

    const { streamId, displayText, expressions, forwarded } = options;

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

    try {
      const live2dManager = (window as any).getLive2DManager?.();
      const model = live2dManager?.getModel(0);

      const lappAdapter = (window as any).getLAppAdapter?.();
      if (lappAdapter && expressions?.[0] !== undefined) {
        setExpression(
          expressions[0],
          lappAdapter,
          `Set expression to: ${expressions[0]}`,
        );
      }

      if (model && LAppDefine && LAppDefine.PriorityNormal) {
        model.startRandomMotion("Talk", LAppDefine.PriorityNormal);
      }

      await streamAudioPlayer.play(streamId);
      console.log('Stream audio playback completed');
    } catch (error) {
      console.error('Stream audio playback error:', error);
      toaster.create({
        title: `${t('error.audioPlayback')}: ${error}`,
        type: "error",
        duration: 2000,
      });
    }
  };

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

  /**
   * Add a new audio task to the queue
   */
  const addAudioTask = async (options: AudioTaskOptions) => {
    const { aiState: currentState } = stateRef.current;

    if (currentState === 'interrupted') {
      console.log('Skipping audio task due to interrupted state');
      return;
    }

    console.log(`Adding audio task ${options.displayText?.text} to queue`);
    audioTaskQueue.addTask(() => handleAudioPlayback(options));
  };

  /**
   * Add a streamed audio task to the queue. Rides the same queue as
   * file-based tasks, so sentence order is preserved across both kinds.
   */
  const addStreamAudioTask = async (options: StreamAudioTaskOptions) => {
    const { aiState: currentState } = stateRef.current;

    if (currentState === 'interrupted') {
      console.log('Skipping stream audio task due to interrupted state');
      streamAudioPlayer.dropStream(options.streamId);
      return;
    }

    console.log(`Adding stream audio task ${options.displayText?.text} to queue`);
    audioTaskQueue.addTask(() => handleStreamAudioPlayback(options));
  };

  return {
    addAudioTask,
    addStreamAudioTask,
    appendResponse,
    stopCurrentAudioAndLipSync,
  };
};
