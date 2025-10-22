import { toaster } from '@/components/ui/toaster';
import { OPEN_SETTINGS_EVENT, AUTH_STATUS_EVENT } from '@/constants/events';
import { getBackendConfig } from '@/services/backend-settings';
import { getTranslator } from '@/utils/i18n-helper';

let lastNotificationTimestamp = 0;
const NOTIFICATION_COOLDOWN_MS = 3000;
const AUTH_ERROR_STATUSES = new Set([401, 403]);

type RequestLike = RequestInfo | URL;

const isAuthErrorStatus = (status: number | undefined) => (
  typeof status === 'number' && AUTH_ERROR_STATUSES.has(status)
);

const tryResolveUrl = (input: RequestLike): string | null => {
  if (input instanceof Request) {
    return input.url;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof input === 'string') {
    return input;
  }
  return null;
};

const getHostSafely = (rawUrl: string, baseFallback?: string): string | null => {
  try {
    return new URL(rawUrl).host;
  } catch {
    if (baseFallback) {
      try {
        return new URL(rawUrl, baseFallback).host;
      } catch {
        return null;
      }
    }
    return null;
  }
};

const shouldMonitorRequest = (input: RequestLike): boolean => {
  const config = getBackendConfig();
  if (!config.basicAuth.enabled) {
    return false;
  }
  const rawUrl = tryResolveUrl(input);
  if (!rawUrl) {
    return false;
  }
  const backendHost = getHostSafely(config.baseUrl);
  if (!backendHost) {
    return false;
  }
  const requestHost = getHostSafely(rawUrl, config.baseUrl);
  return requestHost === backendHost;
};

let fetchInterceptorInstalled = false;
let authFailureActive = false;

export type AuthStatus = 'authorized' | 'unauthorized';

export const emitAuthStatus = (status: AuthStatus) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(AUTH_STATUS_EVENT, {
    detail: { status },
  }));
};

export const notifyAuthFailure = () => {
  authFailureActive = true;
  emitAuthStatus('unauthorized');

  const now = Date.now();
  if (now - lastNotificationTimestamp < NOTIFICATION_COOLDOWN_MS) {
    return;
  }

  lastNotificationTimestamp = now;
  const translate = getTranslator();

  toaster.create({
    title: translate('error.authFailed'),
    description: translate('error.authFailedDescription'),
    type: 'error',
    duration: 5000,
    action: {
      label: translate('error.openSettings'),
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
        }
      },
    },
  });
};

export const notifyAuthRecovered = () => {
  if (!authFailureActive) {
    return;
  }
  authFailureActive = false;
  emitAuthStatus('authorized');
};

export const ensureAuthFetchInterceptor = () => {
  if (fetchInterceptorInstalled || typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  const patchedFetch: typeof window.fetch = async (input, init) => {
    const monitor = shouldMonitorRequest(input);
    try {
      const response = await originalFetch(input, init);
      if (monitor) {
        if (isAuthErrorStatus(response.status)) {
          notifyAuthFailure();
        } else if (response.ok) {
          notifyAuthRecovered();
        }
      }
      return response;
    } catch (error) {
      if (monitor) {
        notifyAuthFailure();
      }
      throw error;
    }
  };

  window.fetch = patchedFetch;
  fetchInterceptorInstalled = true;
};

if (typeof window !== 'undefined') {
  ensureAuthFetchInterceptor();
}
