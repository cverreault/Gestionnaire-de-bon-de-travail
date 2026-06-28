import { useQuery } from '@tanstack/react-query';
import { getAuditForAggregate, type AuditLogEntry } from '../services/audit.service';

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
