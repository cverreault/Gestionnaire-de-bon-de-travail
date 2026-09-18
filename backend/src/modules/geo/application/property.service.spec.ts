import { PropertyService } from './property.service';

const UNIT = {
  idProvinc: '71110000000000000000001',
  addressSeq: 1,
  codeMun: '71110',
  matricule: '000000000000000001',
  civicNumber: 451,
  civicSuffix: null,
  civicNumberEnd: null,
  streetGeneric: 'Rue',
  streetLink: null,
  streetName: 'PRINCIPALE',
  streetNorm: 'principale',
  orientation: null,
  unitNumber: null,
  latitude: 45.40495,
  longitude: -74.29262,
  landUseCode: '1000',
  yearBuilt: 1965,
  storeys: 2,
  dwellings: 1,
  landAreaM2: 1200.5,
  floorAreaM2: 180,
  valueLand: 50000,
  valueBuilding: 200000,
  valueTotal: 250000,
  lotNumbers: '1234567, 1234568',
  rollYear: 2026,
};

function make(units: Array<Record<string, unknown>>, municipalities = [{ code: '71110', name: 'Sainte-Marthe' }]) {
  const prisma = {
    propertyUnit: { findMany: jest.fn().mockResolvedValue(units.map((u) => ({ ...UNIT, ...u }))) },
    municipality: {
      findUnique: jest.fn().mockResolvedValue(municipalities[0] ?? null),
      findMany: jest.fn().mockResolvedValue(municipalities),
    },
    landUseCode: { findUnique: jest.fn().mockResolvedValue({ code: '1000', label: 'Logement' }) },
    clientAddress: { findUnique: jest.fn() },
  };
  return { service: new PropertyService(prisma as never), prisma };
}

describe('PropertyService.find', () => {
  it('matches by civic number + street inside the coordinate box and builds the sheet', async () => {
    const { service, prisma } = make([
      { civicNumber: 449, latitude: 45.40480 },
      {},
      { civicNumber: 451, unitNumber: '2', addressSeq: 2 },
    ]);
    const out = await service.find({ latitude: 45.4049, longitude: -74.2926, streetNumber: '451', street: 'rue Principale' });

    const where = prisma.propertyUnit.findMany.mock.calls[0][0].where;
    expect(where.latitude.gte).toBeCloseTo(45.4049 - 0.0015, 6);
    expect(out).toMatchObject({
      matchedBy: 'number+street',
      municipality: 'Sainte-Marthe',
      address: '451 Rue Principale',
      landUseLabel: 'Logement',
      yearBuilt: 1965,
      dwellings: 1,
      lotNumbers: ['1234567', '1234568'],
      valueTotal: 250000,
      rollYear: 2026,
    });
    // The building row (no unit) wins over the apartment row of the same address.
    expect(out?.address).not.toContain('unité');
  });

  it('accepts a civic range (12-16) containing the wanted number', async () => {
    const { service } = make([{ civicNumber: 12, civicNumberEnd: 16 }]);
    const out = await service.find({ latitude: 45.4049, longitude: -74.2926, streetNumber: '14', street: 'Principale' });
    expect(out?.matchedBy).toBe('number+street');
    expect(out?.address).toBe('12-16 Rue Principale');
  });

  it('falls back to the nearest unit within 40 m when the number is unknown', async () => {
    const { service } = make([
      { civicNumber: 449, latitude: 45.40496, longitude: -74.29263 },
      { civicNumber: 999, latitude: 45.4060, longitude: -74.2926 },
    ]);
    const out = await service.find({ latitude: 45.40495, longitude: -74.29262, street: 'Principale' });
    expect(out).toMatchObject({ matchedBy: 'nearest', address: '449 Rue Principale' });
    expect(out?.distanceMeters).toBeLessThan(40);
  });

  it('returns null when the only candidates are far and the number differs', async () => {
    const { service } = make([{ civicNumber: 999, latitude: 45.4060 }]);
    expect(await service.find({ latitude: 45.40495, longitude: -74.29262, streetNumber: '451', street: 'Principale' })).toBeNull();
  });

  it('without coordinates, resolves the municipality by name and queries by normalised street + number', async () => {
    const { service, prisma } = make([{}]);
    const out = await service.find({ streetNumber: '451', street: 'Rue Principale', city: 'sainte-marthe' });
    const where = prisma.propertyUnit.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ codeMun: { in: ['71110'] }, streetNorm: 'principale', civicNumber: 451 });
    expect(out?.matchedBy).toBe('number+street');
  });

  it('returns null for an unknown municipality without coordinates', async () => {
    const { service, prisma } = make([{}]);
    expect(await service.find({ street: 'Principale', city: 'Nulle-Part' })).toBeNull();
    expect(prisma.propertyUnit.findMany).not.toHaveBeenCalled();
  });
});

describe('PropertyService.findForClientAddress', () => {
  it('reads the client address then matches it; null when the address is not visible', async () => {
    const { service, prisma } = make([{}]);
    prisma.clientAddress.findUnique.mockResolvedValueOnce({
      latitude: 45.40495, longitude: -74.29262, streetNumber: '451', street: 'rue Principale', city: 'Sainte-Marthe',
    });
    expect((await service.findForClientAddress('a-1'))?.matricule).toBe(UNIT.matricule);

    prisma.clientAddress.findUnique.mockResolvedValueOnce(null);
    expect(await service.findForClientAddress('a-2')).toBeNull();
  });
});
