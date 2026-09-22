import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { BatchService } from './batch.service';
import { BatchAction } from '../dto/batch-work-orders.dto';

/**
 * B55 — batch actions delegate to the single-item paths and never let one
 * failure block the others.
 */
const admin = { id: 'admin-1', role: Role.ADMIN };

function build(overrides: Record<string, jest.Mock> = {}) {
  const prisma = {
    workOrder: { findUnique: jest.fn().mockResolvedValue({ referenceNumber: 'BT-1', processDefinitionId: 'proc', status: 'CREATED' }) },
    processStatus: { findFirst: jest.fn().mockResolvedValue({ id: 's-700' }) },
  };
  const workOrders = {
    getAvailableTransitions: jest.fn().mockResolvedValue({
      transitions: [
        { toStatusId: 's-100', toStatusCode: 100, requiredFields: ['assignedToId'] },
        { toStatusId: 's-0', toStatusCode: 0, requiredFields: [] },
      ],
    }),
    transition: jest.fn().mockImplementation((id: string) => Promise.resolve({ referenceNumber: `REF-${id}` })),
    update: jest.fn().mockImplementation((id: string) => Promise.resolve({ referenceNumber: `REF-${id}` })),
    assignAndDispatch: jest.fn().mockImplementation((id: string) => Promise.resolve({ referenceNumber: `REF-${id}` })),
    ...overrides,
  };
  return { svc: new BatchService(prisma as never, workOrders as never), prisma, workOrders };
}

describe('BatchService (B55)', () => {
  it('ASSIGN goes through the process transition carrying the technician', async () => {
    const { svc, workOrders } = build();
    const res = await svc.run({ ids: ['a', 'b', 'a'], action: BatchAction.ASSIGN, technicianId: 'tech' }, admin);
    expect(res.ok.map((o) => o.id)).toEqual(['a', 'b']); // duplicates collapsed
    expect(res.failed).toEqual([]);
    expect(workOrders.transition).toHaveBeenCalledWith('a', { targetStepId: 's-100', assignedToId: 'tech' }, admin);
  });

  it('ASSIGN falls back to a reassignment when no assign transition is available', async () => {
    const { svc, workOrders } = build({
      getAvailableTransitions: jest.fn().mockResolvedValue({ transitions: [{ toStatusId: 's-200', toStatusCode: 200, requiredFields: [] }] }),
    });
    await svc.run({ ids: ['a'], action: BatchAction.ASSIGN, technicianId: 'tech' }, admin);
    expect(workOrders.update).toHaveBeenCalledWith('a', { assignedToId: 'tech', status: 'ASSIGNED' }, admin);
  });

  it('DISPATCH delegates to assignAndDispatch with the date and note', async () => {
    const { svc, workOrders } = build();
    await svc.run({ ids: ['a'], action: BatchAction.DISPATCH, technicianId: 'tech', scheduledDate: '2026-10-01T12:00:00.000Z', note: 'go' }, admin);
    expect(workOrders.assignAndDispatch).toHaveBeenCalledWith('a', { technicianId: 'tech', scheduledDate: '2026-10-01T12:00:00.000Z', note: 'go' }, 'admin-1');
  });

  it('UNASSIGN uses the transition back to the initial step and reports the ones that cannot', async () => {
    const { svc, workOrders } = build({
      getAvailableTransitions: jest
        .fn()
        .mockResolvedValueOnce({ transitions: [{ toStatusId: 's-0', toStatusCode: 0, requiredFields: [] }] })
        .mockResolvedValueOnce({ transitions: [] }),
    });
    const res = await svc.run({ ids: ['a', 'b'], action: BatchAction.UNASSIGN }, admin);
    expect(workOrders.transition).toHaveBeenCalledWith('a', { targetStepId: 's-0' }, admin);
    expect(res.ok.map((o) => o.id)).toEqual(['a']);
    expect(res.failed).toEqual([{ id: 'b', referenceNumber: 'BT-1', error: 'Ce BT ne peut pas être désassigné depuis son statut actuel.' }]);
  });

  it('CANCEL transitions to the process cancelled status with the reason', async () => {
    const { svc, workOrders, prisma } = build();
    await svc.run({ ids: ['a'], action: BatchAction.CANCEL, reason: '  Client absent ' }, admin);
    expect(prisma.processStatus.findFirst).toHaveBeenCalledWith({ where: { processDefinitionId: 'proc', isCancelled: true }, select: { id: true } });
    expect(workOrders.transition).toHaveBeenCalledWith('a', { targetStepId: 's-700', negativeReason: 'Client absent' }, admin);
  });

  it('SCHEDULE updates the planning fields only', async () => {
    const { svc, workOrders } = build();
    await svc.run({ ids: ['a'], action: BatchAction.SCHEDULE, scheduledDate: '2026-10-01T00:00:00.000Z' }, admin);
    expect(workOrders.update).toHaveBeenCalledWith('a', { scheduledDate: '2026-10-01T00:00:00.000Z' }, admin);
  });

  it('rejects a call missing the parameter its action needs', async () => {
    const { svc } = build();
    await expect(svc.run({ ids: ['a'], action: BatchAction.CANCEL }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.run({ ids: ['a'], action: BatchAction.ASSIGN }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.run({ ids: ['a'], action: BatchAction.SCHEDULE }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps going after a failure and surfaces the HTTP error message', async () => {
    const { svc } = build({
      transition: jest
        .fn()
        .mockRejectedValueOnce(new BadRequestException('Transition non configurée'))
        .mockResolvedValueOnce({ referenceNumber: 'REF-b' }),
    });
    const res = await svc.run({ ids: ['a', 'b'], action: BatchAction.CANCEL, reason: 'x' }, admin);
    expect(res.failed).toEqual([{ id: 'a', referenceNumber: 'BT-1', error: 'Transition non configurée' }]);
    expect(res.ok).toEqual([{ id: 'b', referenceNumber: 'REF-b' }]);
  });
});
