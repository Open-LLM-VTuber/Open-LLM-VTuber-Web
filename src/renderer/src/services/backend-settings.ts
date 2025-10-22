import { BasicAuthConfig, buildAuthorizationHeader, getBackendConfig } from '@/services/backend-settings';
import { notifyAuthFailure, notifyAuthRecovered } from '@/services/auth-notifier';

interface AuthorizedFetchOptions extends RequestInit {
  useAuth?: boolean;
  baseUrlOverride?: string;
  authOverride?: BasicAuthConfig;
}

const resolveUrl = (input: string, baseUrl: string): string => {
  try {
    return new URL(input).toString();
  } catch {
    return new URL(input, baseUrl).toString();
  }
};

const buildHeaders = (originalHeaders: HeadersInit | undefined) => new Headers(originalHeaders ?? {});

const isAuthErrorStatus = (status: number) => status === 401 || status === 403;

export const authorizedFetch = async (
  input: string,
  options: AuthorizedFetchOptions = {},
): Promise<Response> => {
  const {
    useAuth = true,
    baseUrlOverride,
    authOverride,
    headers,
    ...restOptions
  } = options;

  const config = getBackendConfig();
  const targetUrl = resolveUrl(input, baseUrlOverride ?? config.baseUrl);
  const initialHeaders = buildHeaders(headers);

  if (useAuth) {
    const authHeader = buildAuthorizationHeader(authOverride ?? config.basicAuth);
    if (authHeader) {
      initialHeaders.set('Authorization', authHeader);
    }
  }

  const response = await fetch(targetUrl, {
    ...restOptions,
    headers: initialHeaders,
  });

  if (isAuthErrorStatus(response.status)) {
    notifyAuthFailure();
  } else if (response.ok && useAuth) {
    notifyAuthRecovered();
  }

  return response;
};
