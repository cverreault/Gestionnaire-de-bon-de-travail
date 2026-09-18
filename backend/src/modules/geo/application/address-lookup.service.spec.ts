import { AddressLookupService } from './address-lookup.service';
import type { AqCandidate } from '../infrastructure/adresses-quebec.client';

jest.mock('../infrastructure/nominatim.client', () => ({
  ...jest.requireActual('../infrastructure/nominatim.client'),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

function candidate(over: Partial<AqCandidate> = {}): AqCandidate {
  return {
    address: '451 Rue Principale, Sainte-Marthe J0P1W0',
    score: 100,
    addrType: 'Feature',
    latitude: 45.40495,
    longitude: -74.29262,
    postalCode: 'J0P1W0',
    city: 'Sainte-Marthe',
    odonyme: 'Rue Principale',
    civicNumber: 451,
    civicSuffix: null,
    unit: null,
    orientation: null,
    ...over,
  };
}

function make(opts: { candidates?: AqCandidate[]; nominatim?: { latitude: number; longitude: number } | null } = {}) {
  const aq = {
    suggest: jest.fn().mockResolvedValue([{ text: '451 Rue Principale, Sainte-Marthe J0P1W0', magicKey: 'k1' }]),
    findCandidates: jest.fn().mockResolvedValue(opts.candidates ?? [candidate()]),
  };
  const nominatim = { search: jest.fn().mockResolvedValue(opts.nominatim ?? null) };
  const properties = { find: jest.fn().mockResolvedValue(null) };
  const service = new AddressLookupService(aq as never, nominatim as never, properties as never);
  return { service, aq, nominatim, properties };
}

describe('AddressLookupService', () => {
  describe('suggest', () => {
    it('requires at least 3 characters', async () => {
      const { service, aq } = make();
      expect(await service.suggest('45')).toEqual([]);
      expect(aq.suggest).not.toHaveBeenCalled();
    });

    it('merges exact suggestions with fuzzy candidates, de-duplicated and capped', async () => {
      const { service, aq } = make({
        candidates: [
          candidate({ address: '451 Rue Principale, Sainte-Marthe J0P1W0', score: 82.8 }), // duplicate of the exact one
          candidate({ address: '451 A Rue Principale, Sainte-Marthe J0P1W0', score: 82.5 }),
          candidate({ address: 'Rue Principale, Saint-Prime', score: 74 }), // below the floor
        ],
      });
      const out = await service.suggest('451 principale sainte-marthe');
      expect(aq.suggest).toHaveBeenCalledWith('451 principale sainte-marthe', 6);
      expect(aq.findCandidates).toHaveBeenCalledWith(expect.objectContaining({ singleLine: '451 principale sainte-marthe' }));
      expect(out.map((s) => s.text)).toEqual([
        '451 Rue Principale, Sainte-Marthe J0P1W0',
        '451 A Rue Principale, Sainte-Marthe J0P1W0',
      ]);
      expect(out[0].magicKey).toBe('k1');
      expect(out[1].magicKey).toBeUndefined();
    });

    it('still answers from fuzzy candidates when the generic is missing and suggest is empty', async () => {
      const { service } = make({ candidates: [candidate({ address: '669 Rue Principale, Sainte-Marthe J0P1W0', score: 82.85, civicNumber: 669 })] });
      (service as unknown as { aq: { suggest: jest.Mock } }).aq.suggest.mockResolvedValueOnce([]);
      const out = await service.suggest('669 principale sainte-marthe');
      expect(out).toEqual([{ text: '669 Rue Principale, Sainte-Marthe J0P1W0', score: 82.85 }]);
    });
  });

  describe('resolve', () => {
    it('maps a candidate to form fields with a formatted postal code', async () => {
      const { service, aq } = make();
      const out = await service.resolve('451 Rue Principale, Sainte-Marthe J0P1W0', 'k1');
      expect(aq.findCandidates).toHaveBeenCalledWith(
        expect.objectContaining({ magicKey: 'k1', maxLocations: 1 }),
      );
      expect(out).toMatchObject({
        streetNumber: '451',
        street: 'Rue Principale',
        apartment: null,
        city: 'Sainte-Marthe',
        postalCode: 'J0P 1W0',
        province: 'QC',
        country: 'Canada',
        latitude: 45.40495,
        longitude: -74.29262,
        source: 'adresses-quebec',
      });
    });

    it('appends the orientation label and keeps the unit as apartment', async () => {
      const { service } = make({
        candidates: [candidate({ odonyme: 'Rue Sherbrooke', orientation: 'O', unit: '506', civicSuffix: 'A' })],
      });
      const out = await service.resolve('x');
      expect(out?.street).toBe('Rue Sherbrooke Ouest');
      expect(out?.streetNumber).toBe('451A');
      expect(out?.apartment).toBe('506');
    });

    it('returns null below the confidence threshold (another town guessed)', async () => {
      const { service } = make({ candidates: [candidate({ score: 76, city: 'Saint-Prime' })] });
      expect(await service.resolve('673 rue principale sainte-marthe')).toBeNull();
    });
  });

  describe('geocode (IGeocoder)', () => {
    const input = { streetNumber: '451', street: 'rue Principale', city: 'Sainte-Marthe', postalCode: 'J0P 1W0', province: 'QC', country: 'Canada' };

    it('uses Adresses Québec when the civic number matches with a high score', async () => {
      const { service, aq, nominatim } = make();
      const out = await service.geocode(input);
      expect(out).toMatchObject({ latitude: 45.40495, longitude: -74.29262, source: 'adresses-quebec', postalCode: 'J0P 1W0' });
      expect(aq.findCandidates.mock.calls[0][0].singleLine).toBe('451 rue Principale, Sainte-Marthe J0P1W0');
      expect(nominatim.search).not.toHaveBeenCalled();
    });

    it('accepts a fuzzy score when civic number and municipality both match (missing « rue »)', async () => {
      const { service, nominatim } = make({
        candidates: [candidate({ address: '669 Rue Principale, Sainte-Marthe J0P1W0', score: 82.85, civicNumber: 669, city: 'Sainte-Marthe' })],
      });
      const out = await service.geocode({ streetNumber: '669', street: 'Principale', city: 'Ste-Marthe', province: 'QC' });
      expect(out?.source).toBe('adresses-quebec');
      expect(nominatim.search).not.toHaveBeenCalled();
    });

    it('rejects a fuzzy score when the municipality differs (wrong-town guess)', async () => {
      const { service, nominatim } = make({
        candidates: [candidate({ address: '669 Rue Principale, Saint-Prime G8J1T6', score: 82, civicNumber: 669, city: 'Saint-Prime' })],
      });
      const out = await service.geocode({ streetNumber: '669', street: 'Principale', city: 'Sainte-Marthe', province: 'QC' });
      expect(out).toBeNull();
      expect(nominatim.search).toHaveBeenCalled();
    });

    it('rejects a high-score candidate whose civic number differs, then falls back to Nominatim', async () => {
      const { service, nominatim } = make({
        candidates: [candidate({ civicNumber: 449, score: 95 })],
        nominatim: { latitude: 45.4, longitude: -74.3 },
      });
      const out = await service.geocode(input);
      expect(out).toMatchObject({ source: 'nominatim', latitude: 45.4 });
      expect(nominatim.search).toHaveBeenCalled();
    });

    it('skips Adresses Québec outside Québec', async () => {
      const { service, aq, nominatim } = make({ nominatim: { latitude: 43.7, longitude: -79.4 } });
      const out = await service.geocode({ ...input, province: 'ON', city: 'Toronto' });
      expect(aq.findCandidates).not.toHaveBeenCalled();
      expect(out?.source).toBe('nominatim');
      expect(nominatim.search.mock.calls[0][0]).toContain('Toronto');
    });

    it('degrades the Nominatim query and returns null when nothing matches', async () => {
      const { service, nominatim } = make({ candidates: [] });
      expect(await service.geocode(input)).toBeNull();
      // number+street, street, city — three attempts
      expect(nominatim.search).toHaveBeenCalledTimes(3);
    });
  });
});
