import { useQuery } from '@tanstack/react-query';
import {
  getAuditForAggregate,
  getAuditList,
  type AuditLogEntry,
  type AuditListParams,
  type AuditListResponse,
} from '../services/audit.service';

export const AUDIT_KEY = 'audit';

/**
 * Timeline d'audit d'un agrégat (typiquement un work-order).
 * ADMIN + DISPATCHER voient tous les BT ; le TECHNICIAN voit la timeline
 * uniquement des BT qui lui sont assignés (RBAC objet enforced côté
 * service, cf. A6).
 */
export function useWorkOrderAudit(workOrderId: string, enabled = true) {
  return useQuery({
    queryKey: [AUDIT_KEY, 'aggregate', workOrderId],
    queryFn: async () => {
      const res = await getAuditForAggregate(workOrderId);
      return (res.data?.data ?? res.data) as AuditLogEntry[];
    },
    enabled: enabled && !!workOrderId,
    staleTime: 30_000,   // L'audit est append-only ; refresh modéré OK.
  });
}

/**
 * Liste paginée filtrable des entrées d'audit — ADMIN seulement.
 * Le 403 côté backend est laissé propager côté caller : la page admin
 * ne devrait jamais être atteignable par un non-admin de toute façon.
 */
export function useAuditList(params: AuditListParams, enabled = true) {
  return useQuery({
    queryKey: [AUDIT_KEY, 'list', params],
    queryFn: async () => {
      const res = await getAuditList(params);
      // TransformInterceptor wraps everything in { success, data, timestamp }.
      // The payload itself is { data: items, meta }, so unwrap one level.
      return (res.data?.data ?? res.data) as AuditListResponse;
    },
    enabled,
    staleTime: 15_000,
    // Keep previous data while paging so the table doesn't flash empty.
    placeholderData: (prev) => prev,
  });
}
