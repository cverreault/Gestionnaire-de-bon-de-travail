import { formatClientLocation, parseClientLocation } from './client-location.contract';

describe('client-location contract', () => {
  it('parses lat,lng with optional accuracy and timestamp', () => {
    expect(parseClientLocation('45.5017,-73.5673')).toEqual({ lat: 45.5017, lng: -73.5673 });
    expect(parseClientLocation('45.5017, -73.5673, 12.4, 2026-09-20T10:00:00.000Z')).toEqual({
      lat: 45.5017, lng: -73.5673, accuracy: 12, recordedAt: '2026-09-20T10:00:00.000Z',
    });
    expect(parseClientLocation(['46.8,-71.2'])).toEqual({ lat: 46.8, lng: -71.2 });
  });

  it('rejects absent or malformed values', () => {
    expect(parseClientLocation(undefined)).toBeNull();
    expect(parseClientLocation('')).toBeNull();
    expect(parseClientLocation('abc,def')).toBeNull();
    expect(parseClientLocation('95,10')).toBeNull();
    expect(parseClientLocation('10')).toBeNull();
    expect(parseClientLocation('45.5,-73.5,-3,not-a-date')).toEqual({ lat: 45.5, lng: -73.5 });
  });

  it('round-trips through the formatter', () => {
    const loc = { lat: 45.5017, lng: -73.5673, accuracy: 8, recordedAt: '2026-09-20T10:00:00.000Z' };
    expect(parseClientLocation(formatClientLocation(loc))).toEqual(loc);
    expect(formatClientLocation({ lat: 1, lng: 2 })).toBe('1,2');
  });
});
