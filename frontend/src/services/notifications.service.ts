import api from './api';

export interface NotificationRow {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  aggregateId: string | null;
  data: Record<string, unknown> | null;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'READ';
  channelsSent: string[] | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsListResponse {
  items: NotificationRow[];
  unreadCount: number;
}

export interface FindNotificationsParams {
  unreadOnly?: boolean;
  limit?: number;
}

export const listMyNotifications = (params: FindNotificationsParams = {}) =>
  api.get('/me/notifications', { params });

export const markNotificationRead = (id: string) =>
  api.patch(`/me/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  api.patch('/me/notifications/read-all');

// ── Preferences (B1.2) ───────────────────────────────────────────────────────

export interface PerEventPrefs {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

export type NotifiableEventName = 'workOrder.assigned' | 'workOrder.completed';

export interface NotificationPreferencesResponse {
  preferences: Record<NotifiableEventName, PerEventPrefs>;
  events: NotifiableEventName[];
}

export const getMyNotificationPreferences = () =>
  api.get('/me/notifications/preferences');

export const updateMyNotificationPreferences = (
  patch: Partial<Record<NotifiableEventName, Partial<PerEventPrefs>>>,
) => api.put('/me/notifications/preferences', patch);

// ── Web Push (B1.3) ──────────────────────────────────────────────────────────

/** Fetches the server's VAPID public key. 404 if push isn't configured. */
export const getVapidPublicKey = () =>
  api.get('/me/notifications/push/vapid-public-key');

export interface PushSubscribePayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export const subscribePush = (payload: PushSubscribePayload) =>
  api.post('/me/notifications/push/subscribe', payload);

export const unsubscribePush = (endpoint: string) =>
  api.delete('/me/notifications/push/subscribe', { data: { endpoint } });
