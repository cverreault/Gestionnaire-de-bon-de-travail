import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  type NotificationsListResponse,
  type NotificationPreferencesResponse,
  type NotifiableEventName,
  type PerEventPrefs,
} from '../services/notifications.service';

export const NOTIFICATIONS_KEY = 'notifications';

/**
 * In-app inbox poll. 30s refetchInterval is a deliberate trade-off: the
 * user notices a new BT within half a minute without us hammering the
 * backend. When SSE/Web Push lands (B1.3) we'll drop the poll and
 * invalidate the cache on the event instead.
 */
export function useNotifications(limit = 20) {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, 'list', { limit }],
    queryFn: async () => {
      const res = await listMyNotifications({ limit });
      return (res.data?.data ?? res.data) as NotificationsListResponse;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] }),
  });
}

// ── Preferences (B1.2) ───────────────────────────────────────────────────────

export function useNotificationPreferences() {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, 'preferences'],
    queryFn: async () => {
      const res = await getMyNotificationPreferences();
      return (res.data?.data ?? res.data) as NotificationPreferencesResponse;
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Record<NotifiableEventName, Partial<PerEventPrefs>>>) =>
      updateMyNotificationPreferences(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY, 'preferences'] }),
  });
}
