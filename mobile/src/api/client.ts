import { currentFixForHeader } from '../gps/gps.store';
import { useSession } from '../stores/session.store';
import { CLIENT_LOCATION_HEADER, DEVICE_ID_HEADER, IDEMPOTENCY_KEY_HEADER, formatClientLocation, type ClientLocation } from '@taskmgr/shared';
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

export function apiBase(): string {
  const ws = useSession.getState().workspace;
  if (!ws) throw new ApiError(0, 'Aucun espace de travail configuré');
  return `${ws.baseUrl.replace(/\/+$/, '')}/api`;
}

export async function refreshTokens(): Promise<boolean> {
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
  /** Replay-safe mutation (ADR-016 §3): UUID generated once per operation, reused on retry. */
  idempotencyKey?: string;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, headers = {}, allowRefresh = true, anonymous = false, timeoutMs = 15_000, idempotencyKey } = opts;
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
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) h['Content-Type'] = 'application/json';
    if (!anonymous && accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (idempotencyKey) h[IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
    // B57 — every request carries the phone position (queued ops keep their own capture).
    const fix = outgoingLocation ?? (anonymous ? null : await currentFixForHeader());
    if (fix) h[CLIENT_LOCATION_HEADER] = formatClientLocation(fix);
    return fetch(url.toString(), {
      method,
      headers: h,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
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

/**
 * B45 — position attached to the next requests (X-Client-Location). The drain
 * sets it per queued op (sequential), so the server records where the action
 * was performed, not where the phone is when the queue finally uploads.
 */
let outgoingLocation: ClientLocation | null = null;
export async function withOutgoingLocation<T>(loc: ClientLocation | null, fn: () => Promise<T>): Promise<T> {
  outgoingLocation = loc;
  try {
    return await fn();
  } finally {
    outgoingLocation = null;
  }
}

/** Headers every authenticated call carries (also used by the native file upload). */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const { accessToken, deviceId } = useSession.getState();
  return {
    Accept: 'application/json',
    'Accept-Language': i18n.language?.startsWith('en') ? 'en' : 'fr',
    [DEVICE_ID_HEADER]: deviceId,
    ...(outgoingLocation ? { [CLIENT_LOCATION_HEADER]: formatClientLocation(outgoingLocation) } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...extra,
  };
}

/** Turns a raw response body into an ApiError-friendly message. */
export function errorMessageFrom(body: string, status: number): { message: string; json: unknown } {
  const json = body ? safeJson(body) : null;
  return { message: extractMessage(json) ?? `HTTP ${status}`, json };
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
