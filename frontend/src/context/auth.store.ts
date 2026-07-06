import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { setSentryUser } from '../sentry';

export interface ImpersonationState {
  /** True while the SA is acting as the first ADMIN of another tenant. */
  active: boolean;
  /** SA's original access token, restored on stopImpersonation. */
  saOriginalAccessToken: string | null;
  saOriginalRefreshToken: string | null;
  saOriginalUser: User | null;
  /** Display fields surfaced in the banner. */
  impersonatedTenantSlug: string | null;
  impersonatedTenantName: string | null;
  impersonatedUserEmail: string | null;
  /**
   * Epoch ms at which the impersonation access token expires (T+15 min
   * from start). The banner reads it to drive a countdown and auto-stop
   * the session when it hits zero — without it the SA would only learn
   * the token expired via the next 401.
   */
  expiresAt: number | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  impersonation: ImpersonationState;

  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  /** Refresh user profile fields without touching tokens (used after PATCH /users/me). */
  updateUser: (user: User) => void;
  logout: () => void;

  /**
   * Start impersonating a target tenant (B7).
   * Saves the SA's tokens + user into `impersonation.saOriginal*`, swaps
   * the active token AND user object. The synthesized user carries the
   * impersonated role so the sidebar / layout react immediately —
   * `/auth/me` refresh on next page load reconciles any drift.
   */
  startImpersonation: (input: {
    targetAccessToken: string;
    targetUser: User;
    targetTenantSlug: string;
    targetTenantName: string;
    targetUserEmail: string;
  }) => void;

  /** Restore the SA's original tokens + user. */
  stopImpersonation: () => void;
}

const EMPTY_IMPERSONATION: ImpersonationState = {
  active: false,
  saOriginalAccessToken: null,
  saOriginalRefreshToken: null,
  saOriginalUser: null,
  impersonatedTenantSlug: null,
  impersonatedTenantName: null,
  impersonatedUserEmail: null,
  expiresAt: null,
};

/** Backend signs impersonation tokens with a 15-min TTL — mirror it here. */
const IMPERSONATION_TTL_MS = 15 * 60 * 1000;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      impersonation: EMPTY_IMPERSONATION,

      setAuth: (user, accessToken, refreshToken) => {
        // Also store in localStorage for the axios interceptor
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken, isAuthenticated: true });
        // Tag Sentry with the current user so any subsequent error is
        // attributed properly. No-op when Sentry is disabled.
        setSentryUser({
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: (user as unknown as { tenantId?: string }).tenantId,
        });
      },

      updateTokens: (accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ accessToken, refreshToken });
      },

      updateUser: (user) => {
        set({ user });
      },

      logout: () => {
        setSentryUser(null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          impersonation: EMPTY_IMPERSONATION,
        });
      },

      startImpersonation: ({
        targetAccessToken,
        targetUser,
        targetTenantSlug,
        targetTenantName,
        targetUserEmail,
      }) => {
        const state = get();
        // Refuse to nest impersonation — if already active, the SA must
        // stop first.
        if (state.impersonation.active) return;

        localStorage.setItem('accessToken', targetAccessToken);
        // CRITICAL: the impersonate endpoint issues NO refresh token. We must
        // NOT leave the SA's refresh token in the active slot — otherwise, when
        // the 15-min impersonation access token expires, the axios interceptor
        // would refresh using the SA token, ROTATE it (revoking the old one),
        // and orphan `saOriginalRefreshToken`. On exit we'd then restore a
        // revoked token → replay detection kills the family → full logout.
        // So we stash the SA refresh ONLY in saOriginalRefreshToken and clear
        // the active slot; the interceptor falls back to the SA session on 401.
        localStorage.removeItem('refreshToken');
        set({
          accessToken: targetAccessToken,
          refreshToken: null,
          user: targetUser,
          isAuthenticated: true,
          impersonation: {
            active: true,
            saOriginalAccessToken: state.accessToken,
            saOriginalRefreshToken: state.refreshToken,
            saOriginalUser: state.user,
            impersonatedTenantSlug: targetTenantSlug,
            impersonatedTenantName: targetTenantName,
            impersonatedUserEmail: targetUserEmail,
            expiresAt: Date.now() + IMPERSONATION_TTL_MS,
          },
        });
      },

      stopImpersonation: () => {
        const { impersonation } = get();
        if (!impersonation.active || !impersonation.saOriginalAccessToken) {
          // Nothing to restore — let the user log in again.
          return;
        }
        localStorage.setItem('accessToken', impersonation.saOriginalAccessToken);
        if (impersonation.saOriginalRefreshToken) {
          localStorage.setItem(
            'refreshToken',
            impersonation.saOriginalRefreshToken,
          );
        }
        set({
          accessToken: impersonation.saOriginalAccessToken,
          refreshToken: impersonation.saOriginalRefreshToken,
          user: impersonation.saOriginalUser,
          isAuthenticated: true,
          impersonation: EMPTY_IMPERSONATION,
        });
      },
    }),
    {
      name: 'taskmgr-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        impersonation: state.impersonation,
      }),
    },
  ),
);
