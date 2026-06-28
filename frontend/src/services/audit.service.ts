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

/**
 * Exporte la slice filtrée de l'audit en CSV (ADMIN). Stream le blob et
 * déclenche le téléchargement navigateur. Reprend les mêmes filtres que
 * getAuditList mais ignore la pagination (cap 5000 lignes côté backend).
 */
export async function exportAuditCsv(params: AuditListParams = {}): Promise<{ filename: string; size: number }> {
  const exportParams = { ...params };
  delete (exportParams as { page?: number }).page;
  delete (exportParams as { limit?: number }).limit;

  const response = await api.get('/audit/export.csv', {
    params: exportParams,
    responseType: 'blob',
  });

  const cd = response.headers['content-disposition'] as string | undefined;
  const fallback = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
  const match = cd ? /filename="?([^"]+)"?/i.exec(cd) : null;
  const filename = match?.[1] ?? fallback;

  const blob = response.data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { filename, size: blob.size };
}
