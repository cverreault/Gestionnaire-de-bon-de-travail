import { Role, type Prisma } from '@prisma/client';

/**
 * Canonical « Standard BT » process every tenant starts with.
 *
 * Shared by the platform-wide seed (process module) and the per-tenant
 * bootstrap (tenants module) so both create the same 8 statuses and
 * 12 transitions — a process without transitions is unusable (technicians
 * cannot move a work order at all). Codes mirror the legacy WorkOrderStatus
 * enum; ProcessEngineService derives WorkOrderStatus from the flags/codes.
 */
export const DEFAULT_PROCESS_NAME = 'Standard BT';

export interface DefaultProcessStatusDef {
  code: number;
  name: string;
  color: string;
  position: number;
  isInitial?: boolean;
  isDispatch?: boolean;
  isStart?: boolean;
  isTerminalPositive?: boolean;
  isTerminalNegative?: boolean;
  isRequested?: boolean;
  /** B54 — « Annulé » : fermé sans travail, exclu des statistiques. */
  isCancelled?: boolean;
}

export interface DefaultProcessTransitionDef {
  fromCode: number;
  toCode: number;
  label: string;
  roles: Role[];
  required: string[];
  sort: number;
}

export const DEFAULT_PROCESS_STATUSES: readonly DefaultProcessStatusDef[] = [
  // B21 — client-portal work requests park here until an admin approves.
  { code: 50,  name: 'Demandé',            color: '#eab308', position: -1, isRequested: true },
  { code: 0,   name: 'Créé',               color: '#6b7280', position: 0, isInitial: true },
  { code: 100, name: 'Assigné',            color: '#3b82f6', position: 1 },
  { code: 200, name: 'Dispatché',          color: '#8b5cf6', position: 2, isDispatch: true },
  { code: 300, name: 'En route',           color: '#f59e0b', position: 3 },
  { code: 400, name: 'En cours',           color: '#f97316', position: 4, isStart: true },
  { code: 500, name: 'Complété (positif)', color: '#22c55e', position: 5, isTerminalPositive: true },
  { code: 600, name: 'Complété (négatif)', color: '#ef4444', position: 6, isTerminalNegative: true },
  { code: 700, name: 'Annulé',             color: '#9ca3af', position: 7, isCancelled: true },
];

export const DEFAULT_PROCESS_TRANSITIONS: readonly DefaultProcessTransitionDef[] = [
  { fromCode: 50,  toCode: 0,   label: 'Approuver la demande', roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 0 },
  { fromCode: 50,  toCode: 600, label: 'Rejeter la demande',   roles: [Role.ADMIN, Role.DISPATCHER], required: ['negativeReason'], sort: 1 },
  { fromCode: 0,   toCode: 100, label: 'Assigner',             roles: [Role.ADMIN, Role.DISPATCHER], required: ['assignedToId'], sort: 0 },
  { fromCode: 100, toCode: 200, label: 'Dispatcher',           roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 0 },
  { fromCode: 200, toCode: 300, label: 'Partir en route',      roles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], required: [], sort: 0 },
  { fromCode: 300, toCode: 400, label: 'Commencer le travail', roles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], required: [], sort: 0 },
  { fromCode: 400, toCode: 500, label: 'Terminer (succès)',    roles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], required: ['completionNotes'], sort: 0 },
  { fromCode: 400, toCode: 600, label: 'Terminer (échec)',     roles: [Role.ADMIN, Role.DISPATCHER, Role.TECHNICIAN], required: ['negativeReason'], sort: 1 },
  { fromCode: 100, toCode: 0,   label: 'Désassigner',          roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 1 },
  { fromCode: 200, toCode: 100, label: 'Annuler dispatch',     roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 1 },
  { fromCode: 500, toCode: 0,   label: 'Réouvrir',             roles: [Role.ADMIN], required: ['reopenReason'], sort: 0 },
  { fromCode: 600, toCode: 0,   label: 'Réouvrir',             roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 0 },
  // B54 — cancel from any open step (reason required), reopen from cancelled.
  { fromCode: 0,   toCode: 700, label: 'Annuler',              roles: [Role.ADMIN, Role.DISPATCHER], required: ['negativeReason'], sort: 9 },
  { fromCode: 100, toCode: 700, label: 'Annuler',              roles: [Role.ADMIN, Role.DISPATCHER], required: ['negativeReason'], sort: 9 },
  { fromCode: 200, toCode: 700, label: 'Annuler',              roles: [Role.ADMIN, Role.DISPATCHER], required: ['negativeReason'], sort: 9 },
  { fromCode: 300, toCode: 700, label: 'Annuler',              roles: [Role.ADMIN, Role.DISPATCHER], required: ['negativeReason'], sort: 9 },
  { fromCode: 400, toCode: 700, label: 'Annuler',              roles: [Role.ADMIN, Role.DISPATCHER], required: ['negativeReason'], sort: 9 },
  { fromCode: 700, toCode: 0,   label: 'Réouvrir',             roles: [Role.ADMIN, Role.DISPATCHER], required: [], sort: 0 },
];

export function toStatusCreateData(def: DefaultProcessStatusDef) {
  return {
    code: def.code,
    name: def.name,
    color: def.color,
    position: def.position,
    isInitial: def.isInitial ?? false,
    isDispatch: def.isDispatch ?? false,
    isStart: def.isStart ?? false,
    isTerminalPositive: def.isTerminalPositive ?? false,
    isTerminalNegative: def.isTerminalNegative ?? false,
    isRequested: def.isRequested ?? false,
    isCancelled: def.isCancelled ?? false,
  };
}

export function toTransitionCreateData(def: DefaultProcessTransitionDef) {
  return {
    label: def.label,
    labelFr: def.label,
    labelEn: def.label,
    allowedRoles: def.roles,
    requiredFields: def.required,
    sortOrder: def.sort,
  };
}

/**
 * Creates the canonical process (definition + statuses + transitions) inside
 * the caller's transaction. `tenantId` is omitted for the platform default
 * tenant (column default applies).
 */
export async function createDefaultProcess(
  tx: Prisma.TransactionClient,
  opts: { tenantId?: string; description?: string } = {},
): Promise<{ processId: string; statusIdsByCode: Map<number, string> }> {
  const tenantScope = opts.tenantId ? { tenantId: opts.tenantId } : {};
  const process = await tx.processDefinition.create({
    data: {
      ...tenantScope,
      name: DEFAULT_PROCESS_NAME,
      description: opts.description ?? 'Processus de bon de travail standard (7 étapes)',
      version: 1,
      isDefault: true,
      isActive: true,
    },
  });

  const statusIdsByCode = new Map<number, string>();
  for (const def of DEFAULT_PROCESS_STATUSES) {
    const status = await tx.processStatus.create({
      data: { ...tenantScope, processDefinitionId: process.id, ...toStatusCreateData(def) },
    });
    statusIdsByCode.set(def.code, status.id);
  }

  for (const def of DEFAULT_PROCESS_TRANSITIONS) {
    await tx.processTransition.create({
      data: {
        ...tenantScope,
        processDefinitionId: process.id,
        fromStatusId: statusIdsByCode.get(def.fromCode)!,
        toStatusId: statusIdsByCode.get(def.toCode)!,
        ...toTransitionCreateData(def),
      },
    });
  }

  return { processId: process.id, statusIdsByCode };
}
