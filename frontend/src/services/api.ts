import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../context/auth.store';
import i18n from '../i18n';

// ── Instance ──────────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── B63 — public IP of this browser, looked up once per hour, sent in a header ──
// The server only uses it when it sees a private (LAN) address for this client.
const PUBLIC_IP_KEY = 'publicIp';
const PUBLIC_IP_TTL_MS = 60 * 60 * 1000;
let publicIpLookup: Promise<void> | null = null;
function cachedPublicIp(): string | null {
  try {
    const raw = sessionStorage.getItem(PUBLIC_IP_KEY);
    if (!raw) return null;
    const { ip, at } = JSON.parse(raw) as { ip: string; at: number };
    return Date.now() - at < PUBLIC_IP_TTL_MS ? ip : null;
  } catch {
    return null;
  }
}
function ensurePublicIp(): void {
  if (cachedPublicIp() || publicIpLookup) return;
  publicIpLookup = fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) })
    .then((r) => r.json())
    .then((j: { ip?: string }) => {
      if (j.ip) sessionStorage.setItem(PUBLIC_IP_KEY, JSON.stringify({ ip: j.ip, at: Date.now() }));
    })
    .catch(() => undefined)
    .finally(() => { publicIpLookup = null; });
}

// ── Request interceptor — attach access token ─────────────────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    ensurePublicIp();
    const publicIp = cachedPublicIp();
    if (publicIp && config.headers) config.headers['X-Client-Public-Ip'] = publicIp;
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    // Tell backend which locale to use for validation/exception messages.
    if (config.headers) {
      config.headers['Accept-Language'] = i18n.language || 'fr';
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor — handle 401 / token refresh ─────────────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

function processQueue(error: AxiosError | null, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // Impersonation fallback: the impersonation access token has no refresh
      // token, so a 401 here means it simply expired. Instead of logging the
      // operator out, restore the SA session and drop them on the tenants list
      // so they can re-enter (this one, or another) in one click.
      const authState = useAuthStore.getState();
      if (authState.impersonation.active) {
        authState.stopImpersonation();
        window.location.href = '/super-admin/tenants';
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
          }
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = data.data;

        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        processQueue(null, accessToken);
        if (originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// FIX 10 — delegate to Zustand store so React state is also cleared on auth failure
function clearAuth() {
  useAuthStore.getState().logout();
}

export default api;
export { clearAuth };
