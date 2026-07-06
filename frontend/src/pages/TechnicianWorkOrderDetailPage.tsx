import { useParams, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useWorkOrder,
  useAddNote,
  useUploadAttachment,
} from '../hooks/useWorkOrders';
import { useAddressTypes } from '../hooks/useSettings';
import { getPredominantDisplay } from '../utils/addressPredominant';
import { formatStreet } from '../utils/addressFormat';
import WorkOrderStatusBadge from '../components/WorkOrderStatusBadge';
import WorkOrderPartsSection from '../components/WorkOrderPartsSection';
import TransitionActionBar from '../components/transitions/TransitionActionBar';
import WorkOrderAuditTimeline from '../components/WorkOrderAuditTimeline';
import EnRouteTimer from '../components/EnRouteTimer';
import LoadingSpinner from '../components/LoadingSpinner';
import { WorkOrderStatus, ClientType, AddressType } from '../types';
import type { WorkOrder } from '../types';
import { theme, cardStyles, buttonStyles, formStyles } from '../theme';
import { offlineStore } from '../services/offline-store';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

// ─── Labels ───────────────────────────────────────────────────────────────────

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  [ClientType.RESIDENTIAL]: 'Résidentiel',
  [ClientType.COMMERCIAL]: 'Commercial',
  [ClientType.INDUSTRIAL]: 'Industriel',
  [ClientType.INSTITUTIONAL]: 'Institutionnel',
};

const CLIENT_TYPE_COLORS: Record<ClientType, { bg: string; color: string }> = {
  [ClientType.RESIDENTIAL]: { bg: '#dbeafe', color: '#1e40af' },
  [ClientType.COMMERCIAL]: { bg: '#ede9fe', color: '#6d28d9' },
  [ClientType.INDUSTRIAL]: { bg: '#ffedd5', color: '#c2410c' },
  [ClientType.INSTITUTIONAL]: { bg: '#dcfce7', color: '#15803d' },
};

const ADDRESS_TYPE_LABELS: Record<string, string> = {
  [AddressType.OFFICE]: 'Bureau',
  [AddressType.WAREHOUSE]: 'Entrepôt',
  [AddressType.RESIDENCE]: 'Résidence',
  [AddressType.WORKSITE]: 'Chantier',
};

