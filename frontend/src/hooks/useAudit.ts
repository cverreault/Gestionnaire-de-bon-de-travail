import { useQuery } from '@tanstack/react-query';
import { getAuditForAggregate, type AuditLogEntry } from '../services/audit.service';

export const AUDIT_KEY = 'audit';

/**
 * Timeline d'audit d'un agrégat (typiquement un work-order).
 * Disponible aux ADMIN et DISPATCHER côté backend ; les TECHNICIAN
 * reçoivent un 403 — on désactive simplement la query pour eux côté UI.
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
