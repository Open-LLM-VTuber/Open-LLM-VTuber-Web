/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-use-before-define */
import { Subject } from 'rxjs';
import { ModelInfo } from '@/context/live2d-config-context';
import { HistoryInfo } from '@/context/websocket-context';
import { ConfigFile } from '@/context/character-config-context';
import { toaster } from '@/components/ui/toaster';
import {
  BasicAuthConfig,
  deriveWsUrl,
  getBackendConfig,
} from '@/services/backend-settings';
import { getTranslator } from '@/utils/i18n-helper';
import { notifyAuthFailure, notifyAuthRecovered } from '@/services/auth-notifier';

export interface DisplayText {
  text: string;
  name: string;
  avatar: string;
}

interface BackgroundFile {
  name: string;
  url: string;
}

interface WebSocketConnectOptions {
  baseUrl?: string;
  wsUrl?: string;
  protocols?: string[];
  basicAuth?: BasicAuthConfig;
  force?: boolean;
}

export interface AudioPayload {
  type: 'audio';
  audio?: string;
  volumes?: number[];
  slice_length?: number;
  display_text?: DisplayText;
  actions?: Actions;
}

export interface Message {
  id: string;
  content: string;
  role: "ai" | "human";
  timestamp: string;
  name?: string;
  avatar?: string;

  // Fields for different message types (make optional)
  type?: 'text' | 'tool_call_status'; // Add possible types, default to 'text' if omitted
  tool_id?: string; // Specific to tool calls
  tool_name?: string; // Specific to tool calls
  status?: 'running' | 'completed' | 'error'; // Specific to tool calls
}

export interface Actions {
  expressions?: string[] | number [];
  pictures?: string[];
  sounds?: string[];
}

export interface MessageEvent {
  tool_id: any;
  tool_name: any;
  name: any;
  status: any;
  content: string;
  timestamp: string;
  type: string;
  audio?: string;
  volumes?: number[];
  slice_length?: number;
  files?: BackgroundFile[];
  actions?: Actions;
  text?: string;
  model_info?: ModelInfo;
  conf_name?: string;
  conf_uid?: string;
  uids?: string[];
  messages?: Message[];
  history_uid?: string;
  success?: boolean;
  histories?: HistoryInfo[];
  configs?: ConfigFile[];
  message?: string;
  members?: string[];
  is_owner?: boolean;
  client_uid?: string;
  forwarded?: boolean;
  display_text?: DisplayText;
  live2d_model?: string;
  browser_view?: {
    debuggerFullscreenUrl: string;
    debuggerUrl: string;
    pages: {
      id: string;
      url: string;
      faviconUrl: string;
      title: string;
      debuggerUrl: string;
      debuggerFullscreenUrl: string;
    }[];
    wsUrl: string;
    sessionId?: string;
  };
}

export type WebSocketConnectionState = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED' | 'UNAUTHORIZED';

const UNAUTHORIZED_CLOSE_CODES = new Set([4001, 4003, 4010, 4401, 4403]);

class WebSocketService {
  private static instance: WebSocketService;

  private ws: WebSocket | null = null;

  private messageSubject = new Subject<MessageEvent>();

  private stateSubject = new Subject<WebSocketConnectionState>();

  private currentState: WebSocketConnectionState = 'CLOSED';

  private lastConnectionDetails: { url: string; basicAuthEnabled: boolean; authFingerprint: string } | null = null;

  private isConnecting = false;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private reconnectAttempts = 0;

  private shouldReconnect = true;

  private pendingManualConnect: (() => void) | null = null;

  private lastResolvedUrl: string | null = null;

  private lastAuthConfig: BasicAuthConfig | null = null;

  private authFailureNotified = false;

  static getInstance() {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private initializeConnection() {
    this.sendMessage({
      type: 'fetch-backgrounds',
    });
    this.sendMessage({
      type: 'fetch-configs',
    });
    this.sendMessage({
      type: 'fetch-history-list',
    });
    this.sendMessage({
      type: 'create-new-history',
    });
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (!this.shouldReconnect || this.reconnectTimer !== null || !this.lastResolvedUrl) {
      return;
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    this.reconnectAttempts += 1;

    const nextAuth = this.lastAuthConfig ? { ...this.lastAuthConfig } : undefined;
    const nextUrl = this.lastResolvedUrl;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      const options: WebSocketConnectOptions = {};
      if (nextAuth) {
        options.basicAuth = nextAuth;
      }
      this.connect(nextUrl, options);
    }, delay);
  }

  private clearSocketHandlers(socket: WebSocket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
  }

  private closeSocket(code = 1000, reason = 'Client closing connection') {
    if (!this.ws) {
      return;
    }

    if (this.ws.readyState === WebSocket.CLOSED) {
      return;
    }

    try {
      this.currentState = 'CLOSING';
      this.stateSubject.next('CLOSING');
      this.ws.close(code, reason);
    } catch (error) {
      console.error('Failed to close WebSocket:', error);
    }
  }

  private handleOpen = (event: Event) => {
    const socket = event.target as WebSocket | null;
    if (socket && socket !== this.ws) {
      return;
    }

    if (!this.ws) {
      return;
    }

    this.isConnecting = false;
    this.currentState = 'OPEN';
    this.stateSubject.next('OPEN');
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.shouldReconnect = true;
    this.authFailureNotified = false;
    notifyAuthRecovered();
    this.initializeConnection();
  };

