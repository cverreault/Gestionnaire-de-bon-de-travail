import type { TFunction } from 'i18next';

/**
 * Shared, i18n-backed labels for the fixed business enums (client type,
 * address type, work-order priority). These used to be duplicated as
 * hardcoded French `Record<..., string>` maps across five pages, which both
 * bypassed i18n and drifted out of sync (the priority scale in particular
 * disagreed between the create and list screens). Route every display through
 * these helpers so the canonical translations live in the locale files.
 *
 * Unknown codes fall back to the raw code — address types can be tenant-custom
 * strings beyond the built-in enum, so a missing key must not blank the UI.
 */

export const clientTypeLabel = (t: TFunction, code: string): string =>
  t(`clients:types.${code}`, { defaultValue: code });

export const addressTypeLabel = (t: TFunction, code: string): string =>
  t(`addresses:types.${code}`, { defaultValue: code });

/**
 * Work-order priority is a single `Int` (0 = unset, 1 = lowest … 5 = highest).
 * The canonical labels live under `workOrders:priorityLevels.{0..5}`.
 */
export const priorityLabel = (t: TFunction, priority: number): string =>
  t(`workOrders:priorityLevels.${priority}`, { defaultValue: String(priority) });
