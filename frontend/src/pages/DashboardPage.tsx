import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { currentDateFnsLocale } from '../utils/dateFormat';
import { useAuthStore } from '../context/auth.store';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import WorkOrderStatusBadge from '../components/WorkOrderStatusBadge';
import AuditActivityChart from '../components/AuditActivityChart';
import TechnicianLocationsMap from '../components/TechnicianLocationsMap';
import OnboardingWizard from '../components/OnboardingWizard';
import type { ApiResponse, AdminStats, TechnicianStats, WorkOrder } from '../types';
import { Role, WorkOrderStatus } from '../types';
import { theme, tableStyles, cardStyles, layoutStyles, getRowStyle } from '../theme';

// ─── Status meta ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  [WorkOrderStatus.CREATED]: { label: 'Créés', color: '#3b82f6', icon: '📝' },
  [WorkOrderStatus.ASSIGNED]: { label: 'Assignés', color: '#f59e0b', icon: '👤' },
  [WorkOrderStatus.DISPATCHED]: { label: 'Répartis', color: '#6366f1', icon: '📡' },
  [WorkOrderStatus.IN_PROGRESS]: { label: 'En cours', color: '#f97316', icon: '⚙️' },
  [WorkOrderStatus.COMPLETED_POSITIVE]: { label: 'Fin positive', color: '#10b981', icon: '✅' },
  [WorkOrderStatus.COMPLETED_NEGATIVE]: { label: 'Fin négative', color: '#ef4444', icon: '❌' },
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  count: number;
  color: string;
  icon: string;
}

function StatCard({ label, count, color, icon }: StatCardProps) {
  return (
    <div
      style={{
        ...cardStyles.card,
        padding: '1.25rem 1.5rem',
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeXs, margin: 0, fontWeight: theme.font.weightMedium }}>
            {label}
          </p>
          <p style={{ fontSize: '2rem', fontWeight: theme.font.weightBold, color: theme.colors.text, margin: '0.25rem 0 0' }}>
            {count}
          </p>
        </div>
        <span style={{ fontSize: '1.75rem', opacity: 0.8 }}>{icon}</span>
      </div>
    </div>
  );
}

// ─── Recent Work Order table row ──────────────────────────────────────────────

