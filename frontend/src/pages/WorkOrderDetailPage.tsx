import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useWorkOrder, useUpdateWorkOrder, useUpdateWorkOrderStatus, useAddNote, useUploadAttachment } from '../hooks/useWorkOrders';
import workOrdersService from '../services/work-orders.service';
import { useSearchUnifiedClients, useCreateTemporaryClient, useV3Client } from '../hooks/useClients';
import { useAddressTypes } from '../hooks/useSettings';
import { useTemplate } from '../hooks/useTemplates';
import { getPredominantDisplay } from '../utils/addressPredominant';
import { formatStreet } from '../utils/addressFormat';
import TemplateFormRenderer from '../components/TemplateFormRenderer';
import TemplateValuesView from '../components/TemplateValuesView';
import WorkOrderStatusBadge from '../components/WorkOrderStatusBadge';
import TransitionActionBar from '../components/transitions/TransitionActionBar';
import ApproveScheduleModal from '../components/ApproveScheduleModal';
import WorkOrderAuditTimeline from '../components/WorkOrderAuditTimeline';
import SignaturePad from '../components/SignaturePad';
import SlaBadge from '../components/SlaBadge';
import PrintWorkOrder from '../components/PrintWorkOrder';
import LoadingSpinner from '../components/LoadingSpinner';
import { useState, useRef, useEffect } from 'react';
import { WorkOrderStatus, WorkOrderType, Role } from '../types';
import type { User, ApiResponse } from '../types';
import type { UnifiedClient } from '../services/clients.service';
import api from '../services/api';
import { useAuthStore } from '../context/auth.store';
import { theme, cardStyles, buttonStyles, formStyles, modalStyles, layoutStyles } from '../theme';

const TYPE_LABELS: Record<string, string> = {
  [WorkOrderType.INSTALLATION]: 'Installation',
  [WorkOrderType.REPAIR]: 'Réparation',
  [WorkOrderType.MAINTENANCE]: 'Maintenance',
  [WorkOrderType.INSPECTION]: 'Inspection',
  [WorkOrderType.OTHER]: 'Autre',
};


