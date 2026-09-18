import { useSession } from '../stores/session.store';
import { DEVICE_ID_HEADER } from '@taskmgr/shared';
import i18n from '../i18n';

/**
 * HTTP client (B38.3) — fetch wrapper over the workspace base URL.
 *
 * - Bearer access token, `X-Device-Id`, `Accept-Language` on every call.
 * - Unwraps the backend envelope `{ success, data, timestamp }`.
 * - Single-flight refresh: concurrent 401s wait for ONE `/auth/refresh`
 *   (the server rotates refresh tokens with family replay detection, so two
 *   parallel refreshes would log the user out everywhere — ADR-014 findings).
 * - Never calls refresh from a background task (callers pass `allowRefresh: false`).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

let refreshPromise: Promise<boolean> | null = null;

function apiBase(): string {
  const ws = useSession.getState().workspace;
  if (!ws) throw new ApiError(0, 'Aucun espace de travail configuré');
  return `${ws.baseUrl.replace(/\/+$/, '')}/api`;
}

async function refreshTokens(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refreshToken, setTokens, clearSession } = useSession.getState();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${apiBase()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await clearSession();
        return false;
      }
      const json = (await res.json()) as { data?: { accessToken: string; refreshToken: string } };
      const pair = json.data;
      if (!pair?.accessToken || !pair.refreshToken) {
        await clearSession();
        return false;
      }
      await setTokens(pair);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  /** Default true. Background tasks must pass false. */
  allowRefresh?: boolean;
  /** Skip the bearer token (login, branding). */
  anonymous?: boolean;
  timeoutMs?: number;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, headers = {}, allowRefresh = true, anonymous = false, timeoutMs = 15_000 } = opts;
  const url = new URL(`${apiBase()}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const doFetch = async (): Promise<Response> => {
    const { accessToken, deviceId } = useSession.getState();
    const h: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': i18n.language?.startsWith('en') ? 'en' : 'fr',
      [DEVICE_ID_HEADER]: deviceId,
      ...headers,
    };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (!anonymous && accessToken) h.Authorization = `Bearer ${accessToken}`;
    return fetch(url.toString(), {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  let res = await doFetch();
  if (res.status === 401 && !anonymous && allowRefresh) {
    const ok = await refreshTokens();
    if (ok) res = await doFetch();
  }

  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    const message = extractMessage(json) ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, message, json);
  }
  const envelope = json as { data?: T } | T | null;
  if (envelope && typeof envelope === 'object' && 'data' in (envelope as object) && 'success' in (envelope as object)) {
    return (envelope as { data: T }).data;
  }
  return envelope as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const m = (json as { message?: unknown }).message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) return m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ');
  return null;
}
