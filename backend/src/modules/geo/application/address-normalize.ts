/**
 * Pure helpers shared by the Adresses Québec lookup and the property match.
 * No Nest, no Prisma — unit-tested in isolation.
 */

/** Street generics (FR + EN) as found in Québec odonyms. Dropped before matching. */
const GENERICS = new Set([
  'rue', 'avenue', 'av', 'ave', 'boulevard', 'boul', 'bd', 'blvd', 'chemin', 'ch',
  'route', 'rte', 'rang', 'rg', 'montee', 'place', 'pl', 'allee', 'impasse', 'imp',
  'cours', 'croissant', 'crois', 'terrasse', 'promenade', 'autoroute', 'aut', 'carre',
  'cercle', 'sentier', 'ruelle', 'voie', 'descente', 'domaine', 'desserte', 'esplanade',
  'jardin', 'passage', 'plateau', 'traverse', 'concession', 'cote', 'drive', 'dr',
  'road', 'rd', 'street', 'st', 'crescent', 'cres', 'court', 'ct', 'lane', 'ln',
  'trail', 'circle', 'ridge', 'garden', 'terrace', 'square', 'sq',
]);

/** Particles — the roll stores them apart from the odonym (RL0101F). */
const ARTICLES = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'en', 'sur', 'chez', 'the', 'of',
]);

/** Cardinal suffixes — the roll stores them apart from the odonym (RL0101H). */
const ORIENTATIONS = new Set(['est', 'ouest', 'nord', 'sud', 'east', 'west', 'north', 'south']);

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Normalises a street label for matching: lowercase, no accents, no
 * generic (« rue »), no particle (« de la »), no trailing orientation,
 * tokens joined by a single space. `Chemin de la Rivière Ouest` → `riviere`.
 */
export function normalizeStreet(raw: string | null | undefined): string {
  if (!raw) return '';
  const all = stripAccents(raw.toLowerCase())
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let tokens = all.filter((t) => !GENERICS.has(t) && !ARTICLES.has(t));
  // « Côte », « Place », « Rang » can be the whole odonym: keep the generic
  // words, minus a leading one that is just the street type (« Rue de la Place » → « place »).
  if (tokens.length === 0) {
    tokens = all.filter((t) => !ARTICLES.has(t));
    if (tokens.length > 1 && GENERICS.has(tokens[0])) tokens = tokens.slice(1);
  }
  while (tokens.length > 1 && ORIENTATIONS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

/** `J0P1W0` / `j0p 1w0` → `J0P 1W0`; anything else is returned trimmed/uppercased. */
export function formatPostalCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  return raw.trim().toUpperCase() || null;
}

/** Leading integer of a civic number (`673A` → 673, `12-14` → 12). */
export function parseCivicNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const m = String(raw).trim().match(/^\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isSafeInteger(n) ? n : null;
}

/** Quebec-ish province values accepted by the Adresses Québec path. */
export function isQuebec(province: string | null | undefined): boolean {
  if (!province) return true; // default province of the schema is Québec
  const p = stripAccents(province.trim().toLowerCase());
  return p === 'qc' || p === 'quebec' || p === 'pq';
}

/** Great-circle distance in metres. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
