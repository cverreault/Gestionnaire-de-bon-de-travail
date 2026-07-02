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
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRow,
  type ApiKeyScope,
  type MintedApiKey,
} from '../services/api-keys.service';

/**
 * ADMIN self-serve API-key management (B8).
 *
 * Table of existing keys + a "Create" modal that transitions to a
 * "reveal" screen displaying the plaintext ONCE. Revoking prompts for
 * confirmation via a modal instead of the native `confirm()` for a
 * cleaner UX and consistent styling.
 */
export default function ApiKeysPage() {
  const { t } = useTranslation('apiKeys');
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [minted, setMinted] = useState<MintedApiKey | null>(null);
  const [toRevoke, setToRevoke] = useState<ApiKeyRow | null>(null);

  const query = useQuery({
    queryKey: ['tenant', 'api-keys'],
    queryFn: listApiKeys,
  });

  const revoke = useMutation({
    mutationFn: (row: ApiKeyRow) => revokeApiKey(row.id),
    onSuccess: (_, row) => {
      qc.invalidateQueries({ queryKey: ['tenant', 'api-keys'] });
      toast.success(t('toasts.revoked', { name: row.name }));
      setToRevoke(null);
    },
    onError: (err) => {
      const msg = errorMessage(err);
      toast.error(t('toasts.revokeFailed', { msg }));
    },
  });

  return (
    <div style={layoutStyles.page}>
      <header
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>{t('title')}</h1>
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
              {t('docsLink')}
            </Link>
            <a
              href="https://github.com/anthropics/taskmgr/blob/main/docs/api/public-api-v1.md"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                color: theme.colors.primary,
                textDecoration: 'none',
              }}
            >
              {t('gettingStartedLink')}
            </a>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={buttonStyles.primary}
        >
          {t('createButton')}
        </button>
      </header>

      {query.isLoading && <SkeletonList rows={4} />}
      {query.error && (
        <p style={{ color: theme.colors.danger }}>{t('loadFailed')}</p>
      )}

      {query.data && query.data.data.length === 0 && (
        <EmptyState
          icon="🔑"
          title={t('empty')}
          subtitle={t('emptySubtitle')}
          actionLabel={t('createButton')}
          onAction={() => setShowCreate(true)}
        />
      )}

      {query.data && query.data.data.length > 0 && (
        <ApiKeysTable rows={query.data.data} onRevoke={(r) => setToRevoke(r)} />
      )}

      {showCreate && !minted && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(k) => setMinted(k)}
        />
      )}
      {minted && (
        <RevealModal
          minted={minted}
          onClose={() => {
            setMinted(null);
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['tenant', 'api-keys'] });
          }}
        />
      )}
      {toRevoke && (
        <RevokeModal
          row={toRevoke}
          onCancel={() => setToRevoke(null)}
          onConfirm={() => revoke.mutate(toRevoke)}
          isPending={revoke.isPending}
        />
      )}
    </div>
  );
}

// ─── Table ─────────────────────────────────────────────────────────