function RecentWORow({ wo, index, isHovered, onEnter, onLeave }: {
  wo: WorkOrder;
  index: number;
  isHovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <tr
      style={getRowStyle(index, isHovered)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <td style={{ ...tableStyles.cell }}>
        <Link
          to={`/bons-de-travail/${wo.id}`}
          style={{ color: theme.colors.primary, fontWeight: theme.font.weightMedium, textDecoration: 'none', fontSize: theme.font.sizeSm }}
        >
          {wo.referenceNumber}
        </Link>
      </td>
      <td
        style={{
          ...tableStyles.cell,
          maxWidth: '220px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {wo.title}
      </td>
      <td style={{ ...tableStyles.cell }}>
        <WorkOrderStatusBadge status={wo.status} size="sm" />
      </td>
      <td style={{ ...tableStyles.cellMuted }}>
        {wo.assignedTo ? `${wo.assignedTo.firstName} ${wo.assignedTo.lastName}` : '—'}
      </td>
      <td style={{ ...tableStyles.cellMuted }}>
        {wo.scheduledDate
          ? format(new Date(wo.scheduledDate), 'd MMM', { locale: currentDateFnsLocale() })
          : '—'}
      </td>
    </tr>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard() {
  const { t: tNav } = useTranslation('nav');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuthStore();
  const isAdmin = user?.role === Role.ADMIN;
  const [hoveredTechRow, setHoveredTechRow] = useState<number | null>(null);
  const [hoveredRecentRow, setHoveredRecentRow] = useState<number | null>(null);

  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'admin-stats'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<AdminStats>>('/dashboard/stats');
      return data.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingSpinner fullPage />;

  if (isError || !stats) {
    return (
      <div
        style={{
          ...cardStyles.card,
          padding: '2rem',
          color: theme.colors.danger,
          textAlign: 'center',
        }}
      >
        {tCommon('messages.dashboardLoadError', { defaultValue: 'Erreur lors du chargement du tableau de bord. Veuillez rafraîchir la page.' })}
      </div>
    );
  }

  const statusCards = stats.workOrdersByStatus ?? [];
  const total = statusCards.reduce((acc, s) => acc + s.count, 0);

  return (
    <div style={{ ...layoutStyles.page }}>
      <h1 style={{ ...layoutStyles.pageTitle, marginBottom: '1.5rem' }}>{tNav('dashboard')}</h1>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <StatCard
          label={tCommon('labels.totalWorkOrders', { defaultValue: 'Total BTs' })}
          count={total}
          color={theme.colors.text}
          icon="📋"
        />
        <StatCard
          label={tCommon('date.today')}
          count={stats.workOrdersToday}
          color={theme.colors.info}
          icon="📅"
        />
        <StatCard
          label={tCommon('date.thisWeek')}
          count={stats.workOrdersThisWeek}
          color="#6366f1"
          icon="📆"
        />
        <StatCard
          label={tCommon('labels.overdue', { defaultValue: 'En retard' })}
          count={stats.overdueWorkOrders}
          color={theme.colors.danger}
          icon="⏰"
        />
        {(stats.pendingRequests ?? 0) > 0 && (
          <StatCard
            label={tCommon('labels.pendingRequests', { defaultValue: 'Demandes à approuver' })}
            count={stats.pendingRequests ?? 0}
            color="#b45309"
            icon="📥"
          />
        )}
      </div>

      {/* ── BTs par statut ────────────────────────────────────────────────── */}
      {statusCards.length > 0 && (
        <>
          <h2
            style={{
              fontSize: theme.font.sizeXs,
              color: theme.colors.textMuted,
              fontWeight: theme.font.weightSemibold,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 0.75rem',
            }}
          >
            {tCommon('labels.byStatus', { defaultValue: 'Par statut' })}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
              gap: '0.75rem',
              marginBottom: '2rem',
            }}
          >
            {statusCards.map((s) => {
              const meta = STATUS_META[s.status] ?? {
                label: s.status,
                color: theme.colors.textMuted,
                icon: '•',
              };
              return (
                <StatCard
                  key={s.status}
                  label={meta.label}
                  count={s.count}
                  color={meta.color}
                  icon={meta.icon}
                />
              );
            })}
          </div>
        </>
      )}

      {/* ── Techniciens ───────────────────────────────────────────────────── */}
      {stats.technicianStats && stats.technicianStats.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2
            style={{
              fontSize: theme.font.sizeXs,
              color: theme.colors.textMuted,
              fontWeight: theme.font.weightSemibold,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 0.75rem',
            }}
          >
            {tCommon('labels.technicians', { defaultValue: 'Techniciens' })}
          </h2>
          <div style={{ ...tableStyles.container }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ ...tableStyles.header }}>
                <tr>
                  {['Technicien', 'BTs actifs', "Complétés aujourd'hui"].map((h) => (
                    <th
                      key={h}
                      style={{ ...tableStyles.headerCell, textAlign: 'left' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.technicianStats.map((tech, index) => (
                  <tr
                    key={tech.id}
                    style={getRowStyle(index, hoveredTechRow === index)}
                    onMouseEnter={() => setHoveredTechRow(index)}
                    onMouseLeave={() => setHoveredTechRow(null)}
                  >
                    <td style={{ ...tableStyles.cell, fontWeight: theme.font.weightMedium }}>
                      {tech.name}
                    </td>
                    <td style={{ ...tableStyles.cell }}>
                      <span
                        style={{
                          background: tech.activeWorkOrders > 0 ? theme.colors.infoLight : theme.colors.surfaceAlt,
                          color: tech.activeWorkOrders > 0 ? theme.colors.primary : theme.colors.textLight,
                          padding: '0.2rem 0.6rem',
                          borderRadius: theme.radius.full,
                          fontSize: theme.font.sizeXs,
                          fontWeight: theme.font.weightSemibold,
                        }}
                      >
                        {tech.activeWorkOrders}
                      </span>
                    </td>
                    <td style={{ ...tableStyles.cell }}>
                      <span
                        style={{
                          background: tech.completedToday > 0 ? theme.colors.successLight : theme.colors.surfaceAlt,
                          color: tech.completedToday > 0 ? '#065f46' : theme.colors.textLight,
                          padding: '0.2rem 0.6rem',
                          borderRadius: theme.radius.full,
                          fontSize: theme.font.sizeXs,
                          fontWeight: theme.font.weightSemibold,
                        }}
                      >
                        {tech.completedToday}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── BTs récents ───────────────────────────────────────────────────── */}
      {stats.recentWorkOrders && stats.recentWorkOrders.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <h2
              style={{
                fontSize: theme.font.sizeXs,
                color: theme.colors.textMuted,
                fontWeight: theme.font.weightSemibold,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              BTs récents
            </h2>
            <Link
              to="/bons-de-travail"
              style={{ fontSize: theme.font.sizeXs, color: theme.colors.info, textDecoration: 'none' }}
            >
              Voir tous →
            </Link>
          </div>
          <div style={{ ...tableStyles.container }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ ...tableStyles.header }}>
                <tr>
                  {['Référence', 'Titre', 'Statut', 'Technicien', 'Date'].map((h) => (
                    <th
                      key={h}
                      style={{ ...tableStyles.headerCell, textAlign: 'left' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recentWorkOrders.slice(0, 10).map((wo, index) => (
                  <RecentWORow
                    key={wo.id}
                    wo={wo}
                    index={index}
                    isHovered={hoveredRecentRow === index}
                    onEnter={() => setHoveredRecentRow(index)}
                    onLeave={() => setHoveredRecentRow(null)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Live technician positions (B5) ───────────────────────────────── */}
      <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${theme.colors.border}` }}>
          <h3 style={{ margin: 0, fontSize: 14, color: theme.colors.text }}>
            📍 Techniciens sur le terrain
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: theme.colors.textMuted }}>
            Rafraîchi toutes les 15&nbsp;s. Seuls les techniciens qui ont activé le suivi GPS sont affichés.
          </p>
        </div>
        <TechnicianLocationsMap />
      </div>

      {/* ── Audit activity (ADMIN only) ──────────────────────────────────── */}
      {isAdmin && <AuditActivityChart days={30} />}
    </div>
  );
}

// ─── Technician Dashboard ─────────────────────────────────────────────────────

function TechnicianDashboard() {
  const { t: tCommon } = useTranslation('common');
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'technician-stats'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<TechnicianStats>>('/dashboard/technician-stats');
      return data.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingSpinner fullPage />;

  if (isError || !stats) {
    return (
      <div
        style={{
          ...cardStyles.card,
          padding: '2rem',
          color: theme.colors.danger,
          textAlign: 'center',
        }}
      >
        {tCommon('messages.dashboardLoadError', { defaultValue: 'Erreur lors du chargement du tableau de bord. Veuillez rafraîchir la page.' })}
      </div>
    );
  }

  return (
    <div style={{ ...layoutStyles.page }}>
      <h1 style={{ ...layoutStyles.pageTitle, marginBottom: '1.5rem' }}>{tCommon('labels.myDashboard', { defaultValue: 'Mon tableau de bord' })}</h1>

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <StatCard
          label="Mes BTs actifs"
          count={stats.myActiveWorkOrders}
          color={theme.colors.info}
          icon="⚙️"
        />
        <StatCard
          label="Complétés aujourd'hui"
          count={stats.myCompletedToday}
          color={theme.colors.success}
          icon="✅"
        />
        <StatCard
          label={tCommon('date.thisWeek')}
          count={stats.myCompletedThisWeek}
          color="#6366f1"
          icon="📆"
        />
        <StatCard
          label={tCommon('labels.overdue', { defaultValue: 'En retard' })}
          count={stats.myOverdue}
          color={theme.colors.danger}
          icon="⏰"
        />
      </div>

      {/* ── Prochains BTs ─────────────────────────────────────────────────── */}
      <h2
        style={{
          fontSize: theme.font.sizeXs,
          color: theme.colors.textMuted,
          fontWeight: theme.font.weightSemibold,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: '0 0 0.75rem',
        }}
      >
        Prochains BTs
      </h2>

      {stats.myUpcoming && stats.myUpcoming.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {stats.myUpcoming.map((wo) => (
            <Link key={wo.id} to={`/mes-bons/${wo.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  ...cardStyles.card,
                  padding: '1rem 1.25rem',
                  borderLeft: `4px solid ${theme.colors.info}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'box-shadow 0.15s',
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: theme.font.weightSemibold,
                      color: theme.colors.text,
                      fontSize: '0.9rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {wo.title}
                  </p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textSecondary }}>
                    {wo.referenceNumber}
                    {wo.scheduledDate &&
                      ` · ${format(new Date(wo.scheduledDate), 'EEEE d MMM', { locale: currentDateFnsLocale() })}`}
                    {wo.scheduledStartTime && ` à ${wo.scheduledStartTime.slice(0, 5)}`}
                  </p>
                  {wo.clientAddress && (
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: theme.colors.textLight }}>
                      📍 {wo.clientAddress}
                    </p>
                  )}
                </div>
                <div style={{ flexShrink: 0, marginLeft: '0.75rem' }}>
                  <WorkOrderStatusBadge status={wo.status} size="sm" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div
          style={{
            ...cardStyles.card,
            padding: '2rem',
            textAlign: 'center',
            color: theme.colors.textLight,
          }}
        >
          {tCommon('messages.noUpcomingWorkOrder', { defaultValue: 'Aucun BT planifié à venir' })} 🎉
        </div>
      )}
    </div>
  );
}

// ─── Entry point — role-based routing ────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore();

  if (user?.role === Role.TECHNICIAN) {
    return <TechnicianDashboard />;
  }

  // Admin / Dispatcher path — the wizard renders itself as a modal only
  // when the tenant is empty AND the caller is an ADMIN. See the guard
  // inside OnboardingWizard for the exact conditions.
  return (
    <>
      <OnboardingWizard />
      <AdminDashboard />
    </>
  );
}
