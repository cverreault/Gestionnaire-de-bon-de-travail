import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPortalWorkOrder } from '../services/portal.service';
import { getCapabilities, downloadWorkOrderPdf } from '../services/reports.service';
import WorkOrderStatusBadge from '../components/WorkOrderStatusBadge';
import { theme, cardStyles, buttonStyles } from '../theme';
import { formatDate, formatDateTime } from '../utils/dateFormat';

/** B21 — sanitized client view of a single work order. */
export default function PortalWorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation('portal');
  const locale = i18n.language?.startsWith('en') ? 'en' : 'fr';

  const { data: wo, isLoading, error } = useQuery({
    queryKey: ['portal', 'work-orders', id],
    queryFn: () => getPortalWorkOrder(id!),
    enabled: !!id,
  });
  const { data: capabilities } = useQuery({
    queryKey: ['reports', 'capabilities'],
    queryFn: getCapabilities,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <p style={{ color: theme.colors.textMuted }}>{t('common.loading')}</p>;
  if (error != null || !wo) return <p style={{ color: theme.colors.danger }}>{t('common.loadError')}</p>;

  const isTerminal = wo.status === 'COMPLETED_POSITIVE' || wo.status === 'COMPLETED_NEGATIVE';
  const step = wo.currentStep
    ? {
        name: (locale === 'en' ? wo.currentStep.nameEn : wo.currentStep.nameFr) || wo.currentStep.name,
        color: wo.currentStep.color,
      }
    : null;

  const field = (label: string, value: React.ReactNode) => (
    <div>
      <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>{label}</p>
      <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.text }}>{value}</p>
    </div>
  );

  return (
    <div>
      <Link to="/portail" style={{ color: theme.colors.textMuted, textDecoration: 'none', fontSize: theme.font.sizeSm }}>
        ← {t('detail.back')}
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', margin: '0.5rem 0 1rem' }}>
        <h1 style={{ margin: 0, fontSize: theme.font.sizeXl, color: theme.colors.text }}>{wo.title}</h1>
        <WorkOrderStatusBadge step={step} status={wo.status} />
        {isTerminal && capabilities?.pdfAvailable && (
          <button
            onClick={() => downloadWorkOrderPdf(wo.id, locale)}
            style={{ ...buttonStyles.primary, ...buttonStyles.sm, marginLeft: 'auto' }}
          >
            📄 {t('detail.downloadReport')}
          </button>
        )}
      </div>

      <div style={{ ...cardStyles.card, padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {field(t('detail.reference'), <span style={{ fontFamily: 'monospace' }}>{wo.referenceNumber}</span>)}
          {field(
            t('detail.taskType'),
            wo.taskType ? (locale === 'en' ? wo.taskType.nameEn : wo.taskType.nameFr) || wo.taskType.name : '—',
          )}
          {field(t('detail.scheduledDate'), wo.scheduledDate ? formatDate(wo.scheduledDate) : t('list.toBeScheduled'))}
          {field(t('detail.createdAt'), formatDateTime(wo.createdAt))}
          {wo.clientAddress_rel &&
            field(
              t('detail.address'),
              `${wo.clientAddress_rel.street}, ${wo.clientAddress_rel.city}` +
                (wo.clientAddress_rel.postalCode ? ` ${wo.clientAddress_rel.postalCode}` : ''),
            )}
          {wo.assignedTo && field(t('detail.technician'), wo.assignedTo.firstName)}
        </div>
      </div>

      {wo.description && (
        <div style={{ ...cardStyles.card, padding: '1rem', marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 0.35rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('detail.description')}
          </p>
          <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.text, whiteSpace: 'pre-wrap' }}>{wo.description}</p>
        </div>
      )}

      {wo.completionNotes && (
        <div style={{ ...cardStyles.card, padding: '1rem', marginBottom: '1rem', borderLeft: `3px solid ${theme.colors.success}` }}>
          <p style={{ margin: '0 0 0.35rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('detail.completionNotes')}
          </p>
          <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.text, whiteSpace: 'pre-wrap' }}>{wo.completionNotes}</p>
        </div>
      )}

      {wo.negativeReason && (
        <div style={{ ...cardStyles.card, padding: '1rem', borderLeft: `3px solid ${theme.colors.danger}` }}>
          <p style={{ margin: '0 0 0.35rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('detail.negativeReason')}
          </p>
          <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.text, whiteSpace: 'pre-wrap' }}>{wo.negativeReason}</p>
        </div>
      )}
    </div>
  );
}