// ─── Toast component ──────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onDone }: {
  message: string;
  type?: 'success' | 'error' | 'info';
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  const bgColor =
    type === 'error' ? '#991b1b' :
    type === 'info'  ? '#1e3a8a' :
    '#1e293b';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        background: bgColor,
        color: '#fff',
        padding: '0.875rem 1.5rem',
        borderRadius: theme.radius.lg,
        boxShadow: theme.shadows.xl,
        zIndex: theme.zIndex.toast,
        fontSize: theme.font.sizeSm,
        fontWeight: theme.font.weightMedium,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        maxWidth: '90vw',
        pointerEvents: 'none',
      }}
    >
      {message}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TechnicianWorkOrderDetailPage() {
  const { t } = useTranslation('workOrders');
  const { t: tCommon } = useTranslation('common');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { data: queryWO, isLoading, error, fetchStatus } = useWorkOrder(id!);
  const { data: addressTypeConfigs = [] } = useAddressTypes(true);
  const addNote = useAddNote(id!);
  const uploadAttachment = useUploadAttachment(id!);

  // ── Offline fallback ─────────────────────────────────────────────────────────
  const [offlineCachedWO, setOfflineCachedWO] = useState<WorkOrder | null>(null);
  const [offlineLoading, setOfflineLoading] = useState(false);

  useEffect(() => {
    if (!isOnline && !queryWO && id) {
      setOfflineLoading(true);
      offlineStore
        .getCachedWorkOrder(id)
        .then(setOfflineCachedWO)
        .catch(console.error)
        .finally(() => setOfflineLoading(false));
    } else {
      setOfflineCachedWO(null);
    }
  }, [isOnline, queryWO, id]);

  /** The work order to display — live data or offline cache. */
  const wo = queryWO ?? offlineCachedWO;
  /** True when showing cached data (no live data available). */
  const isOfflineFallback = !isOnline && !queryWO && !!offlineCachedWO;

  const [noteContent, setNoteContent] = useState('');

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'success') {
    setToast({ msg, type });
  }

  // Show spinner only while the query is actually in flight (not paused offline)
  const isActuallyLoading = (isLoading && fetchStatus !== 'paused') || offlineLoading;

  if (isActuallyLoading) return <LoadingSpinner fullPage />;
  if (error || !wo) return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <p style={{ color: theme.colors.danger }}>
        {!isOnline
          ? `📴 ${t('messages.offlineNotFound', { defaultValue: 'Bon de travail non disponible hors-ligne' })}`
          : t('messages.notFound', { defaultValue: 'Bon de travail introuvable' })}
      </p>
      <button onClick={() => navigate(-1)} style={{ ...buttonStyles.ghost, marginTop: '1rem', color: theme.colors.primary }}>
        ← {tCommon('actions.back')}
      </button>
    </div>
  );

  // ─── Status helpers ────────────────────────────────────────────────────────

  const isCompleted = [WorkOrderStatus.COMPLETED_POSITIVE, WorkOrderStatus.COMPLETED_NEGATIVE].includes(wo.status);

  // Technicians cannot consult a terminated work order — once it's done,
  // it disappears from their view (no list link, no deep-link access).
  if (isCompleted) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeMd }}>
          ✅ {t('messages.completed')}
        </p>
        <button onClick={() => navigate('/mes-bons')} style={{ ...buttonStyles.primary, marginTop: '1rem' }}>
          ← {t('myTitle')}
        </button>
      </div>
    );
  }
  const canEnRoute  = wo.status === WorkOrderStatus.DISPATCHED;
  const canStart    = wo.status === WorkOrderStatus.EN_ROUTE;
  const inProgress  = wo.status === WorkOrderStatus.IN_PROGRESS;
  // ASSIGNED: technician is assigned but dispatcher hasn't dispatched yet → no action available
  const isAssigned  = wo.status === WorkOrderStatus.ASSIGNED || wo.status === WorkOrderStatus.CREATED;
  const hasActionButton = canEnRoute || canStart || inProgress;

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    try {
      if (isOnline) {
        await addNote.mutateAsync(noteContent.trim());
      } else {
        await offlineStore.addToSyncQueue({
          id: crypto.randomUUID(),
          type: 'add_note',
          workOrderId: id!,
          payload: { content: noteContent.trim() },
          timestamp: Date.now(),
        });
      }
      setNoteContent('');
      showToast('✅ Note ajoutée', 'success');
    } catch {
      showToast('❌ Impossible d\'ajouter la note. Veuillez réessayer.', 'error');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isOnline) {
      showToast('📵 Impossible d\'envoyer un fichier hors-ligne. Reconnectez-vous.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    try {
      await uploadAttachment.mutateAsync(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast('✅ Photo envoyée avec succès', 'success');
    } catch {
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast('❌ Échec de l\'envoi du fichier. Veuillez réessayer.', 'error');
    }
  };

  // ─── Styles ────────────────────────────────────────────────────────────────

  const sectionStyle: React.CSSProperties = {
    ...cardStyles.card,
    padding: '1.25rem',
    marginBottom: '1rem',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: theme.font.sizeXs,
    fontWeight: theme.font.weightBold,
    color: theme.colors.textMuted,
    margin: '0 0 0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  // Client info (V3 or legacy)
  const clientName = wo.client
    ? `${wo.client.firstName} ${wo.client.lastName}`
    : wo.temporaryClient
    ? `${wo.temporaryClient.firstName} ${wo.temporaryClient.lastName}`
    : wo.externalClientName
    ? wo.externalClientName
    : null;

  const clientType = wo.client?.clientType ?? null;

  const addressLine = wo.clientAddress_rel
    ? `${formatStreet(wo.clientAddress_rel)}, ${wo.clientAddress_rel.city}${wo.clientAddress_rel.postalCode ? ` ${wo.clientAddress_rel.postalCode}` : ''}`
    : wo.clientAddress
    ? wo.clientAddress
    : null;

  const addressType = wo.clientAddress_rel?.addressType ?? null;
  const predominant = getPredominantDisplay(wo.clientAddress_rel, addressTypeConfigs);

  const clientPhone =
    wo.client?.phone ??
    wo.temporaryClient?.phone ??
    null;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      {/* Offline badge */}
      {!isOnline && (
        <div style={{
          background: theme.colors.warningLight,
          border: `1px solid ${theme.colors.warning}`,
          borderRadius: theme.radius.md,
          padding: '0.5rem 1rem',
          marginBottom: '0.75rem',
          fontSize: theme.font.sizeSm,
          color: '#92400e',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          📴{' '}
          <span>
            <strong>{t('messages.offlineMode', { defaultValue: 'Mode hors-ligne' })}</strong>
            {isOfflineFallback
              ? ' — Données en cache local · Modifications synchronisées à la reconnexion.'
              : ' — Les changements seront synchronisés à la reconnexion.'}
          </span>
        </div>
      )}

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{ ...buttonStyles.ghost, padding: '0 0 1rem', color: theme.colors.primary, fontSize: theme.font.sizeSm }}
      >
        ← Mes bons de travail
      </button>

      {/* ── Client section — top, always visible ────────────────────────── */}
      {clientName && (
        <div
          style={{
            ...sectionStyle,
            borderLeft: `4px solid ${clientType ? CLIENT_TYPE_COLORS[clientType].color : theme.colors.primary}`,
          }}
        >
          <h2 style={sectionTitleStyle}>{t('sections.client')}</h2>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div>
              <p style={{ margin: '0 0 0.25rem', fontSize: theme.font.sizeMd, fontWeight: theme.font.weightBold, color: theme.colors.text }}>
                👤 {clientName}
              </p>
              {clientType && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.1rem 0.5rem',
                  borderRadius: theme.radius.full,
                  fontSize: theme.font.sizeXs,
                  fontWeight: theme.font.weightSemibold,
                  background: CLIENT_TYPE_COLORS[clientType].bg,
                  color: CLIENT_TYPE_COLORS[clientType].color,
                  marginBottom: '0.5rem',
                }}>
                  {CLIENT_TYPE_LABELS[clientType]}
                </span>
              )}
              {predominant && (
                <p style={{ margin: '0.5rem 0 0.125rem', fontSize: '1.25rem', fontWeight: theme.font.weightBold, color: theme.colors.text }}>
                  📍 {predominant.label}&nbsp;: {predominant.value}
                </p>
              )}
              {addressLine && (
                <p style={{
                  margin: predominant ? '0 0 0 1.6rem' : '0.25rem 0 0',
                  color: theme.colors.textSecondary,
                  fontSize: theme.font.sizeSm,
                }}>
                  {!predominant && '📍 '}{addressLine}
                  {addressType && (
                    <span style={{ marginLeft: '0.4rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
                      ({ADDRESS_TYPE_LABELS[addressType] ?? addressType})
                    </span>
                  )}
                </p>
              )}
              {clientPhone && (
                <a
                  href={`tel:${clientPhone}`}
                  style={{ display: 'block', marginTop: '0.375rem', color: theme.colors.primary, fontSize: theme.font.sizeSm, textDecoration: 'none' }}
                >
                  📞 {clientPhone}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Header card ──────────────────────────────────────────────────── */}
      <div
        style={{
          ...sectionStyle,
          borderLeft: `4px solid ${
            inProgress ? theme.colors.warning :
            canStart   ? '#7c3aed' :
            theme.colors.primary
          }`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: theme.font.sizeXs, fontFamily: 'monospace', color: theme.colors.textLight }}>
            {wo.referenceNumber}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {wo.status === WorkOrderStatus.EN_ROUTE && (
              <EnRouteTimer workOrderId={wo.id} />
            )}
            <WorkOrderStatusBadge step={wo.currentStep} status={wo.status} size="sm" />
          </div>
        </div>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: theme.font.sizeXl, color: theme.colors.text, fontWeight: theme.font.weightBold }}>
          {wo.title}
        </h1>
        {wo.description && (
          <p style={{ margin: 0, color: theme.colors.textSecondary, fontSize: theme.font.sizeSm, lineHeight: 1.6 }}>
            {wo.description}
          </p>
        )}
        {wo.taskType && (
          <p style={{ margin: '0.5rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
            {wo.taskType.icon && `${wo.taskType.icon} `}{wo.taskType.name}
          </p>
        )}
      </div>

      {/* ── Scheduling ───────────────────────────────────────────────────── */}
      {(wo.scheduledDate || wo.scheduledStartTime) && (
        <div style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Planification</h2>
          {wo.scheduledDate && (
            <p style={{ margin: '0 0 0.25rem', color: theme.colors.text, fontSize: theme.font.sizeSm }}>
              📅 {new Date(wo.scheduledDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
          {wo.scheduledStartTime && (
            <p style={{ margin: 0, color: theme.colors.text, fontSize: theme.font.sizeSm }}>
              🕐 {new Date(wo.scheduledStartTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              {wo.scheduledEndTime && ` → ${new Date(wo.scheduledEndTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          )}
        </div>
      )}

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      {!isCompleted && (
        <div style={{ ...sectionStyle }}>
          <h2 style={sectionTitleStyle}>{t('sections.actions')}</h2>

          {/* En attente de répartition — message informatif */}
          {isAssigned && !hasActionButton && (
            <div style={{
              padding: '1rem',
              background: theme.colors.warningLight,
              border: `1px solid ${theme.colors.warning}`,
              borderRadius: theme.radius.md,
              fontSize: theme.font.sizeSm,
              color: '#92400e',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              marginBottom: '0.75rem',
            }}>
              <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⏳</span>
              <span>
                <strong>En attente de répartition.</strong><br />
                Le répartiteur doit dispatcher ce bon de travail avant que vous puissiez intervenir.
              </span>
            </div>
          )}

          {/* Dynamic transitions from process engine */}
          <TransitionActionBar workOrderId={id!} />
        </div>
      )}

      {/* ── Parts used (B24) ─────────────────────────────────────────────── */}
      <WorkOrderPartsSection
        workOrderId={id!}
        readOnly={wo.status === WorkOrderStatus.COMPLETED_POSITIVE || wo.status === WorkOrderStatus.COMPLETED_NEGATIVE}
        cardStyle={sectionStyle}
        titleStyle={sectionTitleStyle}
      />

      {/* ── Photos / Attachments ─────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{t('sections.photosAttachments', { defaultValue: 'Photos & Pièces jointes' })}</h2>

        {(wo.attachments ?? []).length === 0 ? (
          <p style={{ color: theme.colors.textMuted, fontSize: theme.font.sizeSm, marginBottom: '0.75rem' }}>
            {t('messages.noPhoto', { defaultValue: 'Aucune photo' })}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {(wo.attachments ?? []).map((att) => (
              <div
                key={att.id}
                style={{
                  background: theme.colors.surfaceAlt,
                  border: theme.borders.light,
                  borderRadius: theme.radius.sm,
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: theme.font.sizeXs,
                  color: theme.colors.textMuted,
                  overflow: 'hidden',
                  padding: '0.5rem',
                  textAlign: 'center',
                }}
              >
                {att.mimeType.startsWith('image/') ? '🖼️' : '📎'} {att.fileName}
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          disabled={!isOnline}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
          id="tech-file-upload"
        />
        <label
          htmlFor={isOnline ? 'tech-file-upload' : undefined}
          style={{
            display: 'block',
            padding: '0.875rem',
            background: isOnline ? theme.colors.surfaceAlt : theme.colors.borderLight,
            border: `2px dashed ${isOnline ? theme.colors.border : theme.colors.textMuted}`,
            borderRadius: theme.radius.md,
            textAlign: 'center',
            cursor: isOnline ? 'pointer' : 'not-allowed',
            color: isOnline ? theme.colors.textMuted : theme.colors.textLight,
            fontSize: theme.font.sizeSm,
            opacity: isOnline ? 1 : 0.65,
            transition: 'border-color 0.15s ease, background 0.15s ease',
          }}
        >
          {!isOnline
            ? '📵 Les pièces jointes ne peuvent être ajoutées qu\'en ligne'
            : uploadAttachment.isPending
            ? '⏳ Envoi en cours...'
            : `📷 ${t('actions.addPhotoOrFile', { defaultValue: 'Ajouter une photo ou fichier' })}`}
        </label>
      </div>

      {/* ── Notes terrain ──────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>{t('sections.fieldNotes', { defaultValue: 'Notes terrain' })}</h2>

        {(wo.notes ?? []).map((note) => (
          <div
            key={note.id}
            style={{
              padding: '0.75rem',
              background: theme.colors.surfaceAlt,
              border: theme.borders.light,
              borderRadius: theme.radius.md,
              marginBottom: '0.5rem',
            }}
          >
            <p style={{ margin: 0, lineHeight: 1.5, fontSize: theme.font.sizeSm, color: theme.colors.text }}>
              {note.content}
            </p>
            <p style={{ margin: '0.375rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textLight }}>
              {new Date(note.createdAt).toLocaleString('fr-FR')}
            </p>
          </div>
        ))}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={2}
            placeholder="Note terrain..."
            style={{ ...formStyles.textarea, flex: 1, minHeight: 'unset', boxSizing: 'border-box' }}
          />
          <button
            onClick={handleAddNote}
            disabled={addNote.isPending || !noteContent.trim()}
            style={{
              ...buttonStyles.primary,
              padding: '0 1rem',
              fontWeight: theme.font.weightSemibold,
              whiteSpace: 'nowrap',
              alignSelf: 'flex-end',
              height: '2.5rem',
              opacity: (addNote.isPending || !noteContent.trim()) ? 0.5 : 1,
            }}
          >
            ✓
          </button>
        </div>
      </div>

      {/* ── Historique du BT ───────────────────────────────────────────── */}
      <WorkOrderAuditTimeline workOrderId={id!} enabled />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}
