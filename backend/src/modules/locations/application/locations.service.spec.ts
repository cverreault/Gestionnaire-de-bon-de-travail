/**
 * QA — locations.service.spec.ts (B5.2)
 *
 * Locks the opt-in / opt-out enforcement contract on recordLocation():
 *   1. Inactive user → 403
 *   2. Non-technician role → 403 (admin/dispatcher can't post their own position)
 *   3. Technician with gps.enabled=false → 403
 *   4. Technician with no gps key → 403 (default OFF)
 *   5. Technician with gps.enabled=true → row inserted with the right payload
 *
 * latestPositions() is a raw-SQL passthrough; the spec mocks the
 * $queryRaw call and verifies the camelCase mapping.
 */

import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { LocationsService } from './locations.service';

function makePrisma() {
  return {
    user: { findUnique: jest.fn() },
    technicianLocation: { create: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

function makeService(prisma: MockPrisma): LocationsService {
  const ctx = { requireTenantId: () => '00000000-0000-0000-0000-000000000001' };
  return new LocationsService(prisma as unknown as never, ctx as unknown as never);
}

describe('LocationsService.recordLocation', () => {
  const validInput = {
    userId: 'tech-1',
    latitude: 45.5,
    longitude: -73.5,
    accuracy: 8,
  };

  it('rejects when user is missing or inactive', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(makeService(prisma).recordLocation(validInput)).rejects.toThrow(
      ForbiddenException,
    );

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'tech-1',
      role: Role.TECHNICIAN,
      isActive: false,
      preferences: { gps: { enabled: true } },
    });
    await expect(makeService(prisma).recordLocation(validInput)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when the caller is not a TECHNICIAN', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'tech-1',
      role: Role.ADMIN,
      isActive: true,
      preferences: { gps: { enabled: true } },
    });
    await expect(makeService(prisma).recordLocation(validInput)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when gps.enabled is false (opt-out is sticky server-side)', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'tech-1',
      role: Role.TECHNICIAN,
      isActive: true,
      preferences: { gps: { enabled: false } },
    });
    await expect(makeService(prisma).recordLocation(validInput)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.technicianLocation.create).not.toHaveBeenCalled();
  });

  it('B46 — accepts when the admin made location mandatory, whatever the user toggle says', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'tech-1',
      role: Role.TECHNICIAN,
      isActive: true,
      locationRequired: true,
      preferences: { gps: { enabled: false } },
    });
    await makeService(prisma).recordLocation(validInput);
    expect(prisma.technicianLocation.create).toHaveBeenCalled();
  });

  it('rejects when the gps key is missing entirely (default OFF)', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'tech-1',
      role: Role.TECHNICIAN,
      isActive: true,
      preferences: { theme: 'dark' },
    });
    await expect(makeService(prisma).recordLocation(validInput)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('inserts the row when gps.enabled === true', async () => {
    const prisma = makePrisma();
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'tech-1',
      role: Role.TECHNICIAN,
      isActive: true,
      preferences: { gps: { enabled: true } },
    });
    await makeService(prisma).recordLocation(validInput);
    expect(prisma.technicianLocation.create).toHaveBeenCalledWith({
      data: {
        technicianId: 'tech-1',
        latitude: 45.5,
        longitude: -73.5,
        accuracy: 8,
      },
    });
  });
});

describe('LocationsService.latestPositions', () => {
  it('maps the raw-SQL snake_case rows to camelCase', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        technician_id: 'tech-1',
        first_name: 'Marie',
        last_name: 'Tremblay',
        latitude: 45.5,
        longitude: -73.5,
        accuracy: 8,
        recorded_at: new Date('2026-06-29T10:00:00Z'),
      },
    ]);
    const rows = await makeService(prisma).latestPositions();
    expect(rows).toEqual([
      {
        technicianId: 'tech-1',
        firstName: 'Marie',
        lastName: 'Tremblay',
        latitude: 45.5,
        longitude: -73.5,
        accuracy: 8,
        recordedAt: new Date('2026-06-29T10:00:00Z'),
      },
    ]);
  });
});

describe('LocationsService.recordBatch (B37.7)', () => {
  const tech = { id: 'tech-1', role: Role.TECHNICIAN, isActive: true, preferences: { gps: { enabled: true } } };
  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

  function makeBatchPrisma(count = 0) {
    const prisma = { ...makePrisma(), technicianLocation: { create: jest.fn(), createMany: jest.fn().mockResolvedValue({ count }) } };
    prisma.user.findUnique.mockResolvedValue(tech);
    return prisma;
  }

  it('rejects an opted-out technician before touching the table', async () => {
    const prisma = makeBatchPrisma();
    prisma.user.findUnique.mockResolvedValue({ ...tech, preferences: {} });
    await expect(makeService(prisma as never).recordBatch('tech-1', [{ latitude: 1, longitude: 2, recordedAt: iso(0), source: 'MOBILE_FOREGROUND' } as never])).rejects.toThrow(ForbiddenException);
    expect(prisma.technicianLocation.createMany).not.toHaveBeenCalled();
  });

  it('stores valid fixes with their source, rejects future / too old / in-batch duplicates per index, counts skipped duplicates', async () => {
    const prisma = makeBatchPrisma(2);
    const sameTs = iso(-60_000);
    const fixes = [
      { latitude: 45.5, longitude: -73.5, accuracy: 5, recordedAt: iso(-30_000), source: 'MOBILE_BACKGROUND' },
      { latitude: 45.6, longitude: -73.6, recordedAt: iso(5 * 60_000), source: 'MOBILE_FOREGROUND' },
      { latitude: 45.7, longitude: -73.7, recordedAt: iso(-8 * 24 * 3600_000), source: 'MOBILE_FOREGROUND' },
      { latitude: 45.8, longitude: -73.8, recordedAt: sameTs, source: 'MOBILE_FOREGROUND' },
      { latitude: 45.9, longitude: -73.9, recordedAt: sameTs, source: 'MOBILE_FOREGROUND' },
      { latitude: 46.0, longitude: -74.0, recordedAt: iso(-10_000), source: 'MOBILE_FOREGROUND' },
    ];
    const out = await makeService(prisma as never).recordBatch('tech-1', fixes as never);
    expect(prisma.technicianLocation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ technicianId: 'tech-1', latitude: 45.5, accuracy: 5, source: 'MOBILE_BACKGROUND', recordedAt: expect.any(Date) }),
        expect.objectContaining({ latitude: 45.8, accuracy: null }),
        expect.objectContaining({ latitude: 46.0 }),
      ],
      skipDuplicates: true,
    });
    expect(out.rejected).toEqual([
      { index: 1, reason: 'IN_FUTURE' },
      { index: 2, reason: 'TOO_OLD' },
      { index: 4, reason: 'DUPLICATE_IN_BATCH' },
    ]);
    // 3 rows sent, 2 inserted → 1 was already stored (replayed batch).
    expect(out).toMatchObject({ accepted: 2, duplicates: 1 });
  });

  it('skips the insert when every fix is rejected', async () => {
    const prisma = makeBatchPrisma();
    const out = await makeService(prisma as never).recordBatch('tech-1', [{ latitude: 1, longitude: 2, recordedAt: 'garbage', source: 'MOBILE_FOREGROUND' } as never]);
    expect(prisma.technicianLocation.createMany).not.toHaveBeenCalled();
    expect(out).toEqual({ accepted: 0, duplicates: 0, rejected: [{ index: 0, reason: 'INVALID_TIMESTAMP' }] });
  });
});