function ApiKeysTable({
  rows,
  onRevoke,
}: {
  rows: ApiKeyRow[];
  onRevoke: (r: ApiKeyRow) => void;
}) {
  const { t, i18n } = useTranslation('apiKeys');
  const dateFmt = new Intl.DateTimeFormat(
    i18n.language === 'en' ? 'en-CA' : 'fr-CA',
    { year: 'numeric', month: 'short', day: 'numeric' },
  );
  return (
    <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead style={{ background: theme.colors.surfaceAlt }}>
          <tr>
            <Th>{t('columns.name')}</Th>
            <Th>{t('columns.prefix')}</Th>
            <Th>{t('columns.scope')}</Th>
            <Th>{t('columns.created')}</Th>
            <Th>{t('columns.lastUsed')}</Th>
            <Th>{t('columns.expires')}</Th>
            <Th>{t('columns.actions')}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              style={{
                borderTop: `1px solid ${theme.colors.border}`,
                opacity: r.revokedAt ? 0.5 : 1,
              }}
            >
              <td style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                {r.revokedAt && (
                  <span
                    style={{
                      fontSize: 10,
                      color: theme.colors.danger,
                      fontWeight: 700,
                    }}
                  >
                    {t('status.revoked')}
                  </span>
                )}
              </td>
              <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                {r.keyPrefix}…
              </td>
              <td style={{ padding: '10px 12px' }}>
                <ScopePill scope={r.scope} />
              </td>
              <td style={{ padding: '10px 12px', color: theme.colors.textMuted }}>
                {dateFmt.format(new Date(r.createdAt))}
              </td>
              <td style={{ padding: '10px 12px', color: theme.colors.textMuted }}>
                {r.lastUsedAt
                  ? dateFmt.format(new Date(r.lastUsedAt))
                  : t('status.never')}
              </td>
              <td style={{ padding: '10px 12px', color: theme.colors.textMuted }}>
                {r.expiresAt
                  ? dateFmt.format(new Date(r.expiresAt))
                  : t('status.noExpiry')}
              </td>
              <td style={{ padding: '10px 12px' }}>
                {!r.revokedAt && (
                  <button
                    onClick={() => onRevoke(r)}
                    style={{
                      ...buttonStyles.secondary,
                      color: theme.colors.danger,
                      fontSize: 12,
                      padding: '4px 8px',
                    }}
                  >
                    {t('actions.revoke')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScopePill({ scope }: { scope: ApiKeyScope }) {
  const { t } = useTranslation('apiKeys');
  const style = {
    'read-only': { bg: theme.colors.surfaceAlt, fg: theme.colors.textMuted, label: t('scope.readOnly') },
    'read-write': { bg: 'rgba(59, 130, 246, 0.15)', fg: theme.colors.primary, label: t('scope.readWrite') },
    admin: { bg: 'rgba(220, 38, 38, 0.15)', fg: theme.colors.danger, label: t('scope.admin') },
  }[scope];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 999,
        background: style.bg,
        color: style.fg,
      }}
    >
      {style.label}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: theme.colors.textMuted,
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  );
}

// ─── Create modal ──────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (k: MintedApiKey) => void;
}) {
  const { t } = useTranslation('apiKeys');
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiKeyScope>('read-write');
  const [expiresAt, setExpiresAt] = useState('');

  const create = useMutation({
    mutationFn: () =>
      createApiKey({
        name: name.trim(),
        scope,
        expiresAt: expiresAt || undefined,
      }),
    onSuccess: (k) => {
      toast.success(t('toasts.created', { name: k.name }));
      onCreated(k);
    },
    onError: (err) => {
      const msg = errorMessage(err);
      toast.error(t('toasts.createFailed', { msg }));
    },
  });

  const canSubmit = name.trim().length > 0 && !create.isPending;

  return (
    <ModalShell onClose={onClose} width={520}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>
        {t('createModal.title')}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={fieldStyle}>
          <span style={labelStyle}>{t('createModal.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('createModal.namePlaceholder')}
            style={formStyles.input}
            autoFocus
          />
        </label>

        <div>
          <span style={labelStyle}>{t('createModal.scope')}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <ScopeRadio
              value="read-only"
              checked={scope === 'read-only'}
              onChange={() => setScope('read-only')}
              label={t('scope.readOnly')}
              hint={t('createModal.scopeReadOnly')}
            />
            <ScopeRadio
              value="read-write"
              checked={scope === 'read-write'}
              onChange={() => setScope('read-write')}
              label={t('scope.readWrite')}
              hint={t('createModal.scopeReadWrite')}
            />
            <ScopeRadio
              value="admin"
              checked={scope === 'admin'}
              onChange={() => setScope('admin')}
              label={t('scope.admin')}
              hint={t('createModal.scopeAdmin')}
            />
          </div>
        </div>

        <label style={fieldStyle}>
          <span style={labelStyle}>{t('createModal.expiresAt')}</span>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={formStyles.input}
          />
          <span
            style={{
              fontSize: 11,
              color: theme.colors.textMuted,
              marginTop: 4,
            }}
          >
            {t('createModal.expiresAtHint')}
          </span>
        </label>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 20,
        }}
      >
        <button onClick={onClose} style={buttonStyles.secondary}>
          {t('createModal.cancel')}
        </button>
        <button
          onClick={() => create.mutate()}
          disabled={!canSubmit}
          style={{
            ...buttonStyles.primary,
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {create.isPending ? t('createModal.submitting') : t('createModal.submit')}
        </button>
      </div>
    </ModalShell>
  );
}

function ScopeRadio({
  value,
  checked,
  onChange,
  label,
  hint,
}: {
  value: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 8,
        padding: 10,
        borderRadius: 6,
        border: `1px solid ${checked ? theme.colors.primary : theme.colors.border}`,
        background: checked ? theme.colors.surfaceAlt : theme.colors.surface,
        cursor: 'pointer',
      }}
    >
      <input
        type="radio"
        name="scope"
        value={value}
        checked={checked}
        onChange={onChange}
        style={{ marginTop: 2 }}
      />
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
          {hint}
        </div>
      </div>
    </label>
  );
}

