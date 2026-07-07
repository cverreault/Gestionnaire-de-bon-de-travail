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
