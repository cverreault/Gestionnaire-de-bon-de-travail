import api from './api';

/**
 * Service frontend pour le module Audit côté backend.
 * Liste globale paginée : ADMIN seulement.
 * Timeline d'un agrégat (workOrder) : ADMIN, DISPATCHER, ou TECHNICIAN
 * pour ses propres BT (RBAC objet enforced côté service, cf. A6).
 */

export interface AuditActor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN';
}

export interface AuditLogEntry {
  id: string;
  eventName: string;
  aggregateId: string;
  occurredAt: string;        // ISO 8601
  actorUserId: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  /** Actor info denormalisé (null si actorUserId est null ou user supprimé). */
  actor: AuditActor | null;
}

/** Timeline d'un agrégat (typiquement un workOrderId). 50 events récents. */
export const getAuditForAggregate = (aggregateId: string) =>
  api.get(`/audit/aggregate/${aggregateId}`);

// ── Admin list ───────────────────────────────────────────────────────────────

export interface AuditListParams {
  page?: number;
  limit?: number;
  eventName?: string;
  aggregateId?: string;
  actorUserId?: string;
  from?: string;   // ISO 8601
  to?: string;     // ISO 8601
}

export interface AuditListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuditListResponse {
  data: AuditLogEntry[];
  meta: AuditListMeta;
}

/** Liste paginée filtrable — ADMIN seulement. */
export const getAuditList = (params: AuditListParams = {}) =>
  api.get('/audit', { params });