// ─── Reveal modal — shows the plaintext ONCE ───────────────────────

function RevealModal({
  minted,
  onClose,
}: {
  minted: MintedApiKey;
  onClose: () => void;
}) {
  const { t } = useTranslation('apiKeys');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(minted.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers block programmatic clipboard access without user
      // gesture — the input's `select()` fallback still lets the user copy.
    }
  };

  return (
    <ModalShell onClose={onClose} width={560}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>
        {t('revealModal.title')}
      </h2>
      <div
        role="alert"
        style={{
          padding: '10px 12px',
          borderRadius: 6,
          background: 'rgba(245, 158, 11, 0.15)',
          border: `1px solid ${theme.colors.warning}`,
          color: theme.colors.warning,
          fontSize: 12,
          marginBottom: 16,
          fontWeight: 600,
        }}
      >
        {t('revealModal.warning')}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          readOnly
          value={minted.plaintext}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            ...formStyles.input,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        />
        <button
          onClick={copy}
          style={{
            ...buttonStyles.secondary,
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? t('revealModal.copied') : t('revealModal.copy')}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 20,
        }}
      >
        <button onClick={onClose} style={buttonStyles.primary}>
          {t('revealModal.done')}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Revoke confirmation modal ─────────────────────────────────────

function RevokeModal({
  row,
  onCancel,
  onConfirm,
  isPending,
}: {
  row: ApiKeyRow;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation('apiKeys');
  return (
    <ModalShell onClose={onCancel} width={440}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>
        {t('actions.revoke')} — {row.name}
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: theme.colors.textMuted, lineHeight: 1.5 }}>
        {t('actions.revokeConfirm')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} style={buttonStyles.secondary}>
          {t('createModal.cancel')}
        </button>
        <button
          onClick={onConfirm}
          disabled={isPending}
          style={{
            ...buttonStyles.primary,
            background: theme.colors.danger,
            opacity: isPending ? 0.6 : 1,
            cursor: isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? '…' : t('actions.revoke')}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Reusable shell ────────────────────────────────────────────────

function ModalShell({
  children,
  onClose,
  width = 480,
}: {
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '6vh 16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...cardStyles.card,
          width: '100%',
          maxWidth: width,
          padding: 24,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: theme.colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  fontWeight: 600,
};

function errorMessage(err: unknown): string {
  const raw = (err as { response?: { data?: { message?: unknown } } })?.response
    ?.data?.message;
  if (Array.isArray(raw)) return raw.map(String).join(', ');
  if (raw) return String(raw);
  return 'Erreur inconnue';
}
