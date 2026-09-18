import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { AuthUser } from '@taskmgr/shared';

/**
 * Session state (B38.3). Tokens live in the OS keychain / keystore through
 * expo-secure-store (AFTER_FIRST_UNLOCK so a future background task can read
 * them once the phone was unlocked at least once). The installation id is
 * generated once and sent as X-Device-Id on every request (ADR-014 §4).
 */

const KEYS = {
  baseUrl: 'd2g.baseUrl',
  accessToken: 'd2g.accessToken',
  refreshToken: 'd2g.refreshToken',
  user: 'd2g.user',
  deviceId: 'd2g.deviceId',
} as const;

const secureOpts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export interface WorkspaceInfo {
  baseUrl: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
}

interface SessionState {
  hydrated: boolean;
  deviceId: string;
  workspace: WorkspaceInfo | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  hydrate: () => Promise<void>;
  setWorkspace: (w: WorkspaceInfo | null) => Promise<void>;
  setSession: (s: { accessToken: string; refreshToken: string; user: AuthUser }) => Promise<void>;
  setTokens: (s: { accessToken: string; refreshToken: string }) => Promise<void>;
  clearSession: () => Promise<void>;
}

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, secureOpts);
  } catch {
    return null;
  }
}
async function write(key: string, value: string | null): Promise<void> {
  if (value === null) await SecureStore.deleteItemAsync(key, secureOpts);
  else await SecureStore.setItemAsync(key, value, secureOpts);
}

export const useSession = create<SessionState>((set, get) => ({
  hydrated: false,
  deviceId: '',
  workspace: null,
  accessToken: null,
  refreshToken: null,
  user: null,

  async hydrate() {
    const [baseUrl, accessToken, refreshToken, userJson, storedDeviceId] = await Promise.all([
      read(KEYS.baseUrl), read(KEYS.accessToken), read(KEYS.refreshToken), read(KEYS.user), read(KEYS.deviceId),
    ]);
    let deviceId = storedDeviceId;
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await write(KEYS.deviceId, deviceId);
    }
    let workspace: WorkspaceInfo | null = null;
    if (baseUrl) {
      try {
        workspace = JSON.parse(baseUrl) as WorkspaceInfo;
      } catch {
        workspace = { baseUrl, name: '', slug: null, logoUrl: null };
      }
    }
    set({
      hydrated: true,
      deviceId,
      workspace,
      accessToken,
      refreshToken,
      user: userJson ? (JSON.parse(userJson) as AuthUser) : null,
    });
  },

  async setWorkspace(workspace) {
    await write(KEYS.baseUrl, workspace ? JSON.stringify(workspace) : null);
    set({ workspace });
  },

  async setSession({ accessToken, refreshToken, user }) {
    // Persist the refresh token BEFORE exposing it: a crash between the two
    // would otherwise lose a token the server already rotated (family replay).
    await write(KEYS.refreshToken, refreshToken);
    await write(KEYS.accessToken, accessToken);
    await write(KEYS.user, JSON.stringify(user));
    set({ accessToken, refreshToken, user });
  },

  async setTokens({ accessToken, refreshToken }) {
    await write(KEYS.refreshToken, refreshToken);
    await write(KEYS.accessToken, accessToken);
    set({ accessToken, refreshToken });
  },

  async clearSession() {
    await Promise.all([write(KEYS.accessToken, null), write(KEYS.refreshToken, null), write(KEYS.user, null)]);
    set({ accessToken: null, refreshToken: null, user: null });
    void get;
  },
}));