  private handleMessage = (event: globalThis.MessageEvent) => {
    if (!this.ws || event.target !== this.ws) {
      return;
    }

    try {
      const message = JSON.parse(event.data);
      this.messageSubject.next(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      const translate = getTranslator();
      toaster.create({
        title: `${translate('error.failedParseWebSocket')}: ${error}`,
        type: "error",
        duration: 2000,
      });
    }
  };

  private handleClose = (event: CloseEvent) => {
    const socket = event.target as WebSocket | null;
    if (socket && socket !== this.ws) {
      return;
    }

    if (this.ws) {
      this.clearSocketHandlers(this.ws);
    }
    this.ws = null;
    this.isConnecting = false;
    this.currentState = 'CLOSED';
    this.stateSubject.next('CLOSED');
    this.maybeNotifyAuthFailure({ code: event.code, reason: event.reason });
    this.clearReconnectTimer();

    const manualReconnect = this.pendingManualConnect;
    this.pendingManualConnect = null;

    if (manualReconnect) {
      manualReconnect();
      return;
    }

    if (!this.shouldReconnect) {
      this.shouldReconnect = true;
      return;
    }

    this.scheduleReconnect();
  };

  private handleError = (event: Event) => {
    const socket = event.target as WebSocket | null;
    if (socket && socket !== this.ws) {
      return;
    }

    if (!this.ws) {
      return;
    }
    this.isConnecting = false;
    this.currentState = 'CLOSED';
    this.stateSubject.next('CLOSED');
    this.maybeNotifyAuthFailure();
  };

  connect(url?: string, options: WebSocketConnectOptions = {}) {
    const backendConfig = getBackendConfig();
    const resolvedUrl = url
      ?? deriveWsUrl(options.baseUrl ?? backendConfig.baseUrl, options.wsUrl ?? backendConfig.wsUrl);
    const basicAuthConfig: BasicAuthConfig = options.basicAuth ?? backendConfig.basicAuth;
    const authFingerprint = basicAuthConfig?.enabled
      ? `${basicAuthConfig.username}:${basicAuthConfig.password}`
      : '';
    const shouldForceDueToChange = Boolean(
      this.ws
      && this.lastConnectionDetails
      && (this.lastConnectionDetails.url !== resolvedUrl
        || this.lastConnectionDetails.authFingerprint !== authFingerprint),
    );
    const requestedForce = Boolean(options.force);
    const shouldForce = requestedForce || shouldForceDueToChange;

    this.lastResolvedUrl = resolvedUrl;
    this.lastAuthConfig = basicAuthConfig ? { ...basicAuthConfig } : null;

    if (!shouldForce) {
      if (this.isConnecting) {
        return;
      }
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
    }

    const openSocket = () => {
      this.pendingManualConnect = null;
      this.clearReconnectTimer();
      this.shouldReconnect = true;
      this.isConnecting = true;
      this.currentState = 'CONNECTING';
      this.stateSubject.next('CONNECTING');
      this.authFailureNotified = false;

      const protocols = options.protocols ?? [];
      try {
        this.ws = protocols.length > 0 ? new WebSocket(resolvedUrl, protocols) : new WebSocket(resolvedUrl);
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
        this.isConnecting = false;
        this.currentState = 'CLOSED';
        this.stateSubject.next('CLOSED');
        this.maybeNotifyAuthFailure();
        return;
      }

      this.lastConnectionDetails = {
        url: resolvedUrl,
        basicAuthEnabled: Boolean(basicAuthConfig?.enabled),
        authFingerprint,
      };

      if (this.ws) {
        this.ws.onopen = this.handleOpen;
        this.ws.onmessage = this.handleMessage;
        this.ws.onclose = this.handleClose;
        this.ws.onerror = this.handleError;
      }
    };

    if (shouldForce && this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.pendingManualConnect = openSocket;
      this.shouldReconnect = false;
      this.clearReconnectTimer();
      this.closeSocket(1000, 'Client reconnecting');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.CLOSING) {
      this.pendingManualConnect = openSocket;
      this.shouldReconnect = false;
      this.clearReconnectTimer();
      return;
    }

    openSocket();
  }

  reconnect() {
    const options: WebSocketConnectOptions = { force: true };
    if (this.lastAuthConfig) {
      options.basicAuth = { ...this.lastAuthConfig };
    }
    this.connect(this.lastResolvedUrl ?? undefined, options);
  }

  private maybeNotifyAuthFailure(details?: { code?: number; reason?: string }) {
    if (this.authFailureNotified) {
      return;
    }

    const reason = (details?.reason ?? '').toLowerCase();
    const code = details?.code;
    const isUnauthorized = (code && UNAUTHORIZED_CLOSE_CODES.has(code))
      || reason.includes('unauthorized')
      || reason.includes('401')
      || reason.includes('403');

    if (!isUnauthorized) {
      return;
    }

    this.authFailureNotified = true;
    if (this.currentState !== 'UNAUTHORIZED') {
      this.currentState = 'UNAUTHORIZED';
      this.stateSubject.next('UNAUTHORIZED');
    }
    notifyAuthFailure();
  }

  sendMessage(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not open. Unable to send message:', message);
      const translate = getTranslator();
      toaster.create({
        title: translate('error.websocketNotOpen'),
        type: 'error',
        duration: 2000,
      });
    }
  }

  onMessage(callback: (message: MessageEvent) => void) {
    return this.messageSubject.subscribe(callback);
  }

  onStateChange(callback: (state: WebSocketConnectionState) => void) {
    return this.stateSubject.subscribe(callback);
  }

  disconnect(code = 1000, reason = 'Client disconnect') {
    this.shouldReconnect = false;
    this.pendingManualConnect = null;
    this.clearReconnectTimer();
    this.isConnecting = false;

    if (!this.ws) {
      this.currentState = 'CLOSED';
      this.stateSubject.next('CLOSED');
      return;
    }

    this.closeSocket(code, reason);
  }

  getCurrentState() {
    return this.currentState;
  }
}

export const wsService = WebSocketService.getInstance();
