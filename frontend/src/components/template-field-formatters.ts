// Small format helpers used by template fields with fixed input masks.
// Pure functions — no React, no DOM access. Easy to unit-test if needed.

/**
 * Format raw digits typed by the user into the North-American phone shape
 * `XXX-XXX-XXXX`. Non-digits are stripped, max 10 digits.
 *
 * Examples:
 *   "5145551234"  → "514-555-1234"
 *   "514 555-1234"→ "514-555-1234"
 *   "514"          → "514"
 *   "51"           → "51"
 */
export function formatPhoneNA(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean);
  return parts.join('-');
}

/**
 * Format a raw string into the Canadian postal code shape `A1A 1A1`.
 * Non-alphanumeric characters are stripped, letters upper-cased, max 6 chars,
 * with a single space inserted after the third character.
 *
 * Examples:
 *   "h1a2b3"   → "H1A 2B3"
 *   "H1A 2B3"  → "H1A 2B3"
 *   "h1a"       → "H1A"
 */
export function formatPostalCodeCA(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 3)} ${clean.slice(3)}`;
}
