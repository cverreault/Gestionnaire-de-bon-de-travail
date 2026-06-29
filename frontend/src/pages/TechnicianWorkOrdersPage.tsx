import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMyWorkOrders } from '../hooks/useWorkOrders';
import { useAddressTypes } from '../hooks/useSettings';
import WorkOrderStatusBadge from '../components/WorkOrderStatusBadge';
import SlaBadge from '../components/SlaBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import { WorkOrderStatus, WorkOrderType, ClientType } from '../types';
import type { WorkOrder } from '../types';
import { useAuthStore } from '../context/auth.store';
import { theme, cardStyles } from '../theme';
import { offlineStore } from '../services/offline-store';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { formatStreet } from '../utils/addressFormat';
import { getPredominantDisplay } from '../utils/addressPredominant';

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<WorkOrderType, string> = {
  [WorkOrderType.INSTALLATION]: '🔌',
  [WorkOrderType.REPAIR]: '🔧',
  [WorkOrderType.MAINTENANCE]: '⚙️',
  [WorkOrderType.INSPECTION]: '🔍',
  [WorkOrderType.OTHER]: '📋',
};

const ACTIVE_STATUSES = [
  WorkOrderStatus.DISPATCHED,
  WorkOrderStatus.EN_ROUTE,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.ASSIGNED,
];

const CLIENT_TYPE_COLORS: Record<ClientType, { bg: string; color: string }> = {
  [ClientType.RESIDENTIAL]: { bg: '#dbeafe', color: '#1e40af' },
  [ClientType.COMMERCIAL]: { bg: '#ede9fe', color: '#6d28d9' },
  [ClientType.INDUSTRIAL]: { bg: '#ffedd5', color: '#c2410c' },
  [ClientType.INSTITUTIONAL]: { bg: '#dcfce7', color: '#15803d' },
};

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  [ClientType.RESIDENTIAL]: 'Résidentiel',
  [ClientType.COMMERCIAL]: 'Commercial',
  [ClientType.INDUSTRIAL]: 'Industriel',
  [ClientType.INSTITUTIONAL]: 'Institutionnel',
};

