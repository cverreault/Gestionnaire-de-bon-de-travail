import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useSession } from '../stores/session.store';
import { useSyncStore } from '../sync/sync.store';
import { usePushStore } from './push.store';
import { pushTargetRoute } from './route';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { postLocationBatch } from '../api/endpoints';
import { rememberFix } from '../gps/gps.store';

/** B57 — the dispatcher asked « où es-tu ? » : answer with a fresh fix right away. */
async function answerLocateRequest(): Promise<void> {
  try {
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    rememberFix(l);
    await postLocationBatch([{ latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: l.coords.accuracy ?? null, recordedAt: new Date(l.timestamp).toISOString(), source: 'MOBILE_FOREGROUND' }], Crypto.randomUUID());
  } catch {
    // no permission / no signal : the dispatcher keeps the last known position
  }
}

// Foreground notifications : show the banner, and let the sync catch the change.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * B38.9 — asks for permission, obtains the Expo push token (sent to the
 * server by the device registration), pulls on receipt and deep-links on tap.
 * Technician-only, like the device registry.
 */
export function usePushNotifications(): void {
  const { accessToken, user } = useSession();
  const set = usePushStore((s) => s.set);
  const pullNow = useSyncStore((s) => s.pullNow);
  const router = useRouter();

  useEffect(() => {
    if (!accessToken || user?.role !== 'TECHNICIAN') return;
    const userId = user.id;
    let cancelled = false;

    void (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Dispatch2Go',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
          });
        }
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (cancelled) return;
        if (status !== 'granted') {
          set({ permission: 'denied', token: null, reason: 'permission' });
          return;
        }
        const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
        if (!projectId) {
          // Dev client without `eas init` : push cannot be tested, but nothing else breaks.
          set({ permission: 'granted', token: null, reason: 'no-project-id' });
          return;
        }
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        if (!cancelled) set({ permission: 'granted', token, reason: null });
      } catch (err) {
        if (!cancelled) set({ token: null, reason: err instanceof Error ? err.message : String(err) });
      }
    })();

    const received = Notifications.addNotificationReceivedListener((n) => {
      const data = (n.request.content.data ?? {}) as Record<string, unknown>;
      if (data.type === 'locate') void answerLocateRequest();
      else void pullNow(userId);
    });
    const responded = Notifications.addNotificationResponseReceivedListener((res) => {
      const route = pushTargetRoute(res.notification.request.content.data as Record<string, unknown>);
      void pullNow(userId);
      if (route) router.push(route as never);
    });
    // Cold start from a notification tap.
    void Notifications.getLastNotificationResponseAsync().then((res) => {
      const route = res && pushTargetRoute(res.notification.request.content.data as Record<string, unknown>);
      if (route && !cancelled) router.push(route as never);
    });

    return () => {
      cancelled = true;
      received.remove();
      responded.remove();
    };
  }, [accessToken, user?.id, user?.role, set, pullNow, router]);
}
