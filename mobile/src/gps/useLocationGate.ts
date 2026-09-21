import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { create } from 'zustand';
import { useSession } from '../stores/session.store';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

interface GateState {
  /** null until the first check completed. */
  ok: boolean | null;
  servicesEnabled: boolean;
  permission: PermissionState;
  set: (p: Partial<Omit<GateState, 'set'>>) => void;
}

export const useLocationGateStore = create<GateState>((set) => ({ ok: null, servicesEnabled: true, permission: 'undetermined', set: (p) => set(p) }));

/** Whether the current user must have location on to use the app (B46). */
export function locationRequiredFor(user: { role?: string; locationRequired?: boolean } | null | undefined): boolean {
  return !!user && user.role === 'TECHNICIAN' && user.locationRequired !== false;
}

/** Reads the OS state (no prompt) and stores the verdict. */
export async function checkLocationGate(): Promise<boolean> {
  const store = useLocationGateStore.getState();
  try {
    const [services, perm] = await Promise.all([Location.hasServicesEnabledAsync(), Location.getForegroundPermissionsAsync()]);
    const permission: PermissionState = perm.granted ? 'granted' : perm.canAskAgain ? 'undetermined' : 'denied';
    const ok = services && perm.granted;
    store.set({ ok, servicesEnabled: services, permission });
    return ok;
  } catch {
    store.set({ ok: false });
    return false;
  }
}

/**
 * Root-layout hook : evaluates the gate for the signed-in technician on start
 * and every time the app comes to the foreground. Exempted users (admin
 * choice) and non-technicians are always `ok`.
 */
export function useLocationGate(): { ok: boolean | null; servicesEnabled: boolean; permission: PermissionState; recheck: () => Promise<boolean> } {
  const user = useSession((s) => s.user);
  const accessToken = useSession((s) => s.accessToken);
  const { ok, servicesEnabled, permission, set } = useLocationGateStore();
  const required = !!accessToken && locationRequiredFor(user);
  const [, force] = useState(0);

  const recheck = useCallback(async () => {
    if (!required) {
      set({ ok: true });
      return true;
    }
    const res = await checkLocationGate();
    force((n) => n + 1);
    return res;
  }, [required, set]);

  useEffect(() => {
    void recheck();
    if (!required) return;
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void recheck());
    return () => sub.remove();
  }, [required, recheck]);

  return { ok: required ? ok : true, servicesEnabled, permission, recheck };
}