export default function WorkOrderDetailPage() {
  const { t } = useTranslation('workOrders');
  const { t: tCommon } = useTranslation('common');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: wo, isLoading, error } = useWorkOrder(id!);
  const { data: addressTypeConfigs = [] } = useAddressTypes(true);
  const updateWorkOrder = useUpdateWorkOrder(id!);
  const updateStatus = useUpdateWorkOrderStatus(id!);
  // B23 — one-step approval of a portal work request (date + technician)
  const [showApproveModal, setShowApproveModal] = useState(false);
  const addNote = useAddNote(id!);
  const uploadAttachment = useUploadAttachment(id!);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === Role.ADMIN;
  const canSeeAuditTimeline =
    currentUser?.role === Role.ADMIN || currentUser?.role === Role.DISPATCHER;
  const canDuplicate = canSeeAuditTimeline; // ADMIN + DISPATCHER
  const [isDuplicating, setIsDuplicating] = useState(false);

  const [noteContent, setNoteContent] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // FIX 8 — technician selector state for the ASSIGNED transition
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('');

  // ─── Edit modal state ────────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<string>(WorkOrderType.REPAIR);
  const [editPriority, setEditPriority] = useState(3);
  const [editClientAddress, setEditClientAddress] = useState('');
  const [editClientAddressId, setEditClientAddressId] = useState<string>('');
  const [editTemplateData, setEditTemplateData] = useState<Record<string, unknown>>({});
  const [editAssignedToId, setEditAssignedToId] = useState('');
  const [editScheduledDate, setEditScheduledDate] = useState('');
  const [editScheduledStartTime, setEditScheduledStartTime] = useState('');
  const [editScheduledEndTime, setEditScheduledEndTime] = useState('');
  const [editCompletionNotes, setEditCompletionNotes] = useState('');
  // Client search in edit modal
  const [editClientSearch, setEditClientSearch] = useState('');
  const [editDebouncedSearch, setEditDebouncedSearch] = useState('');
  const [editSelectedClient, setEditSelectedClient] = useState<UnifiedClient | null>(null);
  const [editShowDropdown, setEditShowDropdown] = useState(false);
  const [editShowNewClientForm, setEditShowNewClientForm] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const editDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New temp client fields (edit modal)
  const [ncFirstName, setNcFirstName] = useState('');
  const [ncLastName, setNcLastName] = useState('');
  const [ncEmail, setNcEmail] = useState('');
  const [ncPhone, setNcPhone] = useState('');
  const [ncAddress, setNcAddress] = useState('');
  const [ncCity, setNcCity] = useState('');
  const [ncPostal, setNcPostal] = useState('');

  const { data: editSearchResults, isFetching: editSearchFetching } = useSearchUnifiedClients(editDebouncedSearch);
  const createTempClient = useCreateTemporaryClient();

  // Fetch full client detail (with all addresses) when a V3 client is selected
  const editClientDetailId =
    editSelectedClient && editSelectedClient.source === 'local' ? editSelectedClient.id : '';
  const { data: editClientDetail } = useV3Client(editClientDetailId);
  const editClientAddresses = editClientDetail?.addresses ?? [];

  // Template attached to the work order's taskType
  const woTemplateId =
    (wo as { taskType?: { templateId?: string | null } } | undefined)?.taskType?.templateId ?? '';
  const { data: woTemplate } = useTemplate(woTemplateId);

  // Debounce edit client search
  useEffect(() => {
    if (editDebounceTimer.current) clearTimeout(editDebounceTimer.current);
    editDebounceTimer.current = setTimeout(() => {
      setEditDebouncedSearch(editClientSearch);
      setEditShowDropdown(editClientSearch.length >= 2);
    }, 350);
    return () => { if (editDebounceTimer.current) clearTimeout(editDebounceTimer.current); };
  }, [editClientSearch]);

  // Auto-open modals from query params (?edit=true / ?assign=true)
  // Runs once when the work order data is available.
  useEffect(() => {
    if (!wo) return;
    let needsUpdate = false;
    const next = new URLSearchParams(searchParams);
    if (searchParams.get('edit') === 'true') {
      openEditModal();
      next.delete('edit');
      needsUpdate = true;
    }
    if (searchParams.get('assign') === 'true') {
      setShowAssignModal(true);
      next.delete('assign');
      needsUpdate = true;
    }
    if (needsUpdate) {
      setSearchParams(next, { replace: true });
    }
    // openEditModal is stable (defined with function keyword referencing wo via closure).
    // We intentionally run this only when wo first becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo]);

  function openEditModal() {
    if (!wo) return;
    setEditTitle(wo.title);
    setEditDescription(wo.description || '');
    setEditType(wo.type);
    setEditPriority(wo.priority);
    setEditClientAddress(wo.clientAddress || '');
    setEditClientAddressId(wo.clientAddressId || '');
    setEditTemplateData((wo as { templateData?: Record<string, unknown> | null }).templateData ?? {});
    setEditAssignedToId(wo.assignedToId || '');
    setEditScheduledDate(wo.scheduledDate ? wo.scheduledDate.split('T')[0] : '');
    setEditScheduledStartTime(wo.scheduledStartTime ? wo.scheduledStartTime.split('T')[1]?.substring(0, 5) || wo.scheduledStartTime : '');
    setEditScheduledEndTime(wo.scheduledEndTime ? wo.scheduledEndTime.split('T')[1]?.substring(0, 5) || wo.scheduledEndTime : '');
    setEditCompletionNotes(wo.completionNotes || '');
    // Set current client info
    if (wo.client) {
      setEditSelectedClient({
        id: wo.client.id,
        firstName: wo.client.firstName,
        lastName: wo.client.lastName,
        email: wo.client.email || undefined,
        phone: wo.client.phone || undefined,
        source: 'local',
      });
      setEditClientSearch(`${wo.client.firstName} ${wo.client.lastName}`);
    } else if (wo.temporaryClient) {
      setEditSelectedClient({
        id: wo.temporaryClient.id,
        firstName: wo.temporaryClient.firstName,
        lastName: wo.temporaryClient.lastName,
        email: wo.temporaryClient.email || undefined,
        phone: wo.temporaryClient.phone || undefined,
        address: wo.temporaryClient.address || undefined,
        source: 'local',
      });
      setEditClientSearch(`${wo.temporaryClient.firstName} ${wo.temporaryClient.lastName}`);
    } else if (wo.externalClientName) {
      setEditSelectedClient({
        id: wo.externalClientId || '',
        firstName: wo.externalClientName.split(' ')[0] || '',
        lastName: wo.externalClientName.split(' ').slice(1).join(' ') || '',
        source: 'external',
      });
      setEditClientSearch(wo.externalClientName);
    } else {
      setEditSelectedClient(null);
      setEditClientSearch('');
    }
    setEditShowNewClientForm(false);
    setShowEditModal(true);
  }

  function handleEditSelectClient(client: UnifiedClient) {
    setEditSelectedClient(client);
    setEditClientSearch(`${client.firstName} ${client.lastName}`);
    setEditShowDropdown(false);
    if (client.address) setEditClientAddress(client.address);
  }

  function clearEditClient() {
    setEditSelectedClient(null);
    setEditClientSearch('');
  }

  async function handleEditCreateTempClient() {
    if (!ncFirstName.trim() || !ncLastName.trim()) return;
    try {
      const created = await createTempClient.mutateAsync({
        firstName: ncFirstName.trim(),
        lastName: ncLastName.trim(),
        email: ncEmail.trim() || undefined,
        phone: ncPhone.trim() || undefined,
        address: ncAddress.trim() || undefined,
        city: ncCity.trim() || undefined,
        postalCode: ncPostal.trim() || undefined,
      });
      handleEditSelectClient({
        id: created.id,
        firstName: created.firstName,
        lastName: created.lastName,
        email: created.email,
        phone: created.phone,
        address: created.address,
        source: 'local',
      });
      setEditShowNewClientForm(false);
      setNcFirstName(''); setNcLastName(''); setNcEmail(''); setNcPhone('');
      setNcAddress(''); setNcCity(''); setNcPostal('');
    } catch { /* handled by mutation */ }
  }

  async function handleEditSave() {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    try {
      // Combine the date + time pickers into ISO 8601 datetime strings before sending.
      // Backend expects @IsDateString() — bare "HH:MM" silently writes NULL.
      const datePart = editScheduledDate;
      const toIso = (time: string): string | undefined => {
        if (!datePart || !time) return undefined;
        const d = new Date(`${datePart}T${time}:00`);
        return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
      };
      const scheduledDateISO = datePart ? new Date(`${datePart}T00:00:00`).toISOString() : undefined;

      const dto: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        type: editType,
        priority: Number(editPriority),
        clientAddress: editClientAddress.trim() || undefined,
        clientAddressId: editClientAddressId || null,
        templateData: editTemplateData,
        assignedToId: editAssignedToId || undefined,
        scheduledDate: scheduledDateISO,
        scheduledStartTime: toIso(editScheduledStartTime),
        scheduledEndTime: toIso(editScheduledEndTime),
        completionNotes: editCompletionNotes.trim() || undefined,
      };
      // Client
      if (editSelectedClient) {
        if (editSelectedClient.source === 'local') {
          dto.clientId = editSelectedClient.id;
          dto.temporaryClientId = null;
          dto.externalClientId = null;
          dto.externalClientName = null;
        } else {
          dto.externalClientId = editSelectedClient.id;
          dto.externalClientName = `${editSelectedClient.firstName} ${editSelectedClient.lastName}`;
          dto.clientId = null;
          dto.temporaryClientId = null;
        }
      } else {
        dto.clientId = null;
        dto.temporaryClientId = null;
        dto.externalClientId = null;
        dto.externalClientName = null;
      }
      await updateWorkOrder.mutateAsync(dto as any);
      setShowEditModal(false);
    } catch { /* handled by mutation */ }
    setEditSaving(false);
  }

  // FIX 8 — load technician list (lazy: only when modal is open)
  const { data: technicians = [] } = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User[]>>('/users/technicians');
      return data.data;
    },
    enabled: showAssignModal || showEditModal,
    staleTime: 5 * 60_000,
  });

  const handleAssign = () => {
    if (!selectedTechnicianId) return;
    updateStatus.mutate(
      { status: WorkOrderStatus.ASSIGNED, assignedToId: selectedTechnicianId },
      {
        onSuccess: () => {
          setShowAssignModal(false);
          setSelectedTechnicianId('');
        },
      },
    );
  };

  if (isLoading) return <LoadingSpinner fullPage />;
  if (error || !wo) return <div style={{ color: theme.colors.danger, padding: '2rem' }}>{t('messages.notFound', { defaultValue: 'Bon de travail introuvable' })}</div>;

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    await addNote.mutateAsync(noteContent.trim());
    setNoteContent('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAttachment.mutateAsync(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Shared card container style (no padding — each section manages its own)
  const cardStyle: React.CSSProperties = {
    ...cardStyles.card,
    padding: '1.5rem',
    marginBottom: '1.5rem',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: theme.font.sizeXs,
    fontWeight: theme.font.weightSemibold,
    color: theme.colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.25rem',
  };

  const valueStyle: React.CSSProperties = { color: theme.colors.text };

  return (
    <div style={{ maxWidth: '900px', ...layoutStyles.page }}>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'none',
          border: 'none',
          color: theme.colors.primary,
          cursor: 'pointer',
          marginBottom: '1rem',
          fontSize: theme.font.sizeSm,
        }}
      >
        ← Retour
      </button>

      {/* Header */}
      <div style={{ ...cardStyle, borderLeft: `4px solid ${theme.colors.primary}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ ...labelStyle }}>{t('referenceNumber')}</p>
            <p style={{ fontFamily: 'monospace', fontSize: theme.font.sizeMd, color: theme.colors.text, margin: '0 0 0.5rem' }}>{wo.referenceNumber}</p>
            <h1 style={{ margin: 0, fontSize: theme.font.size2xl, color: theme.colors.text }}>{wo.title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <WorkOrderStatusBadge step={wo.currentStep} status={wo.status} />
            <SlaBadge wo={wo} />
            {(wo.currentStep?.isRequested || wo.status === WorkOrderStatus.REQUESTED) && isAdmin && (
              <button
                onClick={() => setShowApproveModal(true)}
                style={{ ...buttonStyles.primary, fontSize: theme.font.sizeSm, background: '#10b981', borderColor: '#10b981' }}
              >
                ✔ Approuver et planifier
              </button>
            )}
            <TransitionActionBar workOrderId={wo.id} variant="dropdown" />
            {isAdmin && (
              <button
                onClick={openEditModal}
                title={t('edit')}
                style={{
                  ...buttonStyles.primary,
                  fontSize: theme.font.sizeSm,
                }}
              >
                ✏️ Éditer
              </button>
            )}
            {canDuplicate && wo && (
              <button
                onClick={async () => {
                  if (isDuplicating) return;
                  setIsDuplicating(true);
                  try {
                    const clone = await workOrdersService.duplicate(wo.id);
                    navigate(`/bons-de-travail/${clone.id}`);
                  } catch (err) {
                    console.error('[work-orders] duplicate failed', err);
                    window.alert(t('actions.duplicateFailed', { defaultValue: 'Duplication impossible. Réessayez.' }));
                  } finally {
                    setIsDuplicating(false);
                  }
                }}
                disabled={isDuplicating}
                title={t('actions.duplicate', { defaultValue: 'Dupliquer ce BT en un nouveau (CREATED, sans technicien ni dates)' })}
                style={{
                  ...buttonStyles.secondary,
                  fontSize: theme.font.sizeSm,
                  opacity: isDuplicating ? 0.6 : 1,
                  cursor: isDuplicating ? 'wait' : 'pointer',
                }}
              >
                {isDuplicating
                  ? `⏳ ${t('actions.duplicating', { defaultValue: 'Duplication…' })}`
                  : `🗐 ${t('actions.duplicateShort', { defaultValue: 'Dupliquer' })}`}
              </button>
            )}
            <button
              onClick={() => window.print()}
              title={t('actions.print')}
              style={{
                ...buttonStyles.secondary,
                fontSize: theme.font.sizeSm,
              }}
            >
              🖨 Imprimer
            </button>
          </div>
        </div>
        {wo.description && (
          <p style={{ marginTop: '1rem', color: theme.colors.textSecondary, lineHeight: 1.6 }}>{wo.description}</p>
        )}
      </div>

      {/* Details grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={cardStyle}>
          <h2 style={{ fontSize: theme.font.sizeMd, marginBottom: '1rem', color: theme.colors.text }}>{t('sections.info', { defaultValue: 'Informations' })}</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <dt style={labelStyle}>{t('fields.type')}</dt>
              <dd style={valueStyle}>{t(`types.${wo.type}`, { defaultValue: wo.type })}</dd>
            </div>
            <div>
              <dt style={labelStyle}>{t('fields.priority')}</dt>
              <dd style={valueStyle}>{wo.priority}</dd>
            </div>
            <div>
              <dt style={labelStyle}>{t('fields.scheduledDate')}</dt>
              <dd style={valueStyle}>{wo.scheduledDate ? new Date(wo.scheduledDate).toLocaleDateString() : '—'}</dd>
            </div>
            <div>
              <dt style={labelStyle}>{t('fields.technician')}</dt>
              <dd style={valueStyle}>{wo.assignedTo ? `${wo.assignedTo.firstName} ${wo.assignedTo.lastName}` : '—'}</dd>
            </div>
          </dl>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: theme.font.sizeMd, marginBottom: '1rem', color: theme.colors.text }}>👤 {t('sections.client')}</h2>
          {wo.client ? (
            <div>
              <p style={{ ...valueStyle, fontWeight: theme.font.weightSemibold }}>
                {wo.client.firstName} {wo.client.lastName}
              </p>
              {wo.client.phone && <p style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', margin: '0.125rem 0' }}>📞 {wo.client.phone}</p>}
              {wo.client.email && <p style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', margin: '0.125rem 0' }}>📧 {wo.client.email}</p>}
              <span style={{ display: 'inline-block', marginTop: '0.375rem', fontSize: '0.65rem', fontWeight: theme.font.weightSemibold, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full, background: theme.colors.primaryLight, color: theme.colors.primary }}>
                Client enregistré
              </span>
            </div>
          ) : wo.temporaryClient ? (
            <div>
              <p style={{ ...valueStyle, fontWeight: theme.font.weightSemibold }}>{wo.temporaryClient.firstName} {wo.temporaryClient.lastName}</p>
              {wo.temporaryClient.phone && <p style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', margin: '0.125rem 0' }}>📞 {wo.temporaryClient.phone}</p>}
              {wo.temporaryClient.email && <p style={{ color: theme.colors.textSecondary, fontSize: '0.9rem', margin: '0.125rem 0' }}>📧 {wo.temporaryClient.email}</p>}
              <span style={{ display: 'inline-block', marginTop: '0.375rem', fontSize: '0.65rem', fontWeight: theme.font.weightSemibold, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full, background: '#fef3c7', color: '#92400e' }}>
                Client temporaire
              </span>
            </div>
          ) : wo.externalClientName ? (
            <div>
              <p style={{ ...valueStyle, fontWeight: theme.font.weightSemibold }}>{wo.externalClientName}</p>
              <span style={{ display: 'inline-block', marginTop: '0.375rem', fontSize: '0.65rem', fontWeight: theme.font.weightSemibold, padding: '0.1rem 0.4rem', borderRadius: theme.radius.full, background: '#d1fae5', color: '#065f46' }}>
                Client externe
              </span>
            </div>
          ) : (
            <div>
              <p style={{ color: theme.colors.textLight, marginBottom: isAdmin ? '0.75rem' : 0 }}>
                Aucun client assigné
              </p>
              {isAdmin && (
                <button
                  onClick={openEditModal}
                  title="Assigner un client à ce bon de travail"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.4rem 0.875rem',
                    borderRadius: theme.radius.md,
                    border: `1px dashed ${theme.colors.primary}`,
                    background: theme.colors.primaryLight,
                    color: theme.colors.primary,
                    fontSize: theme.font.sizeSm,
                    fontWeight: theme.font.weightMedium,
                    cursor: 'pointer',
                  }}
                >
                  👤 Assigner un client
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Emplacement — adresse complète de l'intervention */}
      <div style={{ ...cardStyle, borderLeft: `4px solid ${theme.colors.success}` }}>
        <h2 style={{ fontSize: theme.font.sizeMd, marginBottom: '1rem', color: theme.colors.text }}>📍 {t('sections.location')}</h2>
        {(() => {
          const rel = (wo as { clientAddress_rel?: {
            street: string;
            apartment?: string | null;
            city: string;
            postalCode?: string | null;
            province?: string | null;
            country?: string | null;
            label?: string | null;
            addressType?: string | null;
            typeData?: Record<string, unknown> | null;
          } | null }).clientAddress_rel;
          if (rel) {
            const predominant = getPredominantDisplay(rel, addressTypeConfigs);
            return (
              <div>
                {predominant && (
                  <p style={{ margin: '0 0 0.375rem', fontSize: '1.4rem', fontWeight: theme.font.weightBold, color: theme.colors.text }}>
                    {predominant.label}&nbsp;: {predominant.value}
                  </p>
                )}
                <p style={{ ...valueStyle, fontWeight: predominant ? theme.font.weightNormal : theme.font.weightSemibold, fontSize: predominant ? '0.95rem' : undefined, color: predominant ? theme.colors.textSecondary : undefined }}>
                  {formatStreet(rel)}{rel.apartment ? ` app. ${rel.apartment}` : ''}
                </p>
                <p style={{ margin: '0.125rem 0', color: theme.colors.textSecondary, fontSize: '0.95rem' }}>
                  {rel.city}{rel.postalCode ? ` ${rel.postalCode}` : ''}{rel.province ? `, ${rel.province}` : ''}
                  {rel.country && rel.country !== 'Canada' ? `, ${rel.country}` : ''}
                </p>
                {rel.label && (
                  <p style={{ margin: '0.125rem 0', color: theme.colors.textMuted, fontSize: '0.85rem', fontStyle: 'italic' }}>
                    {rel.label}
                  </p>
                )}
              </div>
            );
          }
          if (wo.clientAddress) {
            return <p style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{wo.clientAddress}</p>;
          }
          return (
            <div>
              <p style={{ color: theme.colors.textLight, marginBottom: isAdmin ? '0.75rem' : 0 }}>
                Aucune adresse renseignée
              </p>
              {isAdmin && (
                <button
                  onClick={openEditModal}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.4rem 0.875rem',
                    borderRadius: theme.radius.md,
                    border: `1px dashed ${theme.colors.success}`,
                    background: '#dcfce7',
                    color: '#15803d',
                    fontSize: theme.font.sizeSm,
                    fontWeight: theme.font.weightMedium,
                    cursor: 'pointer',
                  }}
                >
                  📍 Définir l'adresse
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* Template fields (read-only) */}
      {woTemplate && woTemplate.sections.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: theme.font.sizeMd, marginBottom: '1rem', color: theme.colors.text }}>
            Formulaire — {woTemplate.name}
          </h2>
          <TemplateValuesView
            template={woTemplate}
            values={(wo as { templateData?: Record<string, unknown> | null }).templateData ?? {}}
          />
        </div>
      )}

      {/* Notes */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: theme.font.sizeMd, marginBottom: '1rem', color: theme.colors.text }}>{t('sections.notes')}</h2>

        {/* Existing notes */}
        {(wo.notes ?? []).length === 0 ? (
          <p style={{ color: theme.colors.textLight, marginBottom: '1rem' }}>{t('messages.noNote', { defaultValue: 'Aucune note' })}</p>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            {(wo.notes ?? []).map((note) => (
              <div
                key={note.id}
                style={{
                  padding: '0.75rem',
                  background: theme.colors.surfaceAlt,
                  borderRadius: theme.radius.md,
                  marginBottom: '0.5rem',
                  border: theme.borders.light,
                }}
              >
                <p style={{ margin: 0, lineHeight: 1.5, color: theme.colors.text }}>{note.content}</p>
                <p style={{ margin: '0.375rem 0 0', fontSize: theme.font.sizeXs, color: theme.colors.textLight }}>
                  {note.author.firstName} {note.author.lastName} — {new Date(note.createdAt).toLocaleString('fr-FR')}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Add note */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={2}
            placeholder={t('actions.addNote') + '...'}
            style={{ flex: 1, ...formStyles.textarea }}
          />
          <button
            onClick={handleAddNote}
            disabled={addNote.isPending || !noteContent.trim()}
            style={{
              ...buttonStyles.primary,
              padding: '0 1.25rem',
              whiteSpace: 'nowrap',
              opacity: (addNote.isPending || !noteContent.trim()) ? 0.6 : 1,
              cursor: (addNote.isPending || !noteContent.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            {addNote.isPending ? '...' : tCommon('actions.add')}
          </button>
        </div>
      </div>

      {/* Signatures (B12) */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: theme.font.sizeMd, marginBottom: '1rem', color: theme.colors.text }}>
          ✍️ Signatures
        </h2>
        <SignaturePad
          workOrderId={wo.id}
          initialTechnician={(wo as unknown as { signatureTechnician?: string | null }).signatureTechnician ?? null}
          initialClient={(wo as unknown as { signatureClient?: string | null }).signatureClient ?? null}
        />
      </div>

      {/* Attachments */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: theme.font.sizeMd, marginBottom: '1rem', color: theme.colors.text }}>{t('sections.attachments')}</h2>

        {(wo.attachments ?? []).length === 0 ? (
          <p style={{ color: theme.colors.textLight, marginBottom: '1rem' }}>{t('messages.noAttachment', { defaultValue: 'Aucune pièce jointe' })}</p>
        ) : (
          <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {(wo.attachments ?? []).map((att) => (
              <div
                key={att.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  background: theme.colors.surfaceAlt,
                  borderRadius: theme.radius.md,
                  border: theme.borders.light,
                }}
              >
                <span>📎</span>
                <span style={{ flex: 1, fontSize: theme.font.sizeSm, color: theme.colors.text }}>{att.fileName}</span>
                <span style={{ fontSize: theme.font.sizeXs, color: theme.colors.textLight }}>{(att.fileSize / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        )}

        <div>
          <input ref={fileInputRef} type="file" onChange={handleFileUpload} style={{ display: 'none' }} id="file-upload" />
          <label
            htmlFor="file-upload"
            style={{
              ...buttonStyles.secondary,
              display: 'inline-flex',
              cursor: 'pointer',
            }}
          >
            {uploadAttachment.isPending ? tCommon('actions.uploading', { defaultValue: 'Envoi...' }) : `+ ${t('actions.uploadAttachment')}`}
          </label>
        </div>
      </div>

      {/* Audit timeline — qui a fait quoi, quand. Visible ADMIN + DISPATCHER. */}
      {id && (
        <WorkOrderAuditTimeline workOrderId={id} enabled={canSeeAuditTimeline} />
      )}

      {/* Assign modal: select a technician before sending the ASSIGNED transition */}
      {showAssignModal && (
        <div
          style={{ ...modalStyles.overlay }}
          onClick={(e) => e.target === e.currentTarget && setShowAssignModal(false)}
        >
          <div style={{ ...modalStyles.content, maxWidth: '380px' }}>
            <div style={{ ...modalStyles.header }}>
              <h3 style={{ ...modalStyles.headerTitle }}>{t('actions.assignTechnician', { defaultValue: 'Assigner un technicien' })}</h3>
            </div>
            <div style={{ ...modalStyles.body }}>
              <select
                value={selectedTechnicianId}
                onChange={(e) => setSelectedTechnicianId(e.target.value)}
                style={{ ...formStyles.select, marginBottom: '1rem' }}
              >
                <option value="">-- Choisir un technicien --</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                ))}
              </select>
            </div>
            <div style={{ ...modalStyles.footer }}>
              <button
                onClick={() => { setShowAssignModal(false); setSelectedTechnicianId(''); }}
                style={{ ...buttonStyles.secondary }}
              >
                Annuler
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedTechnicianId || updateStatus.isPending}
                style={{
                  ...buttonStyles.primary,
                  background: theme.colors.warning,
                  cursor: selectedTechnicianId ? 'pointer' : 'default',
                  opacity: (!selectedTechnicianId || updateStatus.isPending) ? 0.6 : 1,
                }}
              >
                {updateStatus.isPending ? '...' : tCommon('actions.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           EDIT MODAL — Admin can edit all fields at any status
         ═══════════════════════════════════════════════════════════════════════ */}
      {showApproveModal && (
        <ApproveScheduleModal workOrderId={wo.id} onClose={() => setShowApproveModal(false)} />
      )}

      {showEditModal && (
        <div
          style={{ ...modalStyles.overlay }}
          onClick={(e) => e.target === e.currentTarget && setShowEditModal(false)}
        >
          <div style={{ ...modalStyles.content, maxWidth: '720px' }}>
            <div style={{ ...modalStyles.header }}>
              <h3 style={{ ...modalStyles.headerTitle }}>✏️ Éditer le bon de travail</h3>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: theme.colors.textMuted }}
              >✕</button>
            </div>

            <div style={{ ...modalStyles.body, overflowY: 'auto', maxHeight: '70vh' }}>
              {/* ── Informations générales ────────────────────────────────── */}
              <p style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightBold, color: theme.colors.text, marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: theme.borders.default }}>
                Informations générales
              </p>

              {/* Title */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ ...formStyles.label }}>Titre <span style={{ color: theme.colors.danger }}>*</span></label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{ ...formStyles.input, boxSizing: 'border-box' }}
                  placeholder={t('fields.title')}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {/* Type */}
                <div>
                  <label style={{ ...formStyles.label }}>{t('fields.type')}</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    style={{ ...formStyles.select, boxSizing: 'border-box' }}
                  >
                    {Object.values(WorkOrderType).map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label style={{ ...formStyles.label }}>{t('fields.priority')}</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(Number(e.target.value))}
                    style={{ ...formStyles.select, boxSizing: 'border-box' }}
                  >
                    {[1, 2, 3, 4, 5].map((p) => (
                      <option key={p} value={p}>
                        {p} — {p === 1 ? 'Très basse' : p === 2 ? 'Basse' : p === 3 ? 'Normale' : p === 4 ? 'Haute' : 'Critique'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ ...formStyles.label }}>{t('fields.description')}</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  style={{ ...formStyles.textarea, boxSizing: 'border-box' }}
                  placeholder={t('fields.descriptionPlaceholder', { defaultValue: 'Détails du travail...' })}
                />
              </div>

              {/* ════════════════════════════════════════════════════════════
                  BLOC 1 — CLIENT
                  ════════════════════════════════════════════════════════════ */}
              <div style={{ border: theme.borders.default, borderRadius: theme.radius.md, padding: '0.875rem 1rem', marginBottom: '0.875rem', background: theme.colors.surface }}>
                <p style={{ margin: '0 0 0.625rem', fontSize: theme.font.sizeSm, fontWeight: theme.font.weightBold, color: theme.colors.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  👤 Client
                </p>

                {editSelectedClient ? (
                  /* ── Client sélectionné : afficher infos + bouton changer ── */
                  <div>
                    <div style={{
                      background: theme.colors.primaryLight,
                      border: `1px solid ${theme.colors.primary}40`,
                      borderRadius: theme.radius.md,
                      padding: '0.75rem 1rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: '0 0 0.25rem', fontSize: theme.font.sizeMd, fontWeight: theme.font.weightSemibold, color: theme.colors.text }}>
                            {editSelectedClient.firstName} {editSelectedClient.lastName}
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.875rem', fontSize: theme.font.sizeSm, color: theme.colors.textSecondary }}>
                            {editSelectedClient.email && <span>📧 {editSelectedClient.email}</span>}
                            {editSelectedClient.phone && <span>📞 {editSelectedClient.phone}</span>}
                          </div>
                          <span style={{ display: 'inline-block', marginTop: '0.375rem', fontSize: '0.65rem', fontWeight: theme.font.weightSemibold, padding: '0.15rem 0.5rem', borderRadius: theme.radius.full, background: editSelectedClient.source === 'local' ? theme.colors.primary : '#10b981', color: '#fff' }}>
                            {editSelectedClient.source === 'local' ? 'Client enregistré' : 'Client externe'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={clearEditClient}
                          style={{ ...buttonStyles.secondary, ...buttonStyles.sm }}
                        >
                          Changer
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Aucun client : afficher recherche ── */
                  <div>
                    <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                      <input
                        value={editClientSearch}
                        onChange={(e) => setEditClientSearch(e.target.value)}
                        onFocus={() => { if (editDebouncedSearch.length >= 2) setEditShowDropdown(true); }}
                        onBlur={() => setTimeout(() => setEditShowDropdown(false), 200)}
                        style={{ ...formStyles.input, boxSizing: 'border-box' }}
                        placeholder={t('actions.searchClient', { defaultValue: 'Rechercher un client par nom, prénom ou email…' })}
                      />
                      {editShowDropdown && editDebouncedSearch.length >= 2 && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0,
                          background: theme.colors.surface, border: theme.borders.default,
                          borderRadius: theme.radius.md, boxShadow: theme.shadows.md,
                          zIndex: 50, maxHeight: '220px', overflowY: 'auto', marginTop: '0.25rem',
                        }}>
                          {editSearchFetching && !editSearchResults ? (
                            <p style={{ padding: '0.625rem 0.875rem', margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textLight, textAlign: 'center' }}>
                              Recherche…
                            </p>
                          ) : !editSearchResults || editSearchResults.length === 0 ? (
                            <p style={{ padding: '0.625rem 0.875rem', margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textLight, textAlign: 'center' }}>
                              Aucun client trouvé pour « {editDebouncedSearch} »
                            </p>
                          ) : (
                            editSearchResults.map((c) => (
                              <button
                                key={`${c.source}-${c.id}`}
                                type="button"
                                onMouseDown={() => handleEditSelectClient(c)}
                                style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  width: '100%', padding: '0.5rem 0.75rem', background: 'none',
                                  border: 'none', borderBottom: theme.borders.light, cursor: 'pointer', textAlign: 'left',
                                }}
                              >
                                <span style={{ fontSize: theme.font.sizeSm, color: theme.colors.text }}>
                                  {c.firstName} {c.lastName}
                                  {c.email && <span style={{ color: theme.colors.textLight, marginLeft: '0.5rem', fontSize: theme.font.sizeXs }}>{c.email}</span>}
                                </span>
                                <span style={{
                                  fontSize: '0.65rem', fontWeight: theme.font.weightSemibold,
                                  padding: '0.1rem 0.4rem', borderRadius: theme.radius.full,
                                  background: c.source === 'local' ? theme.colors.primaryLight : '#d1fae5',
                                  color: c.source === 'local' ? theme.colors.primary : '#065f46',
                                }}>
                                  {c.source === 'local' ? 'Client' : 'Externe'}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {!editShowNewClientForm && (
                      <button
                        type="button"
                        onClick={() => setEditShowNewClientForm(true)}
                        style={{ background: 'none', border: `1px dashed ${theme.colors.focusRing}`, color: theme.colors.primary, padding: '0.375rem 0.75rem', borderRadius: theme.radius.md, cursor: 'pointer', fontSize: theme.font.sizeXs }}
                      >+ Créer un client temporaire</button>
                    )}

                    {editShowNewClientForm && (
                      <div style={{ background: theme.colors.surfaceAlt, border: theme.borders.default, borderRadius: theme.radius.md, padding: '0.75rem', marginTop: '0.5rem' }}>
                        <p style={{ margin: '0 0 0.5rem', fontWeight: theme.font.weightSemibold, fontSize: theme.font.sizeXs, color: theme.colors.text }}>Nouveau client temporaire</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <input value={ncFirstName} onChange={(e) => setNcFirstName(e.target.value)} placeholder="Prénom *" style={{ ...formStyles.input, boxSizing: 'border-box', fontSize: theme.font.sizeXs }} />
                          <input value={ncLastName} onChange={(e) => setNcLastName(e.target.value)} placeholder="Nom *" style={{ ...formStyles.input, boxSizing: 'border-box', fontSize: theme.font.sizeXs }} />
                          <input value={ncEmail} onChange={(e) => setNcEmail(e.target.value)} placeholder="Email" style={{ ...formStyles.input, boxSizing: 'border-box', fontSize: theme.font.sizeXs }} />
                          <input value={ncPhone} onChange={(e) => setNcPhone(e.target.value)} placeholder="Téléphone" style={{ ...formStyles.input, boxSizing: 'border-box', fontSize: theme.font.sizeXs }} />
                          <input value={ncAddress} onChange={(e) => setNcAddress(e.target.value)} placeholder="Adresse" style={{ ...formStyles.input, boxSizing: 'border-box', gridColumn: '1 / -1', fontSize: theme.font.sizeXs }} />
                          <input value={ncCity} onChange={(e) => setNcCity(e.target.value)} placeholder="Ville" style={{ ...formStyles.input, boxSizing: 'border-box', fontSize: theme.font.sizeXs }} />
                          <input value={ncPostal} onChange={(e) => setNcPostal(e.target.value)} placeholder="Code postal" style={{ ...formStyles.input, boxSizing: 'border-box', fontSize: theme.font.sizeXs }} />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" onClick={handleEditCreateTempClient}
                            disabled={!ncFirstName.trim() || !ncLastName.trim()}
                            style={{ ...buttonStyles.primary, fontSize: theme.font.sizeXs, padding: '0.375rem 0.75rem', opacity: (!ncFirstName.trim() || !ncLastName.trim()) ? 0.5 : 1 }}
                          >Créer et sélectionner</button>
                          <button type="button" onClick={() => setEditShowNewClientForm(false)}
                            style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeXs, padding: '0.375rem 0.75rem' }}
                          >{tCommon('actions.cancel')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ════════════════════════════════════════════════════════════
                  BLOC 2 — ADRESSE D'INTERVENTION
                  ════════════════════════════════════════════════════════════ */}
              <div style={{ border: theme.borders.default, borderRadius: theme.radius.md, padding: '0.875rem 1rem', marginBottom: '1rem', background: theme.colors.surface }}>
                <p style={{ margin: '0 0 0.625rem', fontSize: theme.font.sizeSm, fontWeight: theme.font.weightBold, color: theme.colors.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  📍 Adresse d'intervention
                </p>

                {!editSelectedClient ? (
                  <p style={{ margin: 0, fontSize: theme.font.sizeSm, color: theme.colors.textMuted, fontStyle: 'italic' }}>
                    Sélectionnez d'abord un client pour voir ses adresses enregistrées.
                  </p>
                ) : editSelectedClient.source === 'local' ? (
                  <div>
                    {editClientAddresses.length === 0 ? (
                      <div style={{
                        background: theme.colors.warningLight,
                        border: `1px solid ${theme.colors.warning}40`,
                        borderRadius: theme.radius.md,
                        padding: '0.625rem 0.875rem',
                        marginBottom: '0.5rem',
                      }}>
                        <p style={{ margin: 0, fontSize: theme.font.sizeXs, color: '#92400e' }}>
                          ⚠️ Ce client n'a aucune adresse enregistrée. Ajoutez-en une depuis la page Clients, ou saisissez l'adresse libre ci-dessous.
                        </p>
                      </div>
                    ) : (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ ...formStyles.label }}>
                          Adresse enregistrée du client ({editClientAddresses.length})
                        </label>
                        <select
                          value={editClientAddressId}
                          onChange={(e) => {
                            const id = e.target.value;
                            setEditClientAddressId(id);
                            const addr = editClientAddresses.find((a) => a.id === id);
                            if (addr) {
                              const parts = [
                                `${formatStreet(addr)}${addr.apartment ? ` app. ${addr.apartment}` : ''}`,
                                addr.city,
                                addr.postalCode,
                              ].filter(Boolean);
                              setEditClientAddress(parts.join(', '));
                            } else {
                              setEditClientAddress('');
                            }
                          }}
                          style={{ ...formStyles.select, boxSizing: 'border-box' }}
                        >
                          <option value="">— Saisir une adresse libre —</option>
                          {editClientAddresses.map((a) => (
                            <option key={a.id} value={a.id}>
                              {formatStreet(a)}{a.apartment ? ` app. ${a.apartment}` : ''}, {a.city} {a.postalCode}
                              {a.label ? ` · ${a.label}` : ''}
                              {a.isDefault ? ' [défaut]' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ) : null}

                <div>
                  <label style={{ ...formStyles.label }}>{t('fields.fullAddress', { defaultValue: 'Adresse complète (texte libre)' })}</label>
                  <input
                    value={editClientAddress}
                    onChange={(e) => setEditClientAddress(e.target.value)}
                    style={{ ...formStyles.input, boxSizing: 'border-box' }}
                    placeholder={t('fields.addressPlaceholder', { defaultValue: 'Numéro, rue, ville, code postal…' })}
                  />
                  <p style={{ ...formStyles.fieldHint }}>
                    Utilisé pour l'impression et l'affichage. Pré-rempli automatiquement quand vous sélectionnez une adresse enregistrée.
                  </p>
                </div>
              </div>

              {/* ── Assignation et planification ──────────────────────────── */}
              <p style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightBold, color: theme.colors.text, marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: theme.borders.default }}>
                Assignation et planification
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {/* Technician */}
                <div>
                  <label style={{ ...formStyles.label }}>{t('fields.technician')}</label>
                  <select
                    value={editAssignedToId}
                    onChange={(e) => setEditAssignedToId(e.target.value)}
                    style={{ ...formStyles.select, boxSizing: 'border-box' }}
                  >
                    <option value="">— Non assigné —</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                    ))}
                  </select>
                </div>

                {/* Scheduled date */}
                <div>
                  <label style={{ ...formStyles.label }}>{t('fields.scheduledDate')}</label>
                  <input
                    type="date"
                    value={editScheduledDate}
                    onChange={(e) => setEditScheduledDate(e.target.value)}
                    style={{ ...formStyles.input, boxSizing: 'border-box' }}
                  />
                </div>

                {/* Start time */}
                <div>
                  <label style={{ ...formStyles.label }}>{t('fields.scheduledStartTime')}</label>
                  <input
                    type="time"
                    value={editScheduledStartTime}
                    onChange={(e) => setEditScheduledStartTime(e.target.value)}
                    style={{ ...formStyles.input, boxSizing: 'border-box' }}
                  />
                </div>

                {/* End time */}
                <div>
                  <label style={{ ...formStyles.label }}>{t('fields.scheduledEndTime')}</label>
                  <input
                    type="time"
                    value={editScheduledEndTime}
                    onChange={(e) => setEditScheduledEndTime(e.target.value)}
                    style={{ ...formStyles.input, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Template fields */}
              {woTemplate && woTemplate.sections.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightBold, color: theme.colors.text, marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: theme.borders.default }}>
                    Formulaire — {woTemplate.name}
                  </p>
                  <TemplateFormRenderer
                    template={woTemplate}
                    values={editTemplateData}
                    onChange={setEditTemplateData}
                    userRole={currentUser?.role}
                  />
                </div>
              )}

              {/* Completion notes */}
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ ...formStyles.label }}>{t('fields.completionNotes', { defaultValue: 'Notes de complétion' })}</label>
                <textarea
                  value={editCompletionNotes}
                  onChange={(e) => setEditCompletionNotes(e.target.value)}
                  rows={2}
                  style={{ ...formStyles.textarea, boxSizing: 'border-box' }}
                  placeholder={t('fields.completionNotes', { defaultValue: 'Notes de complétion' }) + '...'}
                />
              </div>

              {/* Error display */}
              {updateWorkOrder.isError && (
                <div style={{ background: theme.colors.dangerLight, border: '1px solid #fca5a5', color: theme.colors.danger, padding: '0.5rem 0.75rem', borderRadius: theme.radius.md, fontSize: theme.font.sizeXs, marginTop: '0.5rem' }}>
                  Erreur lors de la sauvegarde. Veuillez réessayer.
                </div>
              )}
            </div>

            <div style={{ ...modalStyles.footer }}>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ ...buttonStyles.secondary }}
              >{tCommon('actions.cancel')}</button>
              <button
                onClick={handleEditSave}
                disabled={!editTitle.trim() || editSaving}
                style={{
                  ...buttonStyles.primary,
                  opacity: (!editTitle.trim() || editSaving) ? 0.6 : 1,
                  cursor: (!editTitle.trim() || editSaving) ? 'not-allowed' : 'pointer',
                }}
              >
                {editSaving ? tCommon('actions.saving') : `✓ ${tCommon('actions.save')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print template — invisible on screen, rendered by @media print */}
      <PrintWorkOrder wo={wo} />
    </div>
  );
}
