import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkOrderAudit } from '../hooks/useAudit';
import type { AuditLogEntry } from '../services/audit.service';
import { formatDateTime } from '../utils/dateFormat';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';
import { theme } from '../theme';

interface Props {
  workOrderId: string;
  /** false pour les TECHNICIAN — affiche un placeholder muet. */
  enabled: boolean;
}

/**
 * Timeline d'audit d'un BT — visible aux ADMIN et DISPATCHER seulement.
 *
 * Lecture seule, affiche les events les plus récents en premier.
 * Replié par défaut pour ne pas alourdir le détail BT.
 */
export default function WorkOrderAuditTimeline({ workOrderId, enabled }: Props) {
  const { t } = useTranslation('workOrders');
  const { t: tCommon } = useTranslation('common');
  const [expanded, setExpanded] = useState(false);
  const role = useAuthStore((s) => s.user?.role);
  const canDrillDown = role === Role.ADMIN;

  const { data, isLoading, isError } = useWorkOrderAudit(workOrderId, enabled);

  if (!enabled) return null;

  const count = data?.length ?? 0;

  return (
    <section style={{
      background: theme.colors.surface,
      border: theme.borders.default,
      borderRadius: theme.radius.lg,
      padding: '1.25rem',
      marginBottom: '1.5rem',
    }}>
      <header
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <h2 style={{ margin: 0, fontSize: theme.font.sizeMd, color: theme.colors.text, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📜 {t('sections.history', { defaultValue: 'Historique' })}
          {!isLoading && !isError && (
            <span style={{
              fontSize: theme.font.sizeXs,
              color: theme.colors.textMuted,
              fontWeight: theme.font.weightNormal,
              background: theme.colors.surfaceAlt,
              padding: '0.15rem 0.5rem',
              borderRadius: theme.radius.full,
              border: theme.borders.light,
            }}>
              {count}
            </span>
          )}
        </h2>
        <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
          {expanded ? '▲' : '▼'}
        </span>
      </header>

      {expanded && (
        <div style={{ marginTop: '1rem' }}>
          {isLoading && (
            <p style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeSm, margin: 0 }}>
              {tCommon('labels.loading')}
            </p>
          )}
          {isError && (
            <p style={{ color: theme.colors.danger, fontSize: theme.font.sizeSm, margin: 0 }}>
              {tCommon('messages.genericError')}
            </p>
          )}
          {!isLoading && !isError && count === 0 && (
            <p style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeSm, margin: 0, fontStyle: 'italic' }}>
              {t('messages.noHistory', { defaultValue: "Aucun événement enregistré pour l'instant." })}
            </p>
          )}
          {!isLoading && !isError && count > 0 && (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(data ?? []).map((e) => (
                <TimelineRow key={e.id} entry={e} canDrillDown={canDrillDown} />
              ))}
            </ol>
          )}

          {/* Admin drill-down → page audit globale pré-filtrée sur ce BT. */}
          {canDrillDown && !isLoading && !isError && count > 0 && (
            <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
              <Link
                to={`/audit?aggregateId=${workOrderId}`}
                style={{
                  fontSize: theme.font.sizeXs,
                  color: theme.colors.primary,
                  textDecoration: 'none',
                }}
              >
                🔍 {t('audit.seeFull', { defaultValue: 'Voir dans l\'audit complet →' })}
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Single row ─────────────────────────────────────────────────────────────

function TimelineRow({ entry, canDrillDown }: { entry: AuditLogEntry; canDrillDown: boolean }) {
  const { t } = useTranslation('workOrders');
  const meta = describeEvent(entry, t);

  const actorName = entry.actor
    ? `${entry.actor.firstName} ${entry.actor.lastName}`
    : t('audit.systemActor', { defaultValue: 'Système' });

  // ADMIN can drill down on the actor: link to /audit?actorUserId=<id>
  // surfaces every action that user has taken across all aggregates.
  // System events have no actor — render plain text.
  const actorNode = canDrillDown && entry.actor ? (
    <Link
      to={`/audit?actorUserId=${entry.actor.id}`}
      title={`Voir toutes les actions de ${actorName} dans l'audit`}
      style={{ color: theme.colors.primary, textDecoration: 'none' }}
    >
      {actorName}
    </Link>
  ) : actorName;

  return (
    <li style={{
      display: 'flex',
      gap: '0.75rem',
      padding: '0.625rem 0.75rem',
      background: theme.colors.surfaceAlt,
      border: theme.borders.light,
      borderRadius: theme.radius.md,
      borderLeft: `3px solid ${meta.color}`,
    }}>
      <span style={{ fontSize: '1.1rem', lineHeight: 1.4 }}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: theme.font.sizeSm, fontWeight: theme.font.weightMedium, color: theme.colors.text }}>
          {meta.label}
        </p>
        <p style={{ margin: '0.125rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
          {actorNode} · {formatDateTime(entry.occurredAt)}
        </p>
      </div>
    </li>
  );
}

// ── Event name → presentation metadata ────────────────────────────────────

type TFunc = (key: string, opts?: Record<string, unknown>) => string;

function describeEvent(
  entry: AuditLogEntry,
  t: TFunc,
): { icon: string; label: string; color: string } {
  switch (entry.eventName) {
    case 'workOrders.workOrder.created':
      return {
        icon: '✨',
        label: t('audit.events.created', { defaultValue: 'Bon de travail créé' }),
        color: theme.colors.info,
      };
    case 'workOrders.workOrder.assigned': {
      return {
        icon: '👤',
        label: t('audit.events.assigned', { defaultValue: 'Assigné à un technicien' }),
        color: theme.colors.warning,
      };
    }
    case 'workOrders.workOrder.dispatched':
      return {
        icon: '🚚',
        label: t('audit.events.dispatched', { defaultValue: 'Réparti' }),
        color: '#8b5cf6',
      };
    case 'workOrders.workOrder.statusChanged':
      return {
        icon: '🔁',
        label: t('audit.events.statusChanged', { defaultValue: 'Changement de statut' }),
        color: theme.colors.textMuted,
      };
    case 'workOrders.workOrder.completed': {
      const outcome = (entry.data as { outcome?: string } | null)?.outcome;
      return outcome === 'positive'
        ? {
            icon: '✅',
            label: t('audit.events.completedPositive', { defaultValue: 'Terminé (positif)' }),
            color: theme.colors.success,
          }
        : {
            icon: '❌',
            label: t('audit.events.completedNegative', { defaultValue: 'Terminé (négatif)' }),
            color: theme.colors.danger,
          };
    }
    default:
      return {
        icon: '•',
        label: entry.eventName,
        color: theme.colors.textMuted,
      };
  }
}
