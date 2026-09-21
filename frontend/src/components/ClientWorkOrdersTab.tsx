import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkOrders } from '../hooks/useWorkOrders';
import WorkOrderModal from './WorkOrderModal';
import WorkOrderStatusBadge from './WorkOrderStatusBadge';
import { formatDate } from '../utils/dateFormat';
import { theme, tableStyles, buttonStyles } from '../theme';

/** B50 — every work order of a client, newest first, opening in the usual popup. */
export default function ClientWorkOrdersTab({ clientId }: { clientId: string }) {
  const { t } = useTranslation('clients');
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useWorkOrders({ clientId, limit: 100 });
  const rows = [...(data?.data ?? [])].sort((a, b) => (b.scheduledDate ?? b.createdAt).localeCompare(a.scheduledDate ?? a.createdAt));

  if (isLoading) return <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>…</p>;
  if (rows.length === 0) return <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{t('history.empty', { defaultValue: 'Aucun bon de travail pour ce client.' })}</p>;

  return (
    <div>
      <p style={{ margin: '0 0 0.5rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
        {t('history.count', { defaultValue: '{{count}} bon(s) de travail, du plus récent au plus ancien. Cliquer une référence ouvre le BT.', count: rows.length })}
      </p>
      <div style={{ maxHeight: 420, overflow: 'auto', border: theme.borders.light, borderRadius: theme.radius.md }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 0, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '34%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead style={{ ...tableStyles.header }}>
            <tr>
              <th style={{ ...tableStyles.headerCell }}>{t('history.reference', { defaultValue: 'Référence' })}</th>
              <th style={{ ...tableStyles.headerCell }}>{t('history.title', { defaultValue: 'Titre' })}</th>
              <th style={{ ...tableStyles.headerCell }}>{t('history.status', { defaultValue: 'Statut' })}</th>
              <th style={{ ...tableStyles.headerCell }}>{t('history.date', { defaultValue: 'Date' })}</th>
              <th style={{ ...tableStyles.headerCell }}>{t('history.technician', { defaultValue: 'Technicien' })}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((wo) => (
              <tr key={wo.id}>
                <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => setOpenId(wo.id)} style={{ ...buttonStyles.ghost, padding: 0, fontFamily: 'monospace', fontWeight: theme.font.weightSemibold, color: theme.colors.primary, textDecoration: 'underline' }}>
                    {wo.referenceNumber}
                  </button>
                </td>
                <td style={{ ...tableStyles.cell, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={wo.title}>{wo.title}</td>
                <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}><WorkOrderStatusBadge status={wo.status} step={wo.currentStep ?? undefined} size="sm" /></td>
                <td style={{ ...tableStyles.cell, whiteSpace: 'nowrap' }}>{formatDate(wo.scheduledDate ?? wo.createdAt)}</td>
                <td style={{ ...tableStyles.cell, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.assignedTo ? `${wo.assignedTo.firstName} ${wo.assignedTo.lastName}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId && <WorkOrderModal workOrderId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
