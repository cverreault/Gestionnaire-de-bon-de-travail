import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  theme,
  cardStyles,
  layoutStyles,
  buttonStyles,
  formStyles,
} from '../theme';
import { toast } from '../context/toast.store';
import EmptyState from '../components/EmptyState';
import SkeletonList from '../components/SkeletonList';
import {
  createAlertRule,
  deleteAlertRule,
  listAlertRules,
  listPublishableEvents,
  updateAlertRule,
  type AlertRuleRow,
  type CreateAlertRuleInput,
} from '../services/alerts.service';
import { getTaskTypes, getClientTypes, getAddressTypes } from '../services/settings.service';
import { listTemplates } from '../services/templates.service';

/**
 * Admin UI for configurable alert rules (B10).
 *
 * Route: /parametres/alertes (ADMIN only).
 *
 * Layout mirrors WebhooksPage: list + create/edit modal. Guided form with
 * live template preview so admins see the rendered output before saving.
 */

interface ChannelMeta {
  key: string;
  label: string;
  icon: string;
  badge?: string;
}

const CHANNELS: ChannelMeta[] = [
  { key: 'inApp', label: 'In-app', icon: '🔔' },
  { key: 'email', label: 'Email', icon: '✉️' },
  { key: 'push', label: 'Push', icon: '📱' },
  { key: 'sms', label: 'SMS', icon: '💬', badge: 'v1.1' },
];

const ROLES = ['ADMIN', 'DISPATCHER', 'TECHNICIAN'] as const;

const PRIORITY_OPTIONS = [
  { key: '0', label: 'Normale' },
  { key: '1', label: 'Élevée' },
  { key: '2', label: 'Urgente' },
];

const FAKE_CONTEXT = {
  workOrder: {
    referenceNumber: 'STD-20260702-0042',
    title: 'Fuite chauffe-eau chambre 3',
    priority: 2,
    negativeReason: 'Pièce en rupture de stock',
  },
  transition: { fromLabel: 'En cours', toLabel: 'Complété négatif' },
  technician: { name: 'Marie Tremblay' },
  client: { name: 'Camping Plein Bois' },
  tenant: { name: 'Camping Plein Bois' },
};

