/**
 * Normalise un numéro de téléphone saisi librement (« (514) 555-0199 »,
 * « 514.555.0199 », « +1 514 555 0199 ») en URL `tel:` utilisable par
 * `Linking.openURL`. Les numéros nord-américains à 10 chiffres reçoivent
 * l'indicatif +1. Renvoie `null` si aucun chiffre exploitable.
 */
export function toTelUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (hasPlus) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`;
  return `tel:${digits}`;
}
