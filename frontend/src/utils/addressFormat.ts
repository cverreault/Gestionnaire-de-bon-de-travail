/**
 * Format the "civic + street" pair into a single display string.
 * Examples:
 *   { streetNumber: '123', street: 'rue des Érables' } → '123 rue des Érables'
 *   { streetNumber: null,  street: 'rue des Érables' } → 'rue des Érables'
 *   { streetNumber: '123', street: '' }                → '123'
 */
export function formatStreet(
  input: { streetNumber?: string | null; street?: string | null } | null | undefined,
): string {
  if (!input) return '';
  const num = (input.streetNumber ?? '').trim();
  const name = (input.street ?? '').trim();
  if (num && name) return `${num} ${name}`;
  return num || name;
}
