/**
 * QA — tenant-bootstrap.service.spec.ts (B7.6)
 *
 * Locks the "minimal blank slate" contract :
 *   1. A new tenant gets exactly :
 *      - 1 process definition (isDefault=true, isActive=true)
 *      - the canonical « Standard BT » process : 8 statuses + 12 transitions
 *        (B43 — the previous 4-status seed had no transition at all)
 *      - 1 WO template + 1 "Notes" section
 *   2. The seed does NOT create task types, client types, or address types
 *      (the admin builds those on demand).
 *
 * Anchors the user's explicit request : "quand je crée un tenant je veux
 * que tout soit vide à l'exception d'un processus de base, un template de
 * base et l'utilisateur admin du compte".
 */

import { TenantBootstrapService } from './tenant-bootstrap.service';

function makeTx() {
  return {
    processDefinition: { create: jest.fn().mockResolvedValue({ id: 'proc-1' }) },
    processStatus: {
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: { code: number } }) =>
          Promise.resolve({ id: `st-${data.code}`, code: data.code }),
        ),
    },
    processTransition: { create: jest.fn().mockResolvedValue({ id: 'tr' }) },
    workOrderTemplate: {
      create: jest.fn().mockResolvedValue({ id: 'tpl-1' }),
    },
    templateSection: { create: jest.fn().mockResolvedValue({ id: 'sec-1' }) },
    // These three intentionally exist to catch regressions — if the
    // service ever creates one of them again the assertion below will
    // count the calls and fail the spec.
    taskType: { create: jest.fn() },
    clientTypeConfig: { create: jest.fn() },
    addressTypeConfig: { create: jest.fn() },
  };
}

describe('TenantBootstrapService — minimal seed (B7.6)', () => {
  it('seeds exactly one default process with the 9 canonical statuses and 18 transitions', async () => {
    const tx = makeTx();
    await new TenantBootstrapService().seed(
      tx as unknown as never,
      'tenant-x',
    );

    expect(tx.processDefinition.create).toHaveBeenCalledTimes(1);
    const procArgs = tx.processDefinition.create.mock.calls[0][0];
    expect(procArgs.data).toMatchObject({
      tenantId: 'tenant-x',
      isDefault: true,
      isActive: true,
    });

    expect(tx.processStatus.create).toHaveBeenCalledTimes(9);
    const codes = tx.processStatus.create.mock.calls.map(
      (c: [{ data: { code: number; tenantId: string } }]) => c[0].data.code,
    );
    expect(codes.sort((a: number, b: number) => a - b)).toEqual([
      0, 50, 100, 200, 300, 400, 500, 600, 700,
    ]);
    for (const call of tx.processStatus.create.mock.calls) {
      expect(call[0].data.tenantId).toBe('tenant-x');
    }

    // A process without transitions is unusable : the technician must be
    // able to go Dispatché → En route → En cours → Complété.
    expect(tx.processTransition.create).toHaveBeenCalledTimes(18);
    const pairs = tx.processTransition.create.mock.calls.map(
      (c: [{ data: { fromStatusId: string; toStatusId: string; tenantId: string; allowedRoles: string[] } }]) =>
        `${c[0].data.fromStatusId}→${c[0].data.toStatusId}`,
    );
    expect(pairs).toEqual(
      expect.arrayContaining(['st-200→st-300', 'st-300→st-400', 'st-400→st-500', 'st-400→st-600']),
    );
    const enRoute = tx.processTransition.create.mock.calls.find(
      (c: [{ data: { fromStatusId: string } }]) => c[0].data.fromStatusId === 'st-200',
    );
    expect(enRoute[0].data.allowedRoles).toContain('TECHNICIAN');
    expect(enRoute[0].data.tenantId).toBe('tenant-x');
  });

  it('seeds exactly one default WO template with a single "Notes" section', async () => {
    const tx = makeTx();
    await new TenantBootstrapService().seed(
      tx as unknown as never,
      'tenant-x',
    );

    expect(tx.workOrderTemplate.create).toHaveBeenCalledTimes(1);
    expect(tx.workOrderTemplate.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-x',
      isActive: true,
    });

    expect(tx.templateSection.create).toHaveBeenCalledTimes(1);
    expect(tx.templateSection.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-x',
      templateId: 'tpl-1',
      name: 'Notes',
    });
  });

  it('does NOT seed task types, client types, or address types', async () => {
    const tx = makeTx();
    await new TenantBootstrapService().seed(
      tx as unknown as never,
      'tenant-x',
    );

    expect(tx.taskType.create).not.toHaveBeenCalled();
    expect(tx.clientTypeConfig.create).not.toHaveBeenCalled();
    expect(tx.addressTypeConfig.create).not.toHaveBeenCalled();
  });
});
