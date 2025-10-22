/* eslint-disable no-sparse-arrays */
/* eslint-disable react-hooks/exhaustive-deps */
// eslint-disable-next-line object-curly-newline
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { wsService, MessageEvent, type WebSocketConnectionState } from '@/services/websocket-service';
import {
  WebSocketContext, HistoryInfo, defaultWsUrl, defaultBaseUrl,
} from '@/context/websocket-context';
import { ModelInfo, useLive2DConfig } from '@/context/live2d-config-context';
import { useSubtitle } from '@/context/subtitle-context';
import { audioTaskQueue } from '@/utils/task-queue';
import { useAudioTask } from '@/components/canvas/live2d';
import { useBgUrl } from '@/context/bgurl-context';
import { useConfig } from '@/context/character-config-context';
import { useChatHistory } from '@/context/chat-history-context';
import { toaster } from '@/components/ui/toaster';
import { useVAD } from '@/context/vad-context';
import { AiState, useAiState } from "@/context/ai-state-context";
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import { useGroup } from '@/context/group-context';
import { useInterrupt } from '@/hooks/utils/use-interrupt';
import { useBrowser } from '@/context/browser-context';
import { deriveWsUrl, normalizeHttpOrigin, updateBackendConfig } from '@/services/backend-settings';
import { ensureAuthFetchInterceptor } from '@/services/auth-notifier';
import { AUTH_STATUS_EVENT } from '@/constants/events';

