import { DEFAULT_TIMEZONE } from '../contracts/tenant-context.contract';

/** Midnight of the given instant's day in an IANA zone (B59 : the tenant's `timezone`). */
export function startOfLocalDay(now = new Date(), zone: string = DEFAULT_TIMEZONE): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const localMidnightAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), 0, 0, 0);
  const localNowAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  const offsetMs = now.getTime() - localNowAsUtc;
  return new Date(localMidnightAsUtc + offsetMs);
}

/** Last millisecond of the same local day. */
export function endOfLocalDay(now = new Date(), zone: string = DEFAULT_TIMEZONE): Date {
  const start = startOfLocalDay(now, zone);
  const nextNoon = new Date(start.getTime() + 36 * 60 * 60 * 1000);
  return new Date(startOfLocalDay(nextNoon, zone).getTime() - 1);
}
