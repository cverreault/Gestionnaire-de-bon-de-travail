/**
 * B10.2 — helpers for bilingual (FR/EN) config-entity text fields.
 *
 * TaskMgr's config entities store two columns per user-facing text field
 * (`nameFr` + `nameEn`, `descriptionFr` + `descriptionEn`, `labelFr` +
 * `labelEn`). This module gives the display code a single call site that
 * picks the right value given the current locale, with a graceful fallback
 * to the other language when a translation is missing.
 */

import i18n from '../i18n';

export type Locale = 'fr' | 'en';

/**
 * Resolve the current UI locale to 'fr' or 'en'. Anything unknown is
 * treated as 'fr' (canonical), matching the backend's fallback rule.
 */
export function currentLocale(): Locale {
  const raw = (i18n.language || 'fr').toLowerCase();
  if (raw.startsWith('en')) return 'en';
  return 'fr';
}

/**
 * Pick the best value for a bilingual pair given a locale.
 *
 * ```
 * pick({ fr: 'Ouvert', en: 'Open' }, 'en') // → 'Open'
 * pick({ fr: 'Ouvert', en: '' },     'en') // → 'Ouvert'  (fallback)
 * ```
 */
export function pick(
  pair: { fr: string | null | undefined; en: string | null | undefined },
  locale: Locale = currentLocale(),
): string {
  const primary = locale === 'fr' ? pair.fr : pair.en;
  const secondary = locale === 'fr' ? pair.en : pair.fr;
  if (primary && primary.length > 0) return primary;
  if (secondary && secondary.length > 0) return secondary;
  return '';
}

/**
 * Convenience for entities exposing `{ nameFr, nameEn, name }`.
 *
 * Falls through in order:
 *   1. current-locale field (nameFr for FR, nameEn for EN)
 *   2. the other language
 *   3. the legacy `name` field (for records that pre-date B10.2)
 */
export function localizedName<T extends { nameFr?: string | null; nameEn?: string | null; name?: string | null }>(
  row: T,
  locale?: Locale,
): string {
  const bilingual = pick({ fr: row.nameFr, en: row.nameEn }, locale);
  if (bilingual) return bilingual;
  return row.name ?? '';
}

/**
 * Convenience for entities exposing `{ labelFr, labelEn, label }`.
 */
export function localizedLabel<T extends { labelFr?: string | null; labelEn?: string | null; label?: string | null }>(
  row: T,
  locale?: Locale,
): string {
  const bilingual = pick({ fr: row.labelFr, en: row.labelEn }, locale);
  if (bilingual) return bilingual;
  return row.label ?? '';
}

/**
 * Convenience for entities exposing `{ descriptionFr, descriptionEn, description }`.
 */
export function localizedDescription<T extends { descriptionFr?: string | null; descriptionEn?: string | null; description?: string | null }>(
  row: T,
  locale?: Locale,
): string {
  const bilingual = pick(
    { fr: row.descriptionFr, en: row.descriptionEn },
    locale,
  );
  if (bilingual) return bilingual;
  return row.description ?? '';
}
