import api from './api';

/**
 * Service frontend pour le module Audit côté backend.
 * Endpoints réservés ADMIN + DISPATCHER (le tech n'a pas accès).
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
