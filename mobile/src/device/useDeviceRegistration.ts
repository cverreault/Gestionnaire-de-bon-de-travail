import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { heartbeat, registerDevice } from '../api/endpoints';
import { useSession } from '../stores/session.store';
import { useUpgradeGate } from '../stores/upgrade.store';
import { appVersion, devicePayload } from './device-info';

const HEARTBEAT_MIN_INTERVAL_MS = 15 * 60_000;

/**
 * B38.3 — registers this installation once per session (PUT /me/devices/:id)
 * and sends a heartbeat when the app comes to the foreground, at most every
 * 15 min. The heartbeat answer drives the version gate (ADR-015 §5).
 * Technician-only: the server rejects other roles, so we don't even try.
 */
export function useDeviceRegistration(): void {
  const { accessToken, user, deviceId } = useSession();
  const setGate = useUpgradeGate((s) => s.set);
  const lastBeat = useRef(0);
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken || !deviceId || user?.role !== 'TECHNICIAN') return;
    let cancelled = false;

    async function beat() {
      try {
        const res = await heartbeat(deviceId, { appVersion: appVersion() });
        if (!cancelled) {
          lastBeat.current = Date.now();
          setGate({ upgradeRequired: res.upgradeRequired, minAppVersion: res.minAppVersion, latestAppVersion: res.latestAppVersion });
        }
      } catch {
        // Offline or server down: keep the last known gate.
      }
    }

    async function register() {
      try {
        await registerDevice(deviceId, devicePayload());
        registeredFor.current = user?.id ?? null;
        await beat();
      } catch {
        // Retried at the next foreground.
      }
    }

    if (registeredFor.current !== (user?.id ?? null)) void register();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (registeredFor.current !== (user?.id ?? null)) {
        void register();
      } else if (Date.now() - lastBeat.current > HEARTBEAT_MIN_INTERVAL_MS) {
        void beat();
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [accessToken, deviceId, user?.id, user?.role, setGate]);
}
