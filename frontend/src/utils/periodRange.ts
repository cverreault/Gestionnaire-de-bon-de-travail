import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from 'date-fns';

/** Date scope of the work-orders page : none, or a day / week / month around an anchor date. */
export type PeriodScope = 'all' | 'day' | 'week' | 'month';

export interface PeriodRange {
  /** YYYY-MM-DD inclusive bounds, undefined when scope = all. */
  from?: string;
  to?: string;
}

const ISO = 'yyyy-MM-dd';

export function periodRange(scope: PeriodScope, anchor: Date): PeriodRange {
  switch (scope) {
    case 'day':
      return { from: format(anchor, ISO), to: format(anchor, ISO) };
    case 'week':
      return { from: format(startOfWeek(anchor, { weekStartsOn: 1 }), ISO), to: format(endOfWeek(anchor, { weekStartsOn: 1 }), ISO) };
    case 'month':
      return { from: format(startOfMonth(anchor), ISO), to: format(endOfMonth(anchor), ISO) };
    default:
      return {};
  }
}

export function shiftPeriod(scope: PeriodScope, anchor: Date, dir: 1 | -1): Date {
  switch (scope) {
    case 'day':
      return dir > 0 ? addDays(anchor, 1) : subDays(anchor, 1);
    case 'week':
      return dir > 0 ? addWeeks(anchor, 1) : subWeeks(anchor, 1);
    case 'month':
      return dir > 0 ? addMonths(anchor, 1) : subMonths(anchor, 1);
    default:
      return anchor;
  }
}

/** Human label of the current period, e.g. « 19 sept. 2026 », « 14 – 20 sept. 2026 », « septembre 2026 ». */
export function periodLabel(scope: PeriodScope, anchor: Date, locale: string): string {
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale, opts);
  switch (scope) {
    case 'day':
      return fmt(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    case 'week': {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = endOfWeek(anchor, { weekStartsOn: 1 });
      return `${fmt(s, { day: 'numeric', month: 'short' })} – ${fmt(e, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    case 'month':
      return fmt(anchor, { month: 'long', year: 'numeric' });
    default:
      return '';
  }
}
