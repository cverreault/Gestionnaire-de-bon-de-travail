/**
 * B11 — Schedule computation for recurring work orders.
 *
 * Pure functions (no DI, no I/O) so the entire recurrence math is
 * unit-testable in isolation.
 *
 * We keep the model narrow rather than shipping a full RRULE parser:
 * three frequencies (DAILY / WEEKLY / MONTHLY / YEARLY), an interval, and
 * for WEEKLY / MONTHLY an optional list of specific days. Covers every
 * pattern a small-team maintenance / dispatch operator actually configures.
 */

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function isValidFrequency(x: string): x is Frequency {
  return (FREQUENCIES as readonly string[]).includes(x);
}

export interface ScheduleSpec {
  frequency: Frequency;
  interval: number;
  /** WEEKLY only. Ints in 0..6 (Sun..Sat). Empty = anchor's weekday. */
  byDayOfWeek: number[];
  /** MONTHLY only. Ints in 1..31. Empty = anchor's day of month. */
  byDayOfMonth: number[];
  startDate: Date;
  endDate: Date | null;
}

/**
 * The first spawn timestamp — max(startDate, now). If `startDate` is
 * already in the future, that's the first run. If it's in the past, we
 * jump forward to the next occurrence that respects the pattern.
 */
export function computeFirstRun(spec: ScheduleSpec, now: Date = new Date()): Date {
  if (spec.startDate.getTime() > now.getTime()) {
    return alignToPattern(spec.startDate, spec);
  }
  return computeNextRun(spec, now, spec.startDate);
}

/**
 * The next run after `after`. Anchored on `after` (typically the last spawn
 * or the startDate).
 *
 * Rules :
 *   - DAILY   → advance by `interval` days.
 *   - WEEKLY  → if `byDayOfWeek` set, find the next listed weekday within
 *               the current interval-week; otherwise anchor's weekday +
 *               `interval` weeks.
 *   - MONTHLY → same shape with `byDayOfMonth`.
 *   - YEARLY  → same anchor + `interval` years, clamped to Feb 29 → Feb 28.
 *
 * `now` disambiguates when `after` is in the past — the returned Date is
 * always ≥ `now`. This is what the Cron sweeper wants: it only needs to
 * know « the next timestamp ≥ NOW that qualifies ».
 */
export function computeNextRun(
  spec: ScheduleSpec,
  now: Date,
  after: Date,
): Date {
  let candidate = alignToPattern(after, spec);
  // Keep advancing until we're strictly after `now`.
  let safety = 0;
  while (candidate.getTime() <= now.getTime()) {
    candidate = advance(candidate, spec);
    if (++safety > 1000) {
      // Bail out — a pathological config could spin forever otherwise.
      throw new Error('computeNextRun: too many advances (schedule too tight?)');
    }
  }
  return candidate;
}

/**
 * Advance by one interval unit — the smallest step that respects the
 * pattern. Used by computeNextRun to skip past `now`.
 */
function advance(from: Date, spec: ScheduleSpec): Date {
  const d = new Date(from.getTime());
  switch (spec.frequency) {
    case 'DAILY':
      d.setUTCDate(d.getUTCDate() + spec.interval);
      return d;

    case 'WEEKLY': {
      if (spec.byDayOfWeek.length > 0) {
        // Find the next listed weekday within the SAME week; if we're past
        // all of them, advance by `interval` weeks and pick the first one.
        const sortedDays = [...spec.byDayOfWeek].sort((a, b) => a - b);
        const currentDow = d.getUTCDay();
        const next = sortedDays.find((dow) => dow > currentDow);
        if (next !== undefined) {
          d.setUTCDate(d.getUTCDate() + (next - currentDow));
          return d;
        }
        // Roll over: next week's first listed day.
        const daysToStartOfNextInterval = 7 * spec.interval - currentDow;
        d.setUTCDate(d.getUTCDate() + daysToStartOfNextInterval + sortedDays[0]);
        return d;
      }
      d.setUTCDate(d.getUTCDate() + 7 * spec.interval);
      return d;
    }

    case 'MONTHLY': {
      if (spec.byDayOfMonth.length > 0) {
        const sortedDays = [...spec.byDayOfMonth].sort((a, b) => a - b);
        const currentDom = d.getUTCDate();
        const next = sortedDays.find((dom) => dom > currentDom);
        if (next !== undefined) {
          // Same month, later day — clamp if the month is shorter.
          return withDay(d, next);
        }
        // Roll over to next interval-month, first listed day.
        d.setUTCMonth(d.getUTCMonth() + spec.interval);
        return withDay(d, sortedDays[0]);
      }
      d.setUTCMonth(d.getUTCMonth() + spec.interval);
      return d;
    }

    case 'YEARLY': {
      d.setUTCFullYear(d.getUTCFullYear() + spec.interval);
      return d;
    }
  }
}

/**
 * Snap `date` to the next timestamp that matches the pattern (frequency +
 * byDayOfX). Used to canonicalise `startDate` when the user chose it
 * without regard to the pattern rules.
 */
function alignToPattern(date: Date, spec: ScheduleSpec): Date {
  const d = new Date(date.getTime());
  switch (spec.frequency) {
    case 'DAILY':
      return d;

    case 'WEEKLY': {
      if (spec.byDayOfWeek.length === 0) return d;
      const sortedDays = [...spec.byDayOfWeek].sort((a, b) => a - b);
      const currentDow = d.getUTCDay();
      if (sortedDays.includes(currentDow)) return d;
      const next = sortedDays.find((dow) => dow > currentDow);
      if (next !== undefined) {
        d.setUTCDate(d.getUTCDate() + (next - currentDow));
        return d;
      }
      // Rollover to the first listed day of next week.
      d.setUTCDate(d.getUTCDate() + (7 - currentDow) + sortedDays[0]);
      return d;
    }

    case 'MONTHLY': {
      if (spec.byDayOfMonth.length === 0) return d;
      const sortedDays = [...spec.byDayOfMonth].sort((a, b) => a - b);
      const currentDom = d.getUTCDate();
      if (sortedDays.includes(currentDom)) return d;
      const next = sortedDays.find((dom) => dom > currentDom);
      if (next !== undefined) return withDay(d, next);
      d.setUTCMonth(d.getUTCMonth() + 1);
      return withDay(d, sortedDays[0]);
    }

    case 'YEARLY':
      return d;
  }
}

/**
 * Set `date` to a target day-of-month, clamping to the month's last day
 * when the target overshoots (Feb 30 → Feb 28, Apr 31 → Apr 30).
 */
function withDay(date: Date, day: number): Date {
  const d = new Date(date.getTime());
  // Move to first of the month, then set day — the setUTCDate function
  // rolls over when day > days-in-month, which is NOT what we want.
  const daysInMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return d;
}

/**
 * Human-friendly preview of the next N runs. Used by the UI to show « ces
 * dates seront générées » before saving.
 */
export function previewNextRuns(
  spec: ScheduleSpec,
  count: number,
  now: Date = new Date(),
): Date[] {
  const runs: Date[] = [];
  let cursor = computeFirstRun(spec, now);
  for (let i = 0; i < count; i++) {
    if (spec.endDate && cursor.getTime() > spec.endDate.getTime()) break;
    runs.push(cursor);
    cursor = computeNextRun(spec, cursor, cursor);
  }
  return runs;
}