function getStatusAccentColor(status: WorkOrderStatus): string {
  switch (status) {
    case WorkOrderStatus.IN_PROGRESS:        return theme.colors.warning;
    case WorkOrderStatus.COMPLETED_POSITIVE: return theme.colors.success;
    case WorkOrderStatus.COMPLETED_NEGATIVE: return theme.colors.danger;
    case WorkOrderStatus.DISPATCHED:         return theme.colors.info;
    case WorkOrderStatus.EN_ROUTE:           return '#7c3aed';
    default:                                 return theme.colors.primary;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TechnicianWorkOrdersPage() {
  const { user } = useAuthStore();
  const isOnline = useOnlineStatus();
  const { t } = useTranslation('workOrders');

  const { data, isLoading, fetchStatus } = useMyWorkOrders({ limit: 50 });
  const { data: addressTypeConfigs = [] } = useAddressTypes(true);

  // ── Offline fallback ─────────────────────────────────────────────────────────
  const [offlineWOs, setOfflineWOs] = useState<WorkOrder[]>([]);
  const [offlineMode, setOfflineMode] = useState(false);

  useEffect(() => {
    if (!isOnline && !data) {
      // Query is paused — load from IndexedDB
      setOfflineMode(true);
      offlineStore.getCachedWorkOrders().then(setOfflineWOs).catch(console.error);
    } else {
      setOfflineMode(false);
      setOfflineWOs([]);
    }
  }, [isOnline, data]);

  const allWOs: WorkOrder[] = data?.data ?? offlineWOs;
  // Show spinner only when the query is actually in flight (not paused offline)
  const showLoading = isLoading && fetchStatus !== 'paused' && !offlineMode;

  // Technicians only see active work orders. Completed BTs disappear from the
  // list entirely (no "Terminés" tab, no "Masquer" toggle).
  const displayed = allWOs.filter((wo) => ACTIVE_STATUSES.includes(wo.status));

  return (
    <div style={{ background: theme.colors.background, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: theme.font.sizeXl, color: theme.colors.text, margin: 0, fontWeight: theme.font.weightBold }}>
          {t('hello', { name: user?.firstName ?? '', defaultValue: 'Bonjour {{name}} 👋' })}
        </h1>
        <p style={{ color: theme.colors.textMuted, margin: '0.25rem 0 0', fontSize: theme.font.sizeSm }}>
          {t('activeCount', { count: displayed.length, defaultValue: '{{count}} bon(s) de travail actif(s)' })}
        </p>
      </div>

      {/* Offline data indicator */}
      {offlineMode && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.875rem',
            marginBottom: '0.75rem',
            background: theme.colors.warningLight,
            border: `1px solid ${theme.colors.warning}`,
            borderRadius: theme.radius.md,
            fontSize: theme.font.sizeXs,
            color: '#92400e',
            fontWeight: theme.font.weightMedium,
          }}
        >
          📴 <span>Données hors-ligne — {allWOs.length} bon{allWOs.length !== 1 ? 's' : ''} en cache</span>
        </div>
      )}

      {/* List */}
      {showLoading ? (
        <LoadingSpinner />
      ) : displayed.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            color: theme.colors.textMuted,
            background: theme.colors.surface,
            borderRadius: theme.radius.lg,
            border: theme.borders.default,
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎉</div>
          <p style={{ margin: 0, fontSize: theme.font.sizeSm }}>{t('messages.noActive')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {displayed.map((wo) => {
            const clientType = wo.client?.clientType ?? null;
            const clientTypeColors = clientType ? CLIENT_TYPE_COLORS[clientType] : null;

            const addressLine = wo.clientAddress_rel
              ? `${formatStreet(wo.clientAddress_rel)}, ${wo.clientAddress_rel.city}`
              : wo.clientAddress
              ? wo.clientAddress
              : null;

            const predominant = getPredominantDisplay(wo.clientAddress_rel, addressTypeConfigs);

            return (
              <Link
                key={wo.id}
                to={`/mes-bons/${wo.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  style={{
                    ...cardStyles.card,
                    padding: '1rem',
                    borderLeft: `4px solid ${getStatusAccentColor(wo.status)}`,
                    transition: 'box-shadow 0.15s ease, transform 0.1s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = theme.shadows.md;
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = theme.shadows.sm;
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  }}
                >
                  {/* Top row: icon + title + status badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{TYPE_ICONS[wo.type]}</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeMd, color: theme.colors.text }}>
                          {wo.title}
                        </p>
                        <p style={{ margin: 0, fontSize: theme.font.sizeXs, fontFamily: 'monospace', color: theme.colors.textLight }}>
                          {wo.referenceNumber}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      <WorkOrderStatusBadge step={wo.currentStep} status={wo.status} size="sm" />
                      <SlaBadge wo={wo} compact />
                    </div>
                  </div>

                  {/* Client info */}
                  {(wo.client || wo.temporaryClient || wo.externalClientName) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.375rem 0 0' }}>
                      <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textSecondary }}>
                        👤{' '}
                        {wo.client
                          ? `${wo.client.firstName} ${wo.client.lastName}`
                          : wo.temporaryClient
                          ? `${wo.temporaryClient.firstName} ${wo.temporaryClient.lastName}`
                          : wo.externalClientName}
                      </span>
                      {clientType && clientTypeColors && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.1rem 0.45rem',
                            borderRadius: theme.radius.full,
                            fontSize: '0.65rem',
                            fontWeight: theme.font.weightSemibold,
                            background: clientTypeColors.bg,
                            color: clientTypeColors.color,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {CLIENT_TYPE_LABELS[clientType]}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Address (with predominant field shown big when configured) */}
                  {predominant && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: theme.font.sizeMd, fontWeight: theme.font.weightBold, color: theme.colors.text }}>
                      📍 {predominant.label}&nbsp;: {predominant.value}
                    </p>
                  )}
                  {addressLine && (
                    <p style={{
                      margin: predominant ? '0 0 0 1.4rem' : '0.25rem 0 0',
                      fontSize: theme.font.sizeXs,
                      color: theme.colors.textSecondary,
                    }}>
                      {!predominant && '📍 '}{addressLine}
                    </p>
                  )}

                  {/* Date */}
                  {wo.scheduledDate && (
                    <p style={{ margin: '0.2rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textSecondary }}>
                      📅{' '}
                      {new Date(wo.scheduledDate).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                    </p>
                  )}

                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
