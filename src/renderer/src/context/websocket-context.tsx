/* eslint-disable react/jsx-no-constructed-context-values */
import React, { useContext, useCallback, useEffect } from 'react';
import { wsService, type WebSocketConnectionState } from '@/services/websocket-service';
import { useLocalStorage } from '@/hooks/utils/use-local-storage';
import {
  DEFAULT_BACKEND_WS_URL,
  DEFAULT_BACKEND_BASE_URL,
  DEFAULT_BASIC_AUTH_USERNAME,
  DEFAULT_BASIC_AUTH_PASSWORD,
} from '@/constants/backend';
import { deriveWsUrl, normalizeHttpOrigin, updateBackendConfig } from '@/services/backend-settings';

const DEFAULT_WS_URL = DEFAULT_BACKEND_WS_URL;
const DEFAULT_BASE_URL = DEFAULT_BACKEND_BASE_URL;
const DEFAULT_BASIC_AUTH = {
  enabled: false,
  username: DEFAULT_BASIC_AUTH_USERNAME,
  password: DEFAULT_BASIC_AUTH_PASSWORD,
};

export interface HistoryInfo {
  uid: string;
  latest_message: {
    role: 'human' | 'ai';
    timestamp: string;
    content: string;
  } | null;
  timestamp: string | null;
}

interface WebSocketContextProps {
  sendMessage: (message: object) => void;
  wsState: WebSocketConnectionState;
  reconnect: () => void;
  wsUrl: string;
  setWsUrl: (url: string) => void;
  baseUrl: string;
  setBaseUrl: (url: string) => void;
  basicAuthEnabled: boolean;
  setBasicAuthEnabled: (enabled: boolean) => void;
  basicAuthUsername: string;
  setBasicAuthUsername: (username: string) => void;
  basicAuthPassword: string;
  setBasicAuthPassword: (password: string) => void;
}

export const WebSocketContext = React.createContext<WebSocketContextProps>({
  sendMessage: wsService.sendMessage.bind(wsService),
  wsState: 'CLOSED',
  reconnect: () => wsService.reconnect(),
  wsUrl: DEFAULT_WS_URL,
  setWsUrl: () => {},
  baseUrl: DEFAULT_BASE_URL,
  setBaseUrl: () => {},
  basicAuthEnabled: DEFAULT_BASIC_AUTH.enabled,
  setBasicAuthEnabled: () => {},
  basicAuthUsername: DEFAULT_BASIC_AUTH.username,
  setBasicAuthUsername: () => {},
  basicAuthPassword: DEFAULT_BASIC_AUTH.password,
  setBasicAuthPassword: () => {},
});

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export const defaultWsUrl = DEFAULT_WS_URL;
export const defaultBaseUrl = DEFAULT_BASE_URL;

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [wsUrl, setWsUrl] = useLocalStorage('wsUrl', DEFAULT_WS_URL);
  const [baseUrl, setBaseUrl] = useLocalStorage('baseUrl', DEFAULT_BASE_URL);
  const [basicAuthEnabled, setBasicAuthEnabled] = useLocalStorage('basicAuthEnabled', DEFAULT_BASIC_AUTH.enabled);
  const [basicAuthUsername, setBasicAuthUsername] = useLocalStorage('basicAuthUsername', DEFAULT_BASIC_AUTH.username);
  const [basicAuthPassword, setBasicAuthPassword] = useLocalStorage('basicAuthPassword', DEFAULT_BASIC_AUTH.password);
  const handleSetWsUrl = useCallback((url: string) => {
    setWsUrl(url);
  }, [setWsUrl]);

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

  const value = {
    sendMessage: wsService.sendMessage.bind(wsService),
    wsState: 'CLOSED',
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
    setWsUrl: handleSetWsUrl,
    baseUrl,
    setBaseUrl,
    basicAuthEnabled,
    setBasicAuthEnabled,
    basicAuthUsername,
    setBasicAuthUsername,
    basicAuthPassword,
    setBasicAuthPassword,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}
