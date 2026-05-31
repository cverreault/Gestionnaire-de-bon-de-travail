import i18n from '../i18n';
import { fr, enCA } from 'date-fns/locale';

/** Returns 'fr-CA' or 'en-CA' based on the current i18next language. */
export function currentBcp47(): 'fr-CA' | 'en-CA' {
  return i18n.language === 'en' ? 'en-CA' : 'fr-CA';
}

/** Format a Date / ISO string as a localized date string. */
export function formatDate(
  d: Date | string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString(currentBcp47(), opts);
}

/** Format a Date / ISO string as a localized date+time string. */
export function formatDateTime(
  d: Date | string | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!d) return '';
  return new Date(d).toLocaleString(currentBcp47(), opts);
}

/** Format a Date / ISO string as a localized time string (HH:mm). */
export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleTimeString(currentBcp47(), { hour: '2-digit', minute: '2-digit' });
}

/** Get the matching date-fns Locale object for the current language. */
export function currentDateFnsLocale() {
  return i18n.language === 'en' ? enCA : fr;
}
