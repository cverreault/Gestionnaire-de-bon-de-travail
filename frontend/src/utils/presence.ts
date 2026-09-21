/** B51 — human-readable durations for presence (« depuis 1 h 12 », « vu il y a 3 min »). */
export function formatDuration(ms: number, locale: string): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  const en = locale.startsWith('en');
  if (min < 1) return en ? 'less than a minute' : "moins d'une minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  if (h < 24) return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
  const d = Math.floor(h / 24);
  return en ? `${d} d ${h % 24} h` : `${d} j ${h % 24} h`;
}

/** Short device label from a user agent + device id (mobile app vs browser). */
export function describeAgent(userAgent: string | null | undefined, deviceId: string | null | undefined): string {
  if (deviceId) return 'App mobile';
  const ua = userAgent ?? '';
  const os = /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Linux/i.test(ua) ? 'Linux' : '';
  const browser = /Edg\//i.test(ua) ? 'Edge' : /Chrome\//i.test(ua) ? 'Chrome' : /Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : '';
  return [browser, os].filter(Boolean).join(' · ') || (ua ? ua.slice(0, 40) : '—');
}
