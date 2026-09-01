import { APP_API_BASE } from './config';
import { loadSession, saveSession } from '../auth/tokenStore';
import type { LoginSuccess } from './types';

export class ApiError extends Error {
  /** The envelope's `body`, when the server sent one alongside success:false
   * (e.g. LOGIN's "wrong OTP, here's a fresh SESSION to retry" response). */
  body: unknown;

  constructor(message: string, body?: unknown) {
    super(message || 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.body = body;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type Envelope<T> = {
  statusCode?: number;
  success: boolean;
  msg: string;
  body: T;
};

// Single-flight silent refresh: an already-expired IdToken 401s at API
// Gateway's Cognito authorizer *before* ever reaching a Lambda ("The incoming
// token has expired") - AuthContext's own proactive refresh (timer +
// foreground check) closes most of this gap but not all of it (e.g. the
// token dies while backgrounded, then several screens' queries all fire the
// instant the app comes back). Rather than surface that raw message, refresh
// once and retry. Shared across concurrent 401s so a burst of requests
// doesn't each kick off their own refresh call.
let refreshPromise: Promise<string | null> | null = null;

function refreshIdToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const session = await loadSession();
      if (!session?.RefreshToken) return null;
      try {
        const fresh = await request<LoginSuccess>(
          'POST',
          '/USERS/LOGIN',
          { body: { REFRESH_TOKEN: session.RefreshToken }, auth: false }
        );
        await saveSession(fresh);
        return fresh.IdToken;
      } catch {
        // Refresh token itself is dead - nothing to recover here; the
        // caller's retry will fail again with the real error, and
        // AuthContext's own refresh cycle will sign the user out within its
        // next check.
        return null;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function request<T>(
  method: Method,
  path: string,
  opts: { query?: Record<string, string | number | undefined>; body?: unknown; auth?: boolean; isRetry?: boolean } = {}
): Promise<T> {
  const { query, body, auth = true, isRetry = false } = opts;

  let url = `${APP_API_BASE}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const session = await loadSession();
    // The APP API's Cognito authorizer (USER_AUTH) is configured with a
    // non-standard identity source - it reads the token from a header
    // literally named "token", not "Authorization". Sending Authorization
    // gets silently 401'd by API Gateway before the request ever reaches
    // the Lambda (confirmed directly against the live API).
    if (session?.IdToken) headers.token = session.IdToken;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError(`Unexpected response from server (${res.status}).`);
  }

  // API Gateway itself can reject a request (401 from the Cognito authorizer,
  // etc.) before it ever reaches a Lambda - that comes back as {message: "..."},
  // not the {statusCode,success,msg,body} envelope Lambdas return.
  if (!res.ok) {
    if (res.status === 401 && auth && !isRetry) {
      const newToken = await refreshIdToken();
      if (newToken) {
        return request<T>(method, path, { ...opts, isRetry: true });
      }
    }
    const message = (payload as { message?: string })?.message;
    throw new ApiError(message ? `${message} (${res.status})` : `Request failed (${res.status}).`);
  }

  // Some endpoints (Lambda-proxy style) nest the real payload as a JSON string in `body`.
  const envelope = payload as Envelope<T>;
  if (typeof envelope.body === 'string') {
    try {
      envelope.body = JSON.parse(envelope.body);
    } catch {
      // leave as-is; not every string body is JSON
    }
  }

  if (!envelope.success) {
    throw new ApiError(envelope.msg || 'Request failed.', envelope.body);
  }

  return envelope.body;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | undefined>, auth = true) =>
    request<T>('GET', path, { query, auth }),
  post: <T>(path: string, body?: unknown, auth = true) => request<T>('POST', path, { body, auth }),
  put: <T>(path: string, body?: unknown, auth = true) => request<T>('PUT', path, { body, auth }),
  patch: <T>(path: string, body?: unknown, auth = true) => request<T>('PATCH', path, { body, auth }),
  delete: <T>(path: string, body?: unknown, auth = true) => request<T>('DELETE', path, { body, auth }),
};
