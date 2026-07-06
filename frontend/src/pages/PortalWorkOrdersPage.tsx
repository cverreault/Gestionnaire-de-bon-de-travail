import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPortalWorkOrders, type PortalWorkOrder } from '../services/portal.service';
import { getCapabilities, downloadWorkOrderPdf } from '../services/reports.service';
import WorkOrderStatusBadge from '../components/WorkOrderStatusBadge';
import { theme, cardStyles, buttonStyles, tableStyles } from '../theme';
import { formatDate } from '../utils/dateFormat';

/**
 * B21 — portal home: every work order belonging to the logged-in
 * client, newest first. Completed ones expose the PDF report download.
 */

function stepLabel(wo: PortalWorkOrder, locale: string): { name: string; color: string } | null {
  if (!wo.currentStep) return null;
  const name =
    (locale === 'en' ? wo.currentStep.nameEn : wo.currentStep.nameFr) ||
    wo.currentStep.name;
  return { name, color: wo.currentStep.color };
}

export default function PortalWorkOrdersPage() {
  const { t, i18n } = useTranslation('portal');
  const locale = i18n.language?.startsWith('en') ? 'en' : 'fr';

  const { data: workOrders, isLoading, error } = useQuery({
    queryKey: ['portal', 'work-orders'],
    queryFn: getPortalWorkOrders,
  });
  const { data: capabilities } = useQuery({
    queryKey: ['reports', 'capabilities'],
    queryFn: getCapabilities,
    staleTime: 5 * 60 * 1000,
  });

  const isTerminal = (wo: PortalWorkOrder) =>
    wo.status === 'COMPLETED_POSITIVE' || wo.status === 'COMPLETED_NEGATIVE';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: theme.font.sizeXl, color: theme.colors.text }}>
          {t('list.title')}
        </h1>
        <Link to="/portail/demande" style={{ ...buttonStyles.primary, textDecoration: 'none' }}>
          ➕ {t('nav.newRequest')}
        </Link>
      </div>

      {isLoading && <p style={{ color: theme.colors.textMuted }}>{t('common.loading')}</p>}
      {error != null && (
        <p style={{ color: theme.colors.danger }}>{t('common.loadError')}</p>
      )}

      {workOrders && workOrders.length === 0 && (
        <div style={{ ...cardStyles.card, padding: '2rem', textAlign: 'center' }}>
          <p style={{ margin: 0, color: theme.colors.textMuted }}>{t('list.empty')}</p>
        </div>
      )}

      {workOrders && workOrders.length > 0 && (
        <div style={{ ...cardStyles.card, padding: 0, overflowX: 'auto' }}>
          <table style={{ ...tableStyles.table, minWidth: 640 }}>
            <thead>
              <tr>
                <th style={tableStyles.th}>{t('list.reference')}</th>
                <th style={tableStyles.th}>{t('list.workOrder')}</th>
                <th style={tableStyles.th}>{t('list.status')}</th>
                <th style={tableStyles.th}>{t('list.scheduledDate')}</th>
                <th style={tableStyles.th}></th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr key={wo.id} style={tableStyles.tr}>
                  <td style={{ ...tableStyles.td, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: theme.font.sizeSm }}>
                    {wo.referenceNumber}
                  </td>
                  <td style={tableStyles.td}>
                    <Link
                      to={`/portail/bons/${wo.id}`}
                      style={{ color: theme.colors.primary, textDecoration: 'none', fontWeight: theme.font.weightSemibold }}
                    >
                      {wo.title}
                    </Link>
                    {wo.taskType && (
                      <div style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                        {(locale === 'en' ? wo.taskType.nameEn : wo.taskType.nameFr) || wo.taskType.name}
                      </div>
                    )}
                  </td>
                  <td style={tableStyles.td}>
                    <WorkOrderStatusBadge step={stepLabel(wo, locale)} status={wo.status} size="sm" />
                  </td>
                  <td style={{ ...tableStyles.td, whiteSpace: 'nowrap' }}>
                    {wo.scheduledDate ? formatDate(wo.scheduledDate) : t('list.toBeScheduled')}
                  </td>
                  <td style={{ ...tableStyles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isTerminal(wo) && capabilities?.pdfAvailable && (
                      <button
                        onClick={() => downloadWorkOrderPdf(wo.id, locale)}
                        style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                      >
                        📄 {t('list.report')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
