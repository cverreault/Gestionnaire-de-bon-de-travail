/**
 * QA — saveSignatures optimistic lock (B38.6, ADR-016 §4).
 */
import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';

const T0 = new Date('2026-09-18T10:00:00.000Z');
const T1 = new Date('2026-09-18T11:00:00.000Z');

function make() {
  const prisma = {
    workOrder: {
      findUnique: jest.fn().mockResolvedValue({ id: 'wo', assignedToId: 'tech', updatedAt: T0, status: 'IN_PROGRESS' }),
      update: jest.fn().mockResolvedValue({ id: 'wo', signatureClient: 'x', signatureTechnician: null, signedAt: T1, updatedAt: T1 }),
    },
  };
  const emitter = { emit: jest.fn() };
  // Only the two collaborators saveSignatures touches are needed.
  const svc = Object.create(WorkOrdersService.prototype) as WorkOrdersService;
  Object.assign(svc, { prisma, eventEmitter: emitter });
  return { svc, prisma };
}

describe('WorkOrdersService.saveSignatures — optimistic lock', () => {
  const tech = { id: 'tech', role: Role.TECHNICIAN } as never;

  it('answers 409 OPTIMISTIC_LOCK_CONFLICT when expectedUpdatedAt is stale', async () => {
    const { svc, prisma } = make();
    await expect(svc.saveSignatures('wo', { signatureClient: 'data:image/png;base64,AAA', expectedUpdatedAt: '2026-09-18T09:00:00.000Z' }, tech)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it('saves and returns the new updatedAt when expectedUpdatedAt matches (or is absent)', async () => {
    const { svc } = make();
    const out = await svc.saveSignatures('wo', { signatureClient: 'data:image/png;base64,AAA', expectedUpdatedAt: T0.toISOString() }, tech);
    expect(out).toMatchObject({ updatedAt: T1 });
    const out2 = await make().svc.saveSignatures('wo', { signatureTechnician: 'data:image/png;base64,BBB' }, tech);
    expect(out2).toMatchObject({ updatedAt: T1 });
  });
});
