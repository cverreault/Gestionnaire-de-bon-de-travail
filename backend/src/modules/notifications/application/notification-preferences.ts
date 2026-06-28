/**
 * Notification preferences — typed model + defaults.
 *
 * Stored under `User.preferences.notifications` (JSONB shallow-merge via
 * UsersService.updatePreferences). Each event type maps to a per-channel
 * boolean. The full preferences object is sparse — missing entries fall
 * back to DEFAULT_PREFERENCES.
 *
 * Adding a new event type
 *   1. Add the event name to NOTIFIABLE_EVENTS below.
 *   2. Add a default entry under DEFAULT_PREFERENCES so existing users
 *      get sensible behaviour without writing through their prefs.
 *   3. Update the listener(s) that need to consult the preference.
 */

export type NotificationChannel = 'inApp' | 'email' | 'push';

export interface PerEventPrefs {
  inApp: boolean;
  email: boolean;
  push: boolean;
}

export type NotificationPreferences = Partial<Record<string, PerEventPrefs>>;

/** Event types the platform currently knows how to surface to users. */
export const NOTIFIABLE_EVENTS = [
  'workOrder.assigned',
  'workOrder.completed',
  'workOrder.slaBreached',
] as const;

export type NotifiableEvent = (typeof NOTIFIABLE_EVENTS)[number];

/**
 * Sensible defaults. In-app stays on by everything since it's a passive
 * channel (the user only sees it when they open the dropdown). Email
 * defaults to on for assignments (high-signal) and off for completions
 * (the actor knows they completed it).
 */
export const DEFAULT_PREFERENCES: Record<NotifiableEvent, PerEventPrefs> = {
  'workOrder.assigned':    { inApp: true, email: true,  push: true  },
  'workOrder.completed':   { inApp: true, email: false, push: false },
  // SLA breaches matter — push them everywhere by default. Users can opt
  // out per channel but it's the kind of "we're about to disappoint a
  // client" event that warrants noise.
  'workOrder.slaBreached': { inApp: true, email: true,  push: true  },
};

/**
 * Merge user-provided sparse prefs with the defaults so the caller
 * always gets a fully-populated map.
 */
export function mergedPreferences(
  stored: NotificationPreferences | undefined,
): Record<NotifiableEvent, PerEventPrefs> {
  const out = {} as Record<NotifiableEvent, PerEventPrefs>;
  for (const evt of NOTIFIABLE_EVENTS) {
    out[evt] = { ...DEFAULT_PREFERENCES[evt], ...(stored?.[evt] ?? {}) };
  }
  return out;
}

/**
 * One-line read for a single (event, channel) tuple — used by the
 * listener before each channel dispatch.
 */
export function isChannelEnabled(
  stored: NotificationPreferences | undefined,
  event: NotifiableEvent,
  channel: NotificationChannel,
): boolean {
  const merged = mergedPreferences(stored);
  return merged[event][channel];
}
