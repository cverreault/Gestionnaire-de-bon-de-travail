/**
 * B10.2 — helpers for bilingual (FR/EN) config-entity text fields.
 *
 * TaskMgr's config entities (task types, statuses, transitions, templates,
 * client/address types…) store two columns per user-facing text field:
 * `nameFr` + `nameEn`, `descriptionFr` + `descriptionEn`, or `labelFr` +
 * `labelEn`. Services accept both on write and expose both on read; each
 * call site picks based on the caller's locale with a fallback to the
 * other language when a translation is missing.
 *
 * A single legacy column (`name` / `description` / `label`) is kept alive
 * for backwards-compat during the transition. Services keep it in sync
 * with `*Fr` on writes (FR = canonical) so any consumer still reading the
 * legacy field sees a stable value.
 */

export type Locale = 'fr' | 'en';

/**
 * Return the best value for a bilingual pair given a locale.
 *
 * ```
 * pick({ fr: 'Ouvert', en: 'Open' }, 'en') // → 'Open'
 * pick({ fr: 'Ouvert', en: '' },     'en') // → 'Ouvert'  (fallback)
 * pick({ fr: '',       en: 'Open' }, 'fr') // → 'Open'    (fallback)
 * ```
 *
 * Returns an empty string only when BOTH sides are empty — the caller
 * decides whether that's an error or just "no name set yet".
 */
export function pick(
  pair: { fr: string | null | undefined; en: string | null | undefined },
  locale: Locale,
): string {
  const primary = locale === 'fr' ? pair.fr : pair.en;
  const secondary = locale === 'fr' ? pair.en : pair.fr;
  if (primary && primary.length > 0) return primary;
  if (secondary && secondary.length > 0) return secondary;
  return '';
}

/**
 * Normalise a write payload. If the caller only sent the legacy field
 * (`name` / `description` / `label`), broadcast it into both FR and EN
 * so an older client doesn't wipe the new bilingual columns.
 *
 * If the caller sent one bilingual side but not the other, we DON'T copy
 * across — the empty side stays empty and the read path falls back at
 * display time.
 */
export function normalizePair(input: {
  legacy?: string | null;
  fr?: string | null;
  en?: string | null;
}): { fr: string; en: string } {
  const hasBilingual = input.fr !== undefined || input.en !== undefined;
  if (hasBilingual) {
    return { fr: input.fr ?? '', en: input.en ?? '' };
  }
  const l = input.legacy ?? '';
  return { fr: l, en: l };
}

/**
 * Same as normalizePair but for OPTIONAL fields (description). Returns
 * nullable values so we don't force an empty description on a partial
 * update.
 */
export function normalizeOptionalPair(input: {
  legacy?: string | null;
  fr?: string | null;
  en?: string | null;
}): { fr: string | null; en: string | null } {
  const hasBilingual = input.fr !== undefined || input.en !== undefined;
  if (hasBilingual) {
    return { fr: input.fr ?? null, en: input.en ?? null };
  }
  const l = input.legacy;
  if (l === undefined) return { fr: null, en: null };
  return { fr: l, en: l };
}