export default function AlertsPage() {
  const { t } = useTranslation('alerts');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AlertRuleRow | null | undefined>(undefined);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: listAlertRules,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAlertRule(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(t('actions.toggleSuccess'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAlertRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(t('actions.deleteSuccess'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div style={layoutStyles.page}>
      <header
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>🔔 {t('title')}</h1>
          <p
            style={{
              color: theme.colors.textMuted,
              margin: '4px 0 0',
              fontSize: 13,
              maxWidth: 720,
              lineHeight: 1.5,
            }}
          >
            {t('subtitle')}
          </p>
        </div>
        <button style={buttonStyles.primary} onClick={() => setEditing(null)}>
          ➕ {t('actions.create')}
        </button>
      </header>

      {isLoading && <SkeletonList rows={3} />}
      {!isLoading && (!rules || rules.length === 0) && (
        <EmptyState
          icon="🔔"
          title={t('empty.title')}
          subtitle={t('empty.description')}
          actionLabel={t('actions.create')}
          onAction={() => setEditing(null)}
        />
      )}

      {!isLoading && rules && rules.length > 0 && (
        <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead
              style={{
                background: theme.colors.surfaceAlt,
                fontSize: 12,
                color: theme.colors.textMuted,
              }}
            >
              <tr>
                <th style={cellHeadStyle}>{t('table.name')}</th>
                <th style={cellHeadStyle}>{t('table.event')}</th>
                <th style={cellHeadStyle}>{t('table.recipients')}</th>
                <th style={cellHeadStyle}>{t('table.channels')}</th>
                <th style={cellHeadStyle}>{t('table.status')}</th>
                <th style={{ ...cellHeadStyle, textAlign: 'right' }}>
                  {t('table.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <RuleRow
                  key={r.id}
                  row={r}
                  onEdit={() => setEditing(r)}
                  onToggle={() =>
                    toggleActive.mutate({ id: r.id, isActive: !r.isActive })
                  }
                  onDelete={() => {
                    if (
                      window.confirm(t('actions.deleteConfirm', { name: r.name }))
                    ) {
                      remove.mutate(r.id);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <EditModal
          existing={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
          }}
        />
      )}
    </div>
  );
}

function RuleRow({
  row,
  onEdit,
  onToggle,
  onDelete,
}: {
  row: AlertRuleRow;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('alerts');
  const recipients: string[] = [];
  if (row.recipientRoles.length > 0) recipients.push(...row.recipientRoles);
  if (row.recipientAssignedTechnician) recipients.push(t('recipients.assignedTech'));
  if (row.recipientClient) recipients.push(t('recipients.client'));
  if (row.recipientUserIds.length > 0)
    recipients.push(`+${row.recipientUserIds.length} ${t('recipients.users')}`);

  return (
    <tr
      style={{
        borderTop: `1px solid ${theme.colors.border}`,
        opacity: row.isActive ? 1 : 0.55,
      }}
    >
      <td style={cellStyle}>
        <div style={{ fontWeight: 600 }}>{row.name}</div>
        {row.description && (
          <div style={{ fontSize: 11, color: theme.colors.textMuted }}>
            {row.description}
          </div>
        )}
      </td>
      <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 11 }}>
        {row.eventName.split('.').pop()}
      </td>
      <td style={cellStyle}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {recipients.map((r, i) => (
            <Badge key={`${r}-${i}`}>{r}</Badge>
          ))}
        </div>
      </td>
      <td style={cellStyle}>
        {row.channels.map((c) => {
          const meta = CHANNELS.find((x) => x.key === c);
          return meta ? (
            <span
              key={c}
              style={{ marginRight: 4 }}
              title={meta.label}
            >
              {meta.icon}
            </span>
          ) : null;
        })}
      </td>
      <td style={cellStyle}>
        {row.isActive ? (
          <StatusPill kind="ok">{t('status.active')}</StatusPill>
        ) : (
          <StatusPill kind="muted">{t('status.paused')}</StatusPill>
        )}
      </td>
      <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button style={rowBtnStyle} onClick={onEdit}>
          ✏️ {t('actions.edit')}
        </button>
        <button style={rowBtnStyle} onClick={onToggle}>
          {row.isActive ? `⏸ ${t('actions.pause')}` : `▶️ ${t('actions.resume')}`}
        </button>
        <button
          style={{ ...rowBtnStyle, color: theme.colors.danger }}
          onClick={onDelete}
        >
          🗑
        </button>
      </td>
    </tr>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────

function EditModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: AlertRuleRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('alerts');
  const isNew = existing === null;

  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [eventName, setEventName] = useState(
    existing?.eventName ?? 'workOrders.workOrder.statusChanged',
  );
  const [priorityIn, setPriorityIn] = useState<Set<string>>(
    new Set(existing?.priorityIn ?? []),
  );
  const [taskTypeIds, setTaskTypeIds] = useState<Set<string>>(
    new Set(existing?.taskTypeIds ?? []),
  );
  const [templateIds, setTemplateIds] = useState<Set<string>>(
    new Set(existing?.templateIds ?? []),
  );
  const [clientTypeCodes, setClientTypeCodes] = useState<Set<string>>(
    new Set(existing?.clientTypeCodes ?? []),
  );
  const [addressTypeCodes, setAddressTypeCodes] = useState<Set<string>>(
    new Set(existing?.addressTypeCodes ?? []),
  );
  const [recipientRoles, setRecipientRoles] = useState<Set<string>>(
    new Set(existing?.recipientRoles ?? []),
  );
  const [recipientAssignedTechnician, setRecipientAssignedTechnician] =
    useState(existing?.recipientAssignedTechnician ?? false);
  const [recipientClient, setRecipientClient] = useState(
    existing?.recipientClient ?? false,
  );
  const [channels, setChannels] = useState<Set<string>>(
    new Set(existing?.channels ?? ['inApp']),
  );
  const [titleTemplate, setTitleTemplate] = useState(
    existing?.titleTemplate ??
      'BT {{workOrder.referenceNumber}} — {{transition.toLabel}}',
  );
  const [bodyTemplate, setBodyTemplate] = useState(
    existing?.bodyTemplate ??
      'Client: {{client.name}}\nTechnicien: {{technician.name}}',
  );
  const [clientTitleTemplate, setClientTitleTemplate] = useState(
    existing?.clientTitleTemplate ?? '',
  );
  const [clientBodyTemplate, setClientBodyTemplate] = useState(
    existing?.clientBodyTemplate ?? '',
  );

  const { data: events } = useQuery({
    queryKey: ['alerts', 'publishable-events'],
    queryFn: listPublishableEvents,
    staleTime: 5 * 60_000,
  });

  // Reference lists for the whitelist pickers. Each returns an axios envelope
  // → data.data.data because of the double-wrapped ApiResponse shape used
  // across the settings/templates endpoints.
  const { data: taskTypes } = useQuery({
    queryKey: ['alerts', 'task-types'],
    queryFn: async () => {
      const res = await getTaskTypes(true);
      return unwrap<Array<{ id: string; name: string }>>(res.data);
    },
    staleTime: 60_000,
  });
  const { data: templates } = useQuery({
    queryKey: ['alerts', 'templates'],
    queryFn: async () => {
      const res = await listTemplates(false);
      return unwrap<Array<{ id: string; name: string }>>(res.data);
    },
    staleTime: 60_000,
  });
  const { data: addressTypes } = useQuery({
    queryKey: ['alerts', 'address-types'],
    queryFn: async () => {
      const res = await getAddressTypes(true);
      return unwrap<Array<{ id: string; name: string; code: string }>>(res.data);
    },
    staleTime: 60_000,
  });
  const { data: clientTypesFromDb } = useQuery({
    queryKey: ['alerts', 'client-types'],
    queryFn: async () => {
      const res = await getClientTypes(true);
      return unwrap<Array<{ id: string; name: string; code: string }>>(res.data);
    },
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (input: CreateAlertRuleInput) =>
      isNew
        ? createAlertRule(input)
        : updateAlertRule(existing!.id, input),
    onSuccess: () => {
      toast.success(isNew ? t('actions.createSuccess') : t('actions.updateSuccess'));
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const titlePreview = useMemo(
    () => renderPreview(titleTemplate, FAKE_CONTEXT),
    [titleTemplate],
  );
  const bodyPreview = useMemo(
    () => renderPreview(bodyTemplate, FAKE_CONTEXT),
    [bodyTemplate],
  );

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, v: string) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  }

  function submit(): void {
    if (!name.trim() || !titleTemplate.trim() || !bodyTemplate.trim() || channels.size === 0) {
      toast.error(t('validation.required'));
      return;
    }
    if (recipientClient && (!clientTitleTemplate.trim() || !clientBodyTemplate.trim())) {
      toast.error(t('validation.clientTemplateRequired'));
      return;
    }
    save.mutate({
      name: name.trim(),
      description: description.trim(),
      eventName,
      priorityIn: [...priorityIn],
      taskTypeIds: [...taskTypeIds],
      templateIds: [...templateIds],
      clientTypeCodes: [...clientTypeCodes],
      addressTypeCodes: [...addressTypeCodes],
      recipientRoles: [...recipientRoles],
      recipientAssignedTechnician,
      recipientClient,
      channels: [...channels],
      titleTemplate,
      bodyTemplate,
      clientTitleTemplate: recipientClient ? clientTitleTemplate : null,
      clientBodyTemplate: recipientClient ? clientBodyTemplate : null,
    });
  }

  return (
    <ModalShell onClose={onClose} width={720}>
      <h2 style={{ margin: 0 }}>
        {isNew ? `➕ ${t('edit.createTitle')}` : `✏️ ${t('edit.editTitle')}`}
      </h2>

      <label style={formStyles.label}>{t('edit.nameLabel')}</label>
      <input
        style={formStyles.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('edit.namePlaceholder')}
      />

      <label style={formStyles.label}>{t('edit.descriptionLabel')}</label>
      <input
        style={formStyles.input}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label style={formStyles.label}>{t('edit.eventLabel')}</label>
      <select
        style={formStyles.input}
        value={eventName}
        onChange={(e) => setEventName(e.target.value)}
      >
        {(events ?? []).map((e) => (
          <option key={e} value={e}>
            {t(`events.${e}`, { defaultValue: e })}
          </option>
        ))}
      </select>

      <FieldGroup label={t('edit.filtersLabel')}>
        <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 8 }}>
          {t('edit.filtersHint')}
        </div>

        <MultiSelectFilter
          label={t('edit.priorityLabel')}
          options={PRIORITY_OPTIONS.map((p) => ({ key: p.key, label: p.label }))}
          selected={priorityIn}
          onToggle={(v) => toggle(priorityIn, setPriorityIn, v)}
        />

        <MultiSelectFilter
          label={t('edit.taskTypesLabel')}
          options={(taskTypes ?? []).map((tt) => ({ key: tt.id, label: tt.name }))}
          selected={taskTypeIds}
          onToggle={(v) => toggle(taskTypeIds, setTaskTypeIds, v)}
          emptyHint={t('edit.taskTypesEmpty')}
        />

        <MultiSelectFilter
          label={t('edit.templatesLabel')}
          options={(templates ?? []).map((tp) => ({ key: tp.id, label: tp.name }))}
          selected={templateIds}
          onToggle={(v) => toggle(templateIds, setTemplateIds, v)}
          emptyHint={t('edit.templatesEmpty')}
        />

        <MultiSelectFilter
          label={t('edit.clientTypesLabel')}
          options={(clientTypesFromDb ?? []).map((ct) => ({
            key: ct.code,
            label: ct.name,
          }))}
          selected={clientTypeCodes}
          onToggle={(v) => toggle(clientTypeCodes, setClientTypeCodes, v)}
          emptyHint={t('edit.clientTypesEmpty')}
        />

        <MultiSelectFilter
          label={t('edit.addressTypesLabel')}
          options={(addressTypes ?? []).map((at) => ({
            key: at.code,
            label: at.name,
          }))}
          selected={addressTypeCodes}
          onToggle={(v) => toggle(addressTypeCodes, setAddressTypeCodes, v)}
          emptyHint={t('edit.addressTypesEmpty')}
        />
      </FieldGroup>

      <FieldGroup label={t('edit.recipientsLabel')}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {ROLES.map((role) => (
            <label key={role} style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={recipientRoles.has(role)}
                onChange={() => toggle(recipientRoles, setRecipientRoles, role)}
              />{' '}
              {t(`roles.${role}`, { defaultValue: role })}
            </label>
          ))}
        </div>
        <label style={{ ...checkboxLabelStyle, display: 'block', marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={recipientAssignedTechnician}
            onChange={(e) => setRecipientAssignedTechnician(e.target.checked)}
          />{' '}
          👷 {t('recipients.assignedTech')}
        </label>
        <label style={{ ...checkboxLabelStyle, display: 'block' }}>
          <input
            type="checkbox"
            checked={recipientClient}
            onChange={(e) => setRecipientClient(e.target.checked)}
          />{' '}
          🧑 {t('recipients.client')}
        </label>
      </FieldGroup>

      <FieldGroup label={t('edit.channelsLabel')}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CHANNELS.map((c) => (
            <label key={c.key} style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={channels.has(c.key)}
                onChange={() => toggle(channels, setChannels, c.key)}
              />{' '}
              {c.icon} {c.label}
              {c.badge && (
                <span
                  style={{
                    marginLeft: 4,
                    background: 'var(--c-warningLight)',
                    color: 'var(--c-warningBadgeText)',
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  {c.badge}
                </span>
              )}
            </label>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label={t('edit.templateLabel')}>
        <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 6 }}>
          {t('edit.templateHint')}
        </div>
        <label style={{ ...formStyles.label, marginTop: 0 }}>
          {t('edit.titleField')}
        </label>
        <input
          style={formStyles.input}
          value={titleTemplate}
          onChange={(e) => setTitleTemplate(e.target.value)}
        />
        <label style={formStyles.label}>{t('edit.bodyField')}</label>
        <textarea
          style={{ ...formStyles.input, minHeight: 80, fontFamily: 'inherit' }}
          value={bodyTemplate}
          onChange={(e) => setBodyTemplate(e.target.value)}
        />
        <div
          style={{
            background: theme.colors.surfaceAlt,
            border: `1px dashed ${theme.colors.border}`,
            borderRadius: 6,
            padding: 12,
            marginTop: 8,
          }}
        >
          <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 4 }}>
            {t('edit.previewLabel')}
          </div>
          <div style={{ fontWeight: 600 }}>{titlePreview}</div>
          <pre
            style={{
              margin: '4px 0 0',
              fontFamily: 'inherit',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}
          >
            {bodyPreview}
          </pre>
        </div>
      </FieldGroup>

      {recipientClient && (
        <FieldGroup label={t('edit.clientTemplateLabel')}>
          <div style={{ fontSize: 11, color: theme.colors.textMuted, marginBottom: 6 }}>
            {t('edit.clientTemplateHint')}
          </div>
          <label style={{ ...formStyles.label, marginTop: 0 }}>
            {t('edit.titleField')}
          </label>
          <input
            style={formStyles.input}
            value={clientTitleTemplate}
            onChange={(e) => setClientTitleTemplate(e.target.value)}
            placeholder={t('edit.clientTitlePlaceholder')}
          />
          <label style={formStyles.label}>{t('edit.bodyField')}</label>
          <textarea
            style={{ ...formStyles.input, minHeight: 60, fontFamily: 'inherit' }}
            value={clientBodyTemplate}
            onChange={(e) => setClientBodyTemplate(e.target.value)}
            placeholder={t('edit.clientBodyPlaceholder')}
          />
        </FieldGroup>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={buttonStyles.secondary} onClick={onClose}>
          {t('actions.cancel')}
        </button>
        <button
          style={buttonStyles.primary}
          onClick={submit}
          disabled={save.isPending}
        >
          {save.isPending
            ? t('actions.saving')
            : isNew
              ? t('actions.confirmCreate')
              : t('actions.confirmUpdate')}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────

function MultiSelectFilter({
  label,
  options,
  selected,
  onToggle,
  emptyHint,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  emptyHint?: string;
}) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      {options.length === 0 ? (
        <div style={{ fontSize: 11, color: theme.colors.textMuted, fontStyle: 'italic' }}>
          {emptyHint ?? '—'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {options.map((o) => (
            <label key={o.key} style={{ ...checkboxLabelStyle, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={selected.has(o.key)}
                onChange={() => onToggle(o.key)}
              />{' '}
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Peel the layer TaskMgr's TransformInterceptor adds. Most legacy settings
 * endpoints return `{ success, data: X }`; a few return the raw payload —
 * unwrap handles both.
 */
function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: theme.colors.text,
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ModalShell({
  children,
  onClose,
  width,
}: {
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          ...cardStyles.card,
          padding: 24,
          maxWidth: width ?? 520,
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 6px',
        background: theme.colors.surfaceAlt,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 4,
        fontSize: 10,
        fontFamily: 'monospace',
      }}
    >
      {children}
    </span>
  );
}

function StatusPill({
  children,
  kind,
}: {
  children: React.ReactNode;
  kind: 'ok' | 'muted' | 'danger';
}) {
  const colors: Record<string, { bg: string; fg: string }> = {
    ok: { bg: '#d1fae5', fg: 'var(--c-successBadgeText)' },
    muted: { bg: '#e5e7eb', fg: '#374151' },
    danger: { bg: '#fee2e2', fg: 'var(--c-dangerBadgeText)' },
  };
  const c = colors[kind];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        background: c.bg,
        color: c.fg,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

const cellHeadStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
};

const cellStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  verticalAlign: 'top',
};

const rowBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 11,
  cursor: 'pointer',
  marginLeft: 4,
};

const checkboxLabelStyle: React.CSSProperties = {
  fontSize: 13,
  cursor: 'pointer',
};

/** Client-side preview — mirrors the backend {{path.to.field}} rules. */
function renderPreview(template: string, context: unknown): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const parts = String(path).split('.');
    let current: unknown = context;
    for (const key of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return '';
      }
      current = (current as Record<string, unknown>)[key];
    }
    if (current === null || current === undefined) return '';
    if (typeof current === 'object') {
      try {
        return JSON.stringify(current);
      } catch {
        return '';
      }
    }
    return String(current);
  });
}