const normalizeResourceUrl = (base: string, resource: string) => {
  const normalizeScheme = (value: string) => {
    if (/^ws:\/\//i.test(value)) return value.replace(/^ws:\/\//i, 'http://');
    if (/^wss:\/\//i.test(value)) return value.replace(/^wss:\/\//i, 'https://');
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

function WebSocketHandler({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [wsState, setWsState] = useState<WebSocketConnectionState>('CLOSED');
  const [hasAuthFailure, setHasAuthFailure] = useState(false);
  const [wsUrl, setWsUrl] = useLocalStorage<string>('wsUrl', defaultWsUrl);
  const [baseUrl, setBaseUrl] = useLocalStorage<string>('baseUrl', defaultBaseUrl);
  const [basicAuthEnabled, setBasicAuthEnabled] = useLocalStorage<boolean>('basicAuthEnabled', false);
  const [basicAuthUsername, setBasicAuthUsername] = useLocalStorage<string>('basicAuthUsername', 'admin');
  const [basicAuthPassword, setBasicAuthPassword] = useLocalStorage<string>('basicAuthPassword', 'change-me');
  const { aiState, setAiState, backendSynthComplete, setBackendSynthComplete } = useAiState();
  const { setModelInfo } = useLive2DConfig();
  const { setSubtitleText } = useSubtitle();
  const { clearResponse, setForceNewMessage, appendHumanMessage, appendOrUpdateToolCallMessage } = useChatHistory();
  const { addAudioTask } = useAudioTask();
  const bgUrlContext = useBgUrl();
  const { confUid, setConfName, setConfUid, setConfigFiles } = useConfig();
  const [pendingModelInfo, setPendingModelInfo] = useState<ModelInfo | undefined>(undefined);
  const { setSelfUid, setGroupMembers, setIsOwner } = useGroup();
  const { startMic, stopMic, autoStartMicOnConvEnd } = useVAD();
  const autoStartMicOnConvEndRef = useRef(autoStartMicOnConvEnd);
  const { interrupt } = useInterrupt();
  const { setBrowserViewData } = useBrowser();

  useEffect(() => {
    ensureAuthFetchInterceptor();
  }, []);

  useEffect(() => {
    autoStartMicOnConvEndRef.current = autoStartMicOnConvEnd;
  }, [autoStartMicOnConvEnd]);

  useEffect(() => {
    const listener: EventListener = (event) => {
      const detail = (event as CustomEvent<{ status?: 'authorized' | 'unauthorized' }>).detail;
      if (detail?.status === 'unauthorized') {
        setHasAuthFailure(true);
      } else if (detail?.status === 'authorized') {
        setHasAuthFailure(false);
      }
    };

    window.addEventListener(AUTH_STATUS_EVENT, listener);
    return () => {
      window.removeEventListener(AUTH_STATUS_EVENT, listener);
    };
  }, []);

  useEffect(() => {
    if (!basicAuthEnabled) {
      setHasAuthFailure(false);
    }
  }, [basicAuthEnabled]);

  useEffect(() => {
    if (pendingModelInfo && confUid) {
      setModelInfo(pendingModelInfo);
      setPendingModelInfo(undefined);
    }
  }, [pendingModelInfo, setModelInfo, confUid]);

  const {
    setCurrentHistoryUid, setMessages, setHistoryList,
  } = useChatHistory();

  const handleControlMessage = useCallback((controlText: string) => {
    switch (controlText) {
      case 'start-mic':
        console.log('Starting microphone...');
        startMic();
        break;
      case 'stop-mic':
        console.log('Stopping microphone...');
        stopMic();
        break;
      case 'conversation-chain-start':
        setAiState('thinking-speaking');
        audioTaskQueue.clearQueue();
        clearResponse();
        break;
      case 'conversation-chain-end':
        audioTaskQueue.addTask(() => new Promise<void>((resolve) => {
          setAiState((currentState: AiState) => {
            if (currentState === 'thinking-speaking') {
              // Auto start mic if enabled
              if (autoStartMicOnConvEndRef.current) {
                startMic();
              }
              return 'idle';
            }
            return currentState;
          });
          resolve();
        }));
        break;
      default:
        console.warn('Unknown control command:', controlText);
    }
  }, [setAiState, clearResponse, setForceNewMessage, startMic, stopMic]);

  const handleWebSocketMessage = useCallback((message: MessageEvent) => {
    console.log('Received message from server:', message);
    switch (message.type) {
      case 'control':
        if (message.text) {
          handleControlMessage(message.text);
        }
        break;
      case 'set-model-and-conf':
        setAiState('loading');
        if (message.conf_name) {
          setConfName(message.conf_name);
        }
        if (message.conf_uid) {
          setConfUid(message.conf_uid);
          console.log('confUid', message.conf_uid);
        }
        if (message.client_uid) {
          setSelfUid(message.client_uid);
        }
        if (message.model_info) {
          const normalizedModelInfo = {
            ...message.model_info,
            url: normalizeResourceUrl(baseUrl, message.model_info.url),
          };
          setPendingModelInfo(normalizedModelInfo);
          // setModelInfo(message.model_info);
          // We don't know when the confRef in live2d-config-context will be updated, so we set a delay here for convenience
        } else {
          setPendingModelInfo(undefined);
        }

        setAiState('idle');
        break;
      case 'full-text':
        if (message.text) {
          setSubtitleText(message.text);
        }
        break;
      case 'config-files':
        if (message.configs) {
          setConfigFiles(message.configs);
        }
        break;
      case 'config-switched':
        setAiState('idle');
        setSubtitleText(t('notification.characterLoaded'));

        toaster.create({
          title: t('notification.characterSwitched'),
          type: 'success',
          duration: 2000,
        });

        // setModelInfo(undefined);

        wsService.sendMessage({ type: 'fetch-history-list' });
        wsService.sendMessage({ type: 'create-new-history' });
        break;
      case 'background-files':
        if (message.files) {
          console.log('[WS Handler] Received background files', message.files);
          bgUrlContext?.setBackgroundFiles(message.files);
        } else {
          console.log('[WS Handler] Received background-files message with no files payload');
        }
        break;
      case 'audio':
        if (aiState === 'interrupted' || aiState === 'listening') {
          console.log('Audio playback intercepted. Sentence:', message.display_text?.text);
        } else {
          console.log("actions", message.actions);
          addAudioTask({
            audioBase64: message.audio || '',
            volumes: message.volumes || [],
            sliceLength: message.slice_length || 0,
            displayText: message.display_text || null,
            expressions: message.actions?.expressions || null,
            forwarded: message.forwarded || false,
          });
        }
        break;
      case 'history-data':
        if (message.messages) {
          setMessages(message.messages);
        }
        toaster.create({
          title: t('notification.historyLoaded'),
          type: 'success',
          duration: 2000,
        });
        break;
      case 'new-history-created':
        setAiState('idle');
        setSubtitleText(t('notification.newConversation'));
        // No need to open mic here
        if (message.history_uid) {
          setCurrentHistoryUid(message.history_uid);
          setMessages([]);
          const newHistory: HistoryInfo = {
            uid: message.history_uid,
            latest_message: null,
            timestamp: new Date().toISOString(),
          };
          setHistoryList((prev: HistoryInfo[]) => [newHistory, ...prev]);
          toaster.create({
            title: t('notification.newChatHistory'),
            type: 'success',
            duration: 2000,
          });
        }
        break;
      case 'history-deleted':
        toaster.create({
          title: message.success
            ? t('notification.historyDeleteSuccess')
            : t('notification.historyDeleteFail'),
          type: message.success ? 'success' : 'error',
          duration: 2000,
        });
        break;
      case 'history-list':
        if (message.histories) {
          setHistoryList(message.histories);
          if (message.histories.length > 0) {
            setCurrentHistoryUid(message.histories[0].uid);
          }
        }
        break;
      case 'user-input-transcription':
        console.log('user-input-transcription: ', message.text);
        if (message.text) {
          appendHumanMessage(message.text);
        }
        break;
      case 'error':
        toaster.create({
          title: message.message,
          type: 'error',
          duration: 2000,
        });
        break;
      case 'group-update':
        console.log('Received group-update:', message.members);
        if (message.members) {
          setGroupMembers(message.members);
        }
        if (message.is_owner !== undefined) {
          setIsOwner(message.is_owner);
        }
        break;
      case 'group-operation-result':
        toaster.create({
          title: message.message,
          type: message.success ? 'success' : 'error',
          duration: 2000,
        });
        break;
      case 'backend-synth-complete':
        setBackendSynthComplete(true);
        break;
      case 'conversation-chain-end':
        if (!audioTaskQueue.hasTask()) {
          setAiState((currentState: AiState) => {
            if (currentState === 'thinking-speaking') {
              return 'idle';
            }
            return currentState;
          });
        }
        break;
      case 'force-new-message':
        setForceNewMessage(true);
        break;
      case 'interrupt-signal':
        // Handle forwarded interrupt
        interrupt(false); // do not send interrupt signal to server
        break;
      case 'tool_call_status':
        if (message.tool_id && message.tool_name && message.status) {
          // If there's browser view data included, store it in the browser context
          if (message.browser_view) {
            console.log('Browser view data received:', message.browser_view);
            setBrowserViewData(message.browser_view);
          }

          appendOrUpdateToolCallMessage({
            id: message.tool_id,
            type: 'tool_call_status',
            role: 'ai',
            tool_id: message.tool_id,
            tool_name: message.tool_name,
            name: message.name,
            status: message.status as ('running' | 'completed' | 'error'),
            content: message.content || '',
            timestamp: message.timestamp || new Date().toISOString(),
          });
        } else {
          console.warn('Received incomplete tool_call_status message:', message);
        }
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }, [aiState, addAudioTask, appendHumanMessage, baseUrl, bgUrlContext, setAiState, setConfName, setConfUid, setConfigFiles, setCurrentHistoryUid, setHistoryList, setMessages, setModelInfo, setSubtitleText, startMic, stopMic, setSelfUid, setGroupMembers, setIsOwner, backendSynthComplete, setBackendSynthComplete, clearResponse, handleControlMessage, appendOrUpdateToolCallMessage, interrupt, setBrowserViewData, t]);

  useEffect(() => {
    const normalizedBase = normalizeHttpOrigin(baseUrl);
    if (normalizedBase !== baseUrl) {
      setBaseUrl(normalizedBase);
      return;
    }

    const authConfig = {
      enabled: basicAuthEnabled,
      username: basicAuthUsername,
      password: basicAuthPassword,
    };

    updateBackendConfig({
      baseUrl: normalizedBase,
      wsUrl,
      basicAuth: authConfig,
    });

    const targetUrl = deriveWsUrl(normalizedBase, wsUrl);
    wsService.connect(targetUrl, { basicAuth: authConfig });
  }, [
    baseUrl,
    setBaseUrl,
    wsUrl,
    basicAuthEnabled,
    basicAuthUsername,
    basicAuthPassword,
  ]);

  useEffect(() => {
    const stateSubscription = wsService.onStateChange(setWsState);
    const messageSubscription = wsService.onMessage(handleWebSocketMessage);
    return () => {
      stateSubscription.unsubscribe();
      messageSubscription.unsubscribe();
    };
  }, [wsUrl, handleWebSocketMessage]);

  const effectiveWsState: WebSocketConnectionState = hasAuthFailure ? 'UNAUTHORIZED' : wsState;

  const webSocketContextValue = useMemo(() => ({
    sendMessage: wsService.sendMessage.bind(wsService),
    wsState: effectiveWsState,
    reconnect: () => {
      const normalizedBase = normalizeHttpOrigin(baseUrl);
      if (normalizedBase !== baseUrl) {
        setBaseUrl(normalizedBase);
        return;
      }
      const authConfig = {
        enabled: basicAuthEnabled,
        username: basicAuthUsername,
        password: basicAuthPassword,
      };
      updateBackendConfig({
        baseUrl: normalizedBase,
        wsUrl,
        basicAuth: authConfig,
      });
      wsService.reconnect();
    },
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
  }), [
    effectiveWsState,
    wsUrl,
    baseUrl,
    basicAuthEnabled,
    basicAuthUsername,
    basicAuthPassword,
    setWsUrl,
    setBaseUrl,
    setBasicAuthEnabled,
    setBasicAuthUsername,
    setBasicAuthPassword,
  ]);

  return (
    <WebSocketContext.Provider value={webSocketContextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export default WebSocketHandler;
