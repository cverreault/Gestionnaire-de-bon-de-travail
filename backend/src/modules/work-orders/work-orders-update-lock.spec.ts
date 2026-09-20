/** QA — PATCH /work-orders/:id optimistic lock for the mobile queue (ADR-016 §4). */
import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';

describe('WorkOrdersService.update — expectedUpdatedAt', () => {
  it('answers 409 OPTIMISTIC_LOCK_CONFLICT when the row changed, before touching anything', async () => {
    const svc = Object.create(WorkOrdersService.prototype) as WorkOrdersService;
    const findOne = jest.fn().mockResolvedValue({ id: 'wo', updatedAt: new Date('2026-09-19T10:00:00.000Z'), assignedToId: 'tech' });
    const prisma = { workOrder: { update: jest.fn() } };
    Object.assign(svc, { findOne, prisma });
    await expect(
      svc.update('wo', { templateData: { f1: 'x' }, expectedUpdatedAt: '2026-09-19T09:00:00.000Z' }, { id: 'tech', role: Role.TECHNICIAN } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });
});
