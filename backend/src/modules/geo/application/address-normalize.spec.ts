import {
  distanceMeters,
  formatPostalCode,
  isQuebec,
  normalizeStreet,
  parseCivicNumber,
} from './address-normalize';

describe('normalizeStreet', () => {
  it('drops generic, particles, accents and trailing orientation', () => {
    expect(normalizeStreet('Chemin de la Rivière Ouest')).toBe('riviere');
    expect(normalizeStreet('Rue Principale')).toBe('principale');
    expect(normalizeStreet('Boulevard René-Lévesque Ouest')).toBe('rene levesque');
    expect(normalizeStreet("Avenue de l'Église")).toBe('eglise');
  });

  it('matches the roll odonym form (uppercase, no accents, no generic)', () => {
    expect(normalizeStreet('RIVIERE')).toBe(normalizeStreet('rue de la Rivière'));
    expect(normalizeStreet('SAINT-DENIS')).toBe(normalizeStreet('Rue Saint-Denis'));
    expect(normalizeStreet('1RE')).toBe(normalizeStreet('1re Avenue'));
  });

  it('keeps a lone orientation token', () => {
    expect(normalizeStreet('Rue Ouest')).toBe('ouest');
  });

  it('keeps an odonym made only of generic words (« Côte », « Place »)', () => {
    expect(normalizeStreet('COTE')).toBe('cote');
    expect(normalizeStreet('Rue de la Place')).toBe('place');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeStreet(null)).toBe('');
    expect(normalizeStreet('  ')).toBe('');
  });
});

describe('formatPostalCode', () => {
  it('inserts the space in a compact Canadian code', () => {
    expect(formatPostalCode('J0P1W0')).toBe('J0P 1W0');
    expect(formatPostalCode('j0p 1w0')).toBe('J0P 1W0');
  });
  it('passes through non-Canadian values and nulls', () => {
    expect(formatPostalCode('12345')).toBe('12345');
    expect(formatPostalCode('')).toBeNull();
  });
});

describe('parseCivicNumber', () => {
  it('extracts the leading integer', () => {
    expect(parseCivicNumber('673A')).toBe(673);
    expect(parseCivicNumber('12-14')).toBe(12);
    expect(parseCivicNumber(451)).toBe(451);
  });
  it('returns null when there is no number', () => {
    expect(parseCivicNumber('')).toBeNull();
    expect(parseCivicNumber('N/A')).toBeNull();
    expect(parseCivicNumber(undefined)).toBeNull();
  });
});

describe('isQuebec', () => {
  it('accepts the schema default and common spellings', () => {
    expect(isQuebec(null)).toBe(true);
    expect(isQuebec('QC')).toBe(true);
    expect(isQuebec('Québec')).toBe(true);
    expect(isQuebec('ON')).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('is ~0 for the same point and ~111 m per 0.001° of latitude', () => {
    expect(distanceMeters(45.5, -73.5, 45.5, -73.5)).toBeCloseTo(0, 5);
    expect(distanceMeters(45.5, -73.5, 45.501, -73.5)).toBeCloseTo(111, -1);
  });
});
