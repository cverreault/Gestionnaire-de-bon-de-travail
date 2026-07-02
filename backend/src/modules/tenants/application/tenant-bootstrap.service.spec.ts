/**
 * QA — tenant-bootstrap.service.spec.ts (B7.6)
 *
 * Locks the "minimal blank slate" contract :
 *   1. A new tenant gets exactly :
 *      - 1 process definition (isDefault=true, isActive=true)
 *      - 4 process status nodes (Créé → Assigné → En progrès → Complété)
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
    processStatus: { create: jest.fn().mockResolvedValue({ id: 'st' }) },
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
  it('seeds exactly one default process with 4 status nodes', async () => {
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

    expect(tx.processStatus.create).toHaveBeenCalledTimes(4);
    const codes = tx.processStatus.create.mock.calls.map(
      (c: [{ data: { code: number } }]) => c[0].data.code,
    );
    expect(codes.sort((a: number, b: number) => a - b)).toEqual([
      0, 100, 200, 900,
    ]);
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
