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
