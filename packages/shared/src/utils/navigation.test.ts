import { formatAddressLine, navigationUrl } from './navigation';

describe('navigationUrl', () => {
  it('prefers coordinates and uses the native scheme per platform', () => {
    const t = { latitude: 45.40495, longitude: -74.29262, address: 'ignored' };
    expect(navigationUrl(t, 'ios')).toBe('maps://?daddr=45.40495%2C-74.29262&dirflg=d');
    expect(navigationUrl(t, 'android')).toBe('google.navigation:q=45.40495%2C-74.29262');
    expect(navigationUrl(t, 'web')).toContain('destination=45.40495%2C-74.29262');
  });

  it('falls back to the address text, and to null when nothing usable', () => {
    expect(navigationUrl({ address: '451 Rue Principale, Sainte-Marthe' }, 'android')).toBe(
      'google.navigation:q=451%20Rue%20Principale%2C%20Sainte-Marthe',
    );
    expect(navigationUrl({ latitude: null, address: '  ' }, 'ios')).toBeNull();
  });
});

describe('formatAddressLine', () => {
  it('assembles number, street, apartment, city and postal code', () => {
    expect(formatAddressLine({ streetNumber: '451', street: 'Rue Principale', apartment: '2', city: 'Sainte-Marthe', postalCode: 'J0P 1W0' }))
      .toBe('451 Rue Principale, app. 2, Sainte-Marthe J0P 1W0');
    expect(formatAddressLine({ street: 'Chemin Middle', city: 'Clarenceville' })).toBe('Chemin Middle, Clarenceville');
  });
});
