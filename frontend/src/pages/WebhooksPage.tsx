import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listPublishableEvents,
  listWebhooks,
  regenerateWebhookSecret,
  retryDelivery,
  triggerWebhookTest,
  updateWebhook,
  type CreateWebhookInput,
  type DeliveryRow,
  type MintedWebhook,
  type WebhookRow,
} from '../services/webhooks.service';

/**
 * Admin UI for outbound webhooks (B9).
 *
 * Route: /parametres/webhooks (ADMIN only).
 *
 * Layout mirrors ApiKeysPage: list + create modal + « reveal secret »
 * flow + soft-delete. Plus a per-endpoint delivery log drawer for
 * troubleshooting failed deliveries.
 */
export default function WebhooksPage() {
  const { t } = useTranslation('webhooks');
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [minted, setMinted] = useState<MintedWebhook | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: listWebhooks,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateWebhook(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success(t('actions.toggleSuccess'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success(t('actions.deleteSuccess'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const triggerTest = useMutation({
    mutationFn: (id: string) => triggerWebhookTest(id),
    onSuccess: () => toast.success(t('actions.testTriggered')),
    onError: (err: Error) => toast.error(err.message),
  });

  const regenerate = useMutation({
    mutationFn: (id: string) => regenerateWebhookSecret(id),
    onSuccess: (m) => setMinted(m),
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
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <Link
              to="/documentation-api"
              style={{
                fontSize: 12,
                color: theme.colors.primary,
                textDecoration: 'none',
              }}
            >
              📚 {t('docsLink')}
            </Link>
          </div>
        </div>
        <button
          style={buttonStyles.primary}
          onClick={() => setCreating(true)}
        >
          ➕ {t('actions.create')}
        </button>
      </header>

      {isLoading && <SkeletonList rows={3} />}
      {!isLoading && (!webhooks || webhooks.length === 0) && (
        <EmptyState
          icon="🔔"
          title={t('empty.title')}
          subtitle={t('empty.description')}
          actionLabel={t('actions.create')}
          onAction={() => setCreating(true)}
        />
      )}

      {!isLoading && webhooks && webhooks.length > 0 && (
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
                <th style={cellHeadStyle}>{t('table.url')}</th>
                <th style={cellHeadStyle}>{t('table.events')}</th>
                <th style={cellHeadStyle}>{t('table.status')}</th>
                <th style={cellHeadStyle}>{t('table.lastActivity')}</th>
                <th style={{ ...cellHeadStyle, textAlign: 'right' }}>
                  {t('table.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <WebhookRowView
                  key={w.id}
                  row={w}
                  onToggle={() =>
                    toggleActive.mutate({ id: w.id, isActive: !w.isActive })
                  }
                  onDelete={() => {
                    if (
                      window.confirm(
                        t('actions.deleteConfirm', { name: w.name }),
                      )
                    ) {
                      remove.mutate(w.id);
                    }
                  }}
                  onTest={() => triggerTest.mutate(w.id)}
                  onRegenerate={() => {
                    if (window.confirm(t('actions.regenerateConfirm'))) {
                      regenerate.mutate(w.id);
                    }
                  }}
                  onOpenLog={() => setDrawerId(w.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(m) => {
            setCreating(false);
            setMinted(m);
            queryClient.invalidateQueries({ queryKey: ['webhooks'] });
          }}
        />
      )}
      {minted && (
        <RevealSecretModal
          minted={minted}
          onClose={() => setMinted(null)}
        />
      )}
      {drawerId && (
        <DeliveryLogDrawer
          endpointId={drawerId}
          onClose={() => setDrawerId(null)}
        />
      )}
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────

function WebhookRowView({
  row,
  onToggle,
  onDelete,
  onTest,
  onRegenerate,
  onOpenLog,
}: {
  row: WebhookRow;
  onToggle: () => void;
  onDelete: () => void;
  onTest: () => void;
  onRegenerate: () => void;
  onOpenLog: () => void;
}) {
  const { t } = useTranslation('webhooks');
  const hostname = safeHostname(row.url);
  const lastActivity = row.lastSuccessAt ?? row.lastFailureAt ?? row.createdAt;
  return (
    <tr
      style={{
        borderTop: `1px solid ${theme.colors.border}`,
        opacity: row.isActive ? 1 : 0.55,
      }}
    >
      <td style={cellStyle}>
        <div style={{ fontWeight: 600 }}>{row.name}</div>
        <div style={{ fontSize: 11, color: theme.colors.textMuted }}>
          {row.secretPrefix}… • {row.subscribedEvents.length} evt
        </div>
      </td>
      <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 12 }}>
        {hostname}
      </td>
      <td style={cellStyle}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {row.subscribedEvents.slice(0, 3).map((e) => (
            <Badge key={e}>{e}</Badge>
          ))}
          {row.subscribedEvents.length > 3 && (
            <Badge>+{row.subscribedEvents.length - 3}</Badge>
          )}
        </div>
      </td>
      <td style={cellStyle}>
        {row.isActive ? (
          <StatusPill kind="ok">{t('status.active')}</StatusPill>
        ) : row.disabledReason ? (
          <StatusPill
            kind="danger"
            title={row.disabledReason}
          >
            {t('status.disabled')}
          </StatusPill>
        ) : (
          <StatusPill kind="muted">{t('status.paused')}</StatusPill>
        )}
        {row.consecutiveFailures > 0 && (
          <div
            style={{
              fontSize: 11,
              color: theme.colors.warning,
              marginTop: 4,
            }}
          >
            ⚠️ {row.consecutiveFailures} {t('status.consecutiveFailures')}
          </div>
        )}
      </td>
      <td style={{ ...cellStyle, fontSize: 12, color: theme.colors.textMuted }}>
        {formatDate(lastActivity)}
      </td>
      <td style={{ ...cellStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button style={rowBtnStyle} onClick={onOpenLog}>
          📜 {t('actions.log')}
        </button>
        <button style={rowBtnStyle} onClick={onTest} disabled={!row.isActive}>
          🧪 {t('actions.test')}
        </button>
        <button style={rowBtnStyle} onClick={onRegenerate}>
          🔄 {t('actions.regenerate')}
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

// ─── Create modal ─────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (m: MintedWebhook) => void;
}) {
  const { t } = useTranslation('webhooks');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: publishable } = useQuery({
    queryKey: ['webhooks', 'publishable-events'],
    queryFn: listPublishableEvents,
    staleTime: 5 * 60_000,
  });

  const create = useMutation({
    mutationFn: (input: CreateWebhookInput) => createWebhook(input),
    onSuccess: onCreated,
    onError: (err: Error) => toast.error(err.message),
  });

  const groups = groupByModule(publishable ?? []);

  function toggleEvent(name: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleGroup(module: string, events: string[]): void {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = events.every((e) => next.has(e));
      if (allIn) events.forEach((e) => next.delete(e));
      else events.forEach((e) => next.add(e));
      return next;
    });
  }

  function submit(): void {
    if (!name.trim() || !url.trim() || selected.size === 0) return;
    create.mutate({
      name: name.trim(),
      url: url.trim(),
      subscribedEvents: [...selected],
    });
  }

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: 0 }}>➕ {t('create.title')}</h2>
      <p style={{ color: theme.colors.textMuted, fontSize: 13 }}>
        {t('create.subtitle')}
      </p>
      <label style={formStyles.label}>{t('create.nameLabel')}</label>
      <input
        style={formStyles.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('create.namePlaceholder')}
      />
      <label style={formStyles.label}>{t('create.urlLabel')}</label>
      <input
        style={formStyles.input}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
      />
      <label style={formStyles.label}>{t('create.eventsLabel')}</label>
      <div
        style={{
          maxHeight: 240,
          overflowY: 'auto',
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 6,
          padding: 12,
        }}
      >
        {Object.entries(groups).map(([module, events]) => (
          <div key={module} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              <label>
                <input
                  type="checkbox"
                  checked={events.every((e) => selected.has(e))}
                  onChange={() => toggleGroup(module, events)}
                />{' '}
                {module}
              </label>
            </div>
            <div style={{ paddingLeft: 20, fontSize: 12 }}>
              {events.map((evt) => (
                <label
                  key={evt}
                  style={{ display: 'block', marginBottom: 2 }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(evt)}
                    onChange={() => toggleEvent(evt)}
                  />{' '}
                  <code>{evt}</code>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={buttonStyles.secondary} onClick={onClose}>
          {t('actions.cancel')}
        </button>
        <button
          style={buttonStyles.primary}
          onClick={submit}
          disabled={
            !name.trim() ||
            !url.trim() ||
            selected.size === 0 ||
            create.isPending
          }
        >
          {create.isPending
            ? t('actions.creating')
            : t('actions.confirmCreate')}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Reveal secret modal ──────────────────────────────────────────

function RevealSecretModal({
  minted,
  onClose,
}: {
  minted: MintedWebhook;
  onClose: () => void;
}) {
  const { t } = useTranslation('webhooks');
  const [copied, setCopied] = useState(false);
  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: 0 }}>🔑 {t('reveal.title')}</h2>
      <div
        style={{
          background: '#fef3c7',
          border: `1px solid ${theme.colors.warning}`,
          borderRadius: 6,
          padding: 12,
          fontSize: 13,
          marginTop: 12,
        }}
      >
        ⚠️ <strong>{t('reveal.warningTitle')}</strong>
        <div>{t('reveal.warningBody')}</div>
      </div>
      <div
        style={{
          marginTop: 12,
          padding: 12,
          background: theme.colors.surfaceAlt,
          fontFamily: 'monospace',
          fontSize: 12,
          borderRadius: 6,
          wordBreak: 'break-all',
        }}
      >
        {minted.plaintext}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          style={buttonStyles.secondary}
          onClick={() => {
            navigator.clipboard.writeText(minted.plaintext);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          📋 {copied ? t('reveal.copied') : t('reveal.copy')}
        </button>
        <button style={buttonStyles.primary} onClick={onClose}>
          {t('reveal.saved')}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Delivery log drawer ──────────────────────────────────────────

function DeliveryLogDrawer({
  endpointId,
  onClose,
}: {
  endpointId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('webhooks');
  const queryClient = useQueryClient();
  const { data: deliveries, isLoading } = useQuery({
    queryKey: ['webhooks', 'deliveries', endpointId],
    queryFn: () => listDeliveries(endpointId, 50),
    refetchInterval: 5000, // live-ish updates while the drawer is open
  });

  const retry = useMutation({
    mutationFn: (deliveryId: string) => retryDelivery(deliveryId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['webhooks', 'deliveries', endpointId],
      });
      toast.success(t('actions.retryQueued'));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <ModalShell onClose={onClose} width={720}>
      <h2 style={{ margin: 0 }}>📜 {t('log.title')}</h2>
      <p style={{ color: theme.colors.textMuted, fontSize: 13 }}>
        {t('log.subtitle')}
      </p>
      {isLoading && <SkeletonList rows={5} />}
      {!isLoading && (!deliveries || deliveries.length === 0) && (
        <EmptyState
          icon="📭"
          title={t('log.empty')}
          subtitle={t('log.emptyDescription')}
        />
      )}
      {!isLoading && deliveries && deliveries.length > 0 && (
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {deliveries.map((d) => (
            <DeliveryRowView
              key={d.id}
              row={d}
              onRetry={() => retry.mutate(d.id)}
            />
          ))}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button style={buttonStyles.secondary} onClick={onClose}>
          {t('actions.close')}
        </button>
      </div>
    </ModalShell>
  );
}

function DeliveryRowView({
  row,
  onRetry,
}: {
  row: DeliveryRow;
  onRetry: () => void;
}) {
  const { t } = useTranslation('webhooks');
  return (
    <div
      style={{
        padding: 12,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <StatusPill kind={statusKind(row.status)}>
            {t(`log.status.${row.status}`, { defaultValue: row.status })}
          </StatusPill>
          <span
            style={{
              marginLeft: 8,
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          >
            {row.eventName}
          </span>
          {row.lastResponseStatus !== null && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                color: theme.colors.textMuted,
              }}
            >
              HTTP {row.lastResponseStatus}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: theme.colors.textMuted }}>
          {formatDate(row.lastAttemptedAt ?? row.createdAt)}
        </div>
      </div>
      <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>
        {t('log.attempt')} #{row.attemptCount}
        {row.nextRetryAt && ` • ${t('log.nextRetry')}: ${formatDate(row.nextRetryAt)}`}
      </div>
      {row.lastError && (
        <pre
          style={{
            marginTop: 6,
            fontSize: 11,
            color: theme.colors.danger,
            whiteSpace: 'pre-wrap',
          }}
        >
          {row.lastError}
        </pre>
      )}
      {row.lastResponseBodyExcerpt && (
        <pre
          style={{
            marginTop: 6,
            fontSize: 11,
            color: theme.colors.textMuted,
            background: theme.colors.surfaceAlt,
            padding: 8,
            borderRadius: 4,
            overflow: 'auto',
            maxHeight: 100,
          }}
        >
          {row.lastResponseBodyExcerpt}
        </pre>
      )}
      {(row.status === 'failed' ||
        row.status === 'abandoned') && (
        <button style={{ ...rowBtnStyle, marginTop: 6 }} onClick={onRetry}>
          🔁 {t('actions.retry')}
        </button>
      )}
    </div>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────

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
  title,
}: {
  children: React.ReactNode;
  kind: 'ok' | 'muted' | 'danger' | 'warning';
  title?: string;
}) {
  const colors: Record<string, { bg: string; fg: string }> = {
    ok: { bg: '#d1fae5', fg: '#065f46' },
    muted: { bg: '#e5e7eb', fg: '#374151' },
    danger: { bg: '#fee2e2', fg: '#991b1b' },
    warning: { bg: '#fef3c7', fg: '#92400e' },
  };
  const c = colors[kind];
  return (
    <span
      title={title}
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

// ─── Helpers ──────────────────────────────────────────────────────

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function groupByModule(events: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const evt of events) {
    const [module] = evt.split('.');
    if (!groups[module]) groups[module] = [];
    groups[module].push(evt);
  }
  return groups;
}

function statusKind(
  status: DeliveryRow['status'],
): 'ok' | 'muted' | 'danger' | 'warning' {
  switch (status) {
    case 'succeeded':
      return 'ok';
    case 'abandoned':
    case 'failed':
      return 'danger';
    case 'pending':
    case 'dispatching':
      return 'warning';
    default:
      return 'muted';
  }
}
