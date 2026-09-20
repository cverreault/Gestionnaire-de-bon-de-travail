/**
 * Wire format of GET /api/me/sync (ADR-016 §1). Mirrors the server's
 * projection in backend/src/modules/mobile ; kept UI-free.
 */
import type { ClientAddressRef, ClientRef, NoteRef, AttachmentRef, ProcessStepRef, WorkOrderStatus } from './api';

export const SYNC_PAGE_DEFAULT = 50;
export const SYNC_PAGE_MAX = 200;

export interface ProcessSnapshotStatus extends ProcessStepRef {
  position: number;
  isInitial: boolean;
  isDispatch: boolean;
  isStart: boolean;
  isTerminalPositive: boolean;
  isTerminalNegative: boolean;
  isRequested: boolean;
}

export interface ProcessSnapshotTransition {
  id: string;
  fromStatusId: string;
  toStatusId: string;
  label: string;
  labelFr?: string;
  labelEn?: string;
  allowedRoles: string[];
  requiredFields: string[];
  sortOrder: number;
}

export interface ProcessSnapshot {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  statuses: ProcessSnapshotStatus[];
  transitions: ProcessSnapshotTransition[];
}

export interface SyncWorkOrderPart {
  id: string;
  partId: string;
  quantity: number;
  source: 'WAREHOUSE' | 'TECHNICIAN_STOCK';
  sku: string;
  name: string;
  nameFr: string;
  nameEn: string;
  unit: string;
}

/** Full body of a work order as the app stores it locally (B38.4). */
export interface SyncWorkOrder {
  id: string;
  referenceNumber: string;
  status: WorkOrderStatus;
  type: string;
  title: string;
  description: string | null;
  priority: number;
  clientAddress: string | null;
  externalClientName: string | null;
  processDefinitionId: string | null;
  currentStepId: string | null;
  assignedToId: string | null;
  scheduledDate: string | null;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  completionNotes: string | null;
  negativeReason: string | null;
  hasSignatureClient: boolean;
  hasSignatureTechnician: boolean;
  signedAt: string | null;
  templateData: Record<string, unknown> | null;
  dispatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: ClientRef | null;
  principalClient: ClientRef | null;
  clientAddress_rel: ClientAddressRef | null;
  taskType: { id: string; name: string; nameFr: string; nameEn: string; icon: string | null; color: string | null; templateId: string | null } | null;
  currentStep: ProcessStepRef | null;
  notes: NoteRef[];
  attachments: AttachmentRef[];
  parts: SyncWorkOrderPart[];
  /** B44 — tags posés sur le BT (nom + couleur), triés par nom. Absent des lignes locales synchronisées avant B44. */
  tags?: SyncTag[];
}

export type TemplateFieldType =
  | 'TEXT' | 'TEXTAREA' | 'EMAIL' | 'URL' | 'NUMBER' | 'INTEGER' | 'FLOAT' | 'CURRENCY' | 'PERCENTAGE'
  | 'CHECKBOX' | 'SELECT' | 'MULTISELECT' | 'RADIO' | 'DATE' | 'TIME' | 'DATETIME' | 'PHONE' | 'PHONE_NA' | 'POSTAL_CODE_CA' | 'GPS';

export interface SyncTemplateField {
  id: string;
  label: string;
  labelFr: string;
  labelEn: string;
  fieldType: TemplateFieldType;
  placeholder: string | null;
  helpText: string | null;
  options: unknown;
  sortOrder: number;
  viewRoles: string[];
  editRoles: string[];
  requiredRoles: string[];
}

export interface SyncTemplateSection {
  id: string;
  name: string;
  nameFr: string;
  nameEn: string;
  sortOrder: number;
  viewRoles: string[];
  editRoles: string[];
  fields: SyncTemplateField[];
}

/** B44 — a tag as carried by the sync payload. */
export interface SyncTag {
  id: string;
  name: string;
  color: string;
}

/** Form template of a task type (sections + fields) ; values live in `SyncWorkOrder.templateData`. */
export interface SyncTemplate {
  id: string;
  name: string;
  nameFr: string;
  nameEn: string;
  updatedAt: string;
  sections: SyncTemplateSection[];
}

export interface PartsStockRow {
  id: string;
  partId: string;
  quantity: number;
  updatedAt: string;
}

export interface PartsCatalogRow {
  id: string;
  sku: string;
  name: string;
  nameFr: string;
  nameEn: string;
  unit: string;
  isActive: boolean;
  updatedAt: string;
}

export interface SyncPullResponse {
  /** Opaque ; pass back as `?cursor=` on the next call. Null when nothing was ever pulled. */
  cursor: string | null;
  hasMore: boolean;
  /** True on the first pull, a tampered cursor or one older than 30 days : wipe local server tables first. */
  fullResync: boolean;
  serverTime: string;
  /** The whole visible set, every call : delete local rows not listed here. */
  visibleWorkOrderIds: string[];
  workOrders: SyncWorkOrder[];
  processSnapshots: Record<string, ProcessSnapshot>;
  /** Form templates referenced by the page, keyed by template id. */
  templates?: Record<string, SyncTemplate>;
  partsStock: PartsStockRow[];
  partsCatalog: PartsCatalogRow[];
}
