/** Ring buffer of app events for the diagnostics report (profile → « Envoyer un rapport »). */
export interface DiagEvent {
  at: string;
  kind: string;
  message: string;
  data?: Record<string, unknown>;
}

const MAX = 200;
const events: DiagEvent[] = [];

export function logEvent(kind: string, message: string, data?: Record<string, unknown>): void {
  events.push({ at: new Date().toISOString(), kind, message, ...(data ? { data } : {}) });
  if (events.length > MAX) events.splice(0, events.length - MAX);
}

export function recentEvents(): DiagEvent[] {
  return [...events];
}
