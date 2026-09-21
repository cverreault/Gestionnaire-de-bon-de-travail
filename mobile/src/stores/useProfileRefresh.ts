import { useEffect } from 'react';
import { AppState } from 'react-native';
import { fetchMe } from '../api/endpoints';
import { useSession } from './session.store';
import { useSyncStore } from '../sync/sync.store';

/**
 * B46 — re-reads the profile (/auth/me) at start and on each foreground so an
 * admin change (location requirement, preferences) reaches the phone without
 * re-login. Silent on failure (offline, expired session handled elsewhere).
 */
export function useProfileRefresh(): void {
  const { accessToken, refreshToken, user, setSession } = useSession();
  const online = useSyncStore((s) => s.online);

  useEffect(() => {
    if (!accessToken || !refreshToken || !user) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        const merged = { ...user, ...me, preferences: me.preferences ?? user.preferences ?? null };
        if (JSON.stringify(merged) !== JSON.stringify(user)) await setSession({ accessToken, refreshToken, user: merged });
      } catch {
        // offline or transient : keep the cached profile
      }
    };
    void refresh();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void refresh());
    return () => {
      cancelled = true;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, online]);
}
