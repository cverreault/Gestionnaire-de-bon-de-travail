import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  theme,
  cardStyles,
  layoutStyles,
  buttonStyles,
  formStyles,
} from '../theme';
import {
  createPlatformSuperAdmin,
  deletePlatformSuperAdmin,
  listPlatformSuperAdmins,
  reactivatePlatformSuperAdmin,
  resetPlatformSuperAdminPassword,
  resetPlatformSuperAdminTotp,
  suspendPlatformSuperAdmin,
  updatePlatformSuperAdmin,
  type CreatePlatformSuperAdminInput,
  type PlatformSuperAdminRow,
  type UpdatePlatformSuperAdminInput,
} from '../services/super-admin.service';
import { useAuthStore } from '../context/auth.store';

const QUERY_KEY = ['superAdmin', 'platformUsers'];

type ConfirmKind = 'suspend' | 'reactivate' | 'resetTotp' | 'delete';

/**
 * SA-only — provision and manage SUPER_ADMIN users (B7.6, B39).
 *
 * The bootstrap path (SUPER_ADMIN_EMAIL env) stays available but the
 * platform owner should be able to add more platform admins without
 * editing env vars and restarting the backend. New SAs land in the
 * DEFAULT tenant by convention — that's where every SA lives.
 *
 * Lifecycle actions (edit, password, suspend / reactivate, 2FA reset,
 * delete) live on each row. The backend refuses self-suspension,
 * self-deletion and removing the last active SA.
 */
export default function SuperAdminPlatformUsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const meId = useAuthStore((s) => s.user?.id);

  const { data: list, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listPlatformSuperAdmins,
  });

  const [form, setForm] = useState<CreatePlatformSuperAdminInput>({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
  });
  const [editing, setEditing] = useState<PlatformSuperAdminRow | null>(null);
  const [passwordFor, setPasswordFor] = useState<PlatformSuperAdminRow | null>(null);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; user: PlatformSuperAdminRow } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createPlatformSuperAdmin({
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone?.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setForm({ email: '', password: '', firstName: '', lastName: '', phone: '' });
    },
  });

  const canSubmit =
    /^\S+@\S+\.\S+$/.test(form.email.trim()) &&
    form.password.length >= 8 &&
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0;

  const errorText = extractApiError(create.error);

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>👑 {t('superAdmin:platformUsers.title', { defaultValue: 'SUPER_ADMINs de la plateforme' })}</h1>
        <p
          style={{
            color: theme.colors.textMuted,
            margin: '4px 0 0',
            fontSize: 13,
          }}
        >
          {t('superAdmin:platformUsers.subtitle', { defaultValue: 'Crée et liste les administrateurs globaux. Les SUPER_ADMINs ne sont rattachés à aucun tenant — ils peuvent gérer toute la plateforme.' })}
        </p>
      </header>

      {/* ── Création ────────────────────────────────────────────── */}
      <div
        style={{ ...cardStyles.card, padding: 24, maxWidth: 720, marginBottom: 24 }}
      >
        <h3 style={{ margin: '0 0 16px' }}>{t('superAdmin:platformUsers.newSuperAdmin', { defaultValue: 'Nouveau SUPER_ADMIN' })}</h3>

        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}
        >
          <Field label={t('superAdmin:platformUsers.firstName', { defaultValue: 'Prénom' })}>
            <input
              value={form.firstName}
              onChange={(e) =>
                setForm({ ...form, firstName: e.target.value })
              }
              style={formStyles.input}
            />
          </Field>
          <Field label={t('superAdmin:platformUsers.lastName', { defaultValue: 'Nom' })}>
            <input
              value={form.lastName}
              onChange={(e) =>
                setForm({ ...form, lastName: e.target.value })
              }
              style={formStyles.input}
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <Field label={t('superAdmin:platformUsers.email', { defaultValue: 'Email' })}>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="admin@plateforme.com"
              style={formStyles.input}
            />
          </Field>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
            gap: 12,
            marginTop: 12,
          }}
        >
          <Field label={t('superAdmin:platformUsers.password', { defaultValue: 'Mot de passe (≥ 8 caractères)' })}>
            <input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              placeholder="••••••••"
              style={formStyles.input}
            />
          </Field>
          <Field label={t('superAdmin:platformUsers.phone', { defaultValue: 'Téléphone (optionnel)' })}>
            <input
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 514 555 0123"
              style={formStyles.input}
            />
          </Field>
        </div>

        {errorText && (
          <p
            style={{
              color: theme.colors.danger,
              marginTop: 16,
              fontSize: 13,
            }}
          >
            {t('superAdmin:platformUsers.failureWith', { defaultValue: 'Échec : {{error}}', error: errorText })}
          </p>
        )}
        {create.isSuccess && (
          <p
            style={{
              color: theme.colors.success,
              marginTop: 16,
              fontSize: 13,
            }}
          >
            {t('superAdmin:platformUsers.createSuccess', { defaultValue: '✅ SUPER_ADMIN créé. Il peut se connecter immédiatement.' })}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: 16,
          }}
        >
          <button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
            style={{
              ...buttonStyles.primary,
              opacity: !canSubmit || create.isPending ? 0.6 : 1,
              cursor: !canSubmit || create.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {create.isPending ? t('superAdmin:platformUsers.creating', { defaultValue: 'Création…' }) : t('superAdmin:platformUsers.createButton', { defaultValue: '➕ Créer le SUPER_ADMIN' })}
          </button>
        </div>
      </div>

      {/* ── Liste ───────────────────────────────────────────────── */}
      <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.colors.border}`,
            fontWeight: 600,
          }}
        >
          {t('superAdmin:platformUsers.existingCount', { defaultValue: 'SUPER_ADMINs existants ({{count}})', count: list?.data.length ?? 0 })}
        </div>
        {isLoading ? (
          <div style={{ padding: 16, color: theme.colors.textMuted }}>
            {t('common:messages.loading', { defaultValue: 'Chargement…' })}
          </div>
        ) : !list || list.data.length === 0 ? (
          <div style={{ padding: 16, color: theme.colors.textMuted }}>
            {t('superAdmin:platformUsers.noSuperAdmin', { defaultValue: 'Aucun SUPER_ADMIN.' })}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.colors.surfaceAlt }}>
                  <Th>{t('superAdmin:platformUsers.colEmail', { defaultValue: 'Email' })}</Th>
                  <Th>{t('superAdmin:platformUsers.colName', { defaultValue: 'Nom' })}</Th>
                  <Th>{t('superAdmin:platformUsers.colPhone', { defaultValue: 'Téléphone' })}</Th>
                  <Th>{t('superAdmin:platformUsers.colActive', { defaultValue: 'Actif' })}</Th>
                  <Th>{t('superAdmin:platformUsers.col2fa', { defaultValue: '2FA' })}</Th>
                  <Th>{t('superAdmin:platformUsers.colCreatedAt', { defaultValue: 'Créé le' })}</Th>
                  <Th>{t('superAdmin:platformUsers.colActions', { defaultValue: 'Actions' })}</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((u) => (
                  <Row
                    key={u.id}
                    u={u}
                    isMe={u.id === meId}
                    onEdit={() => setEditing(u)}
                    onPassword={() => setPasswordFor(u)}
                    onConfirm={(kind) => setConfirm({ kind, user: u })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <EditModal user={editing} onClose={() => setEditing(null)} />}
      {passwordFor && <PasswordModal user={passwordFor} onClose={() => setPasswordFor(null)} />}
      {confirm && (
        <ConfirmModal kind={confirm.kind} user={confirm.user} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractApiError(error: unknown): string | undefined {
  const apiError = (error as { response?: { data?: { message?: string | string[] } } } | undefined)
    ?.response?.data?.message;
  return Array.isArray(apiError) ? apiError.join(', ') : apiError;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: 'left',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: theme.colors.textMuted,
        borderBottom: `1px solid ${theme.colors.border}`,
      }}
    >
      {children}
    </th>
  );
}

const cellStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 13 };
const smallButton: React.CSSProperties = { ...buttonStyles.secondary, padding: '4px 8px', fontSize: 12 };
const smallDangerButton: React.CSSProperties = { ...buttonStyles.danger, padding: '4px 8px', fontSize: 12 };

function Row({
  u,
  isMe,
  onEdit,
  onPassword,
  onConfirm,
}: {
  u: PlatformSuperAdminRow;
  isMe: boolean;
  onEdit: () => void;
  onPassword: () => void;
  onConfirm: (kind: ConfirmKind) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr style={{ borderBottom: `1px solid ${theme.colors.border}`, opacity: u.isActive ? 1 : 0.6 }}>
      <td style={cellStyle}>
        {u.email}
        {isMe && (
          <span style={{ marginLeft: 6, fontSize: 11, color: theme.colors.textMuted }}>
            ({t('superAdmin:platformUsers.you', { defaultValue: 'vous' })})
          </span>
        )}
      </td>
      <td style={cellStyle}>
        {u.firstName} {u.lastName}
      </td>
      <td style={{ ...cellStyle, color: theme.colors.textMuted }}>
        {u.phone ?? '—'}
      </td>
      <td style={cellStyle}>{u.isActive ? '✅' : '⛔'}</td>
      <td style={cellStyle}>{u.totpEnabled ? '🔐' : '—'}</td>
      <td style={{ ...cellStyle, color: theme.colors.textMuted }}>
        {new Date(u.createdAt).toLocaleDateString()}
      </td>
      <td style={cellStyle}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={onEdit} style={smallButton}>
            {t('superAdmin:platformUsers.actionEdit', { defaultValue: 'Éditer' })}
          </button>
          <button onClick={onPassword} style={smallButton}>
            {t('superAdmin:platformUsers.actionPassword', { defaultValue: 'Mot de passe' })}
          </button>
          {u.totpEnabled && (
            <button onClick={() => onConfirm('resetTotp')} style={smallButton}>
              {t('superAdmin:platformUsers.actionResetTotp', { defaultValue: 'Réinit. 2FA' })}
            </button>
          )}
          {u.isActive ? (
            <button
              onClick={() => onConfirm('suspend')}
              disabled={isMe}
              title={isMe ? t('superAdmin:platformUsers.selfProtected', { defaultValue: 'Vous ne pouvez pas suspendre ni supprimer votre propre compte.' }) : undefined}
              style={{ ...smallButton, opacity: isMe ? 0.5 : 1, cursor: isMe ? 'not-allowed' : 'pointer' }}
            >
              {t('superAdmin:platformUsers.actionSuspend', { defaultValue: 'Suspendre' })}
            </button>
          ) : (
            <button onClick={() => onConfirm('reactivate')} style={smallButton}>
              {t('superAdmin:platformUsers.actionReactivate', { defaultValue: 'Réactiver' })}
            </button>
          )}
          <button
            onClick={() => onConfirm('delete')}
            disabled={isMe}
            title={isMe ? t('superAdmin:platformUsers.selfProtected', { defaultValue: 'Vous ne pouvez pas suspendre ni supprimer votre propre compte.' }) : undefined}
            style={{ ...smallDangerButton, opacity: isMe ? 0.5 : 1, cursor: isMe ? 'not-allowed' : 'pointer' }}
          >
            {t('superAdmin:platformUsers.actionDelete', { defaultValue: 'Supprimer' })}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyles.card, padding: 24, maxWidth: 480, width: '100%' }}
      >
        {children}
      </div>
    </div>
  );
}

function EditModal({ user, onClose }: { user: PlatformSuperAdminRow; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<Required<UpdatePlatformSuperAdminInput>>({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? '',
  });

  const save = useMutation({
    mutationFn: () =>
      updatePlatformSuperAdmin(user.id, {
        email: form.email?.trim(),
        firstName: form.firstName?.trim(),
        lastName: form.lastName?.trim(),
        phone: form.phone?.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
  });

  const canSave =
    /^\S+@\S+\.\S+$/.test(form.email?.trim() ?? '') &&
    (form.firstName?.trim().length ?? 0) > 0 &&
    (form.lastName?.trim().length ?? 0) > 0;
  const errorText = extractApiError(save.error);

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: '0 0 16px' }}>
        {t('superAdmin:platformUsers.editHeading', { defaultValue: 'Éditer le SUPER_ADMIN' })}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label={t('superAdmin:platformUsers.firstName', { defaultValue: 'Prénom' })}>
          <input value={form.firstName ?? ''} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={formStyles.input} />
        </Field>
        <Field label={t('superAdmin:platformUsers.lastName', { defaultValue: 'Nom' })}>
          <input value={form.lastName ?? ''} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={formStyles.input} />
        </Field>
        <Field label={t('superAdmin:platformUsers.email', { defaultValue: 'Email' })}>
          <input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} style={formStyles.input} />
        </Field>
        <Field label={t('superAdmin:platformUsers.phone', { defaultValue: 'Téléphone (optionnel)' })}>
          <input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={formStyles.input} />
        </Field>
      </div>
      {errorText && (
        <p style={{ color: theme.colors.danger, marginTop: 12, fontSize: 13 }}>
          {t('superAdmin:platformUsers.failureWith', { defaultValue: 'Échec : {{error}}', error: errorText })}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={buttonStyles.secondary}>
          {t('superAdmin:platformUsers.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button onClick={() => save.mutate()} disabled={!canSave || save.isPending} style={buttonStyles.primary}>
          {save.isPending
            ? t('superAdmin:platformUsers.saving', { defaultValue: 'Sauvegarde…' })
            : t('superAdmin:platformUsers.save', { defaultValue: 'Sauvegarder' })}
        </button>
      </div>
    </ModalShell>
  );
}

function PasswordModal({ user, onClose }: { user: PlatformSuperAdminRow; onClose: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const save = useMutation({
    mutationFn: () => resetPlatformSuperAdminPassword(user.id, password),
    onSuccess: onClose,
  });

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSave = password.length >= 8 && confirm === password;
  const errorText = extractApiError(save.error);

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: '0 0 4px' }}>
        {t('superAdmin:platformUsers.passwordHeading', { defaultValue: 'Nouveau mot de passe' })}
      </h2>
      <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '0 0 16px' }}>
        <code>{user.email}</code> — {t('superAdmin:platformUsers.passwordHint', { defaultValue: 'Au moins 8 caractères. Toutes les sessions ouvertes de ce compte seront fermées.' })}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label={t('superAdmin:platformUsers.newPassword', { defaultValue: 'Nouveau mot de passe' })}>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={formStyles.input} />
        </Field>
        <Field label={t('superAdmin:platformUsers.confirmPassword', { defaultValue: 'Confirmer' })}>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={formStyles.input} />
        </Field>
      </div>
      {mismatch && (
        <p style={{ color: theme.colors.danger, marginTop: 12, fontSize: 13 }}>
          {t('superAdmin:platformUsers.passwordMismatch', { defaultValue: 'Les deux mots de passe ne correspondent pas.' })}
        </p>
      )}
      {errorText && (
        <p style={{ color: theme.colors.danger, marginTop: 12, fontSize: 13 }}>
          {t('superAdmin:platformUsers.failureWith', { defaultValue: 'Échec : {{error}}', error: errorText })}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={buttonStyles.secondary}>
          {t('superAdmin:platformUsers.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button onClick={() => save.mutate()} disabled={!canSave || save.isPending} style={buttonStyles.primary}>
          {save.isPending
            ? t('superAdmin:platformUsers.saving', { defaultValue: 'Sauvegarde…' })
            : t('superAdmin:platformUsers.save', { defaultValue: 'Sauvegarder' })}
        </button>
      </div>
    </ModalShell>
  );
}

const CONFIRM_COPY: Record<ConfirmKind, { title: string; body: string; defaultTitle: string; defaultBody: string; danger: boolean }> = {
  suspend: {
    title: 'superAdmin:platformUsers.confirmSuspendTitle',
    body: 'superAdmin:platformUsers.confirmSuspendBody',
    defaultTitle: 'Suspendre ce SUPER_ADMIN ?',
    defaultBody: '{{email}} ne pourra plus se connecter et ses sessions ouvertes seront fermées. Vous pourrez le réactiver plus tard.',
    danger: true,
  },
  reactivate: {
    title: 'superAdmin:platformUsers.confirmReactivateTitle',
    body: 'superAdmin:platformUsers.confirmReactivateBody',
    defaultTitle: 'Réactiver ce SUPER_ADMIN ?',
    defaultBody: '{{email}} pourra de nouveau se connecter.',
    danger: false,
  },
  resetTotp: {
    title: 'superAdmin:platformUsers.confirmResetTotpTitle',
    body: 'superAdmin:platformUsers.confirmResetTotpBody',
    defaultTitle: 'Réinitialiser la 2FA ?',
    defaultBody: 'La double authentification de {{email}} sera désactivée. Il devra la reconfigurer depuis son profil.',
    danger: true,
  },
  delete: {
    title: 'superAdmin:platformUsers.confirmDeleteTitle',
    body: 'superAdmin:platformUsers.confirmDeleteBody',
    defaultTitle: 'Supprimer définitivement ce SUPER_ADMIN ?',
    defaultBody: '{{email}} sera supprimé sans possibilité de retour. Si des données lui sont rattachées, la suppression sera refusée : suspendez-le plutôt.',
    danger: true,
  },
};

const CONFIRM_ACTION: Record<ConfirmKind, (id: string) => Promise<unknown>> = {
  suspend: suspendPlatformSuperAdmin,
  reactivate: reactivatePlatformSuperAdmin,
  resetTotp: resetPlatformSuperAdminTotp,
  delete: deletePlatformSuperAdmin,
};

function ConfirmModal({ kind, user, onClose }: { kind: ConfirmKind; user: PlatformSuperAdminRow; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const copy = CONFIRM_COPY[kind];

  const run = useMutation({
    mutationFn: () => CONFIRM_ACTION[kind](user.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
  });
  const errorText = extractApiError(run.error);

  return (
    <ModalShell onClose={onClose}>
      <h2 style={{ margin: '0 0 8px' }}>{t(copy.title, { defaultValue: copy.defaultTitle })}</h2>
      <p style={{ fontSize: 13, margin: '0 0 16px' }}>
        {t(copy.body, { defaultValue: copy.defaultBody, email: user.email })}
      </p>
      {errorText && (
        <p style={{ color: theme.colors.danger, marginTop: 0, fontSize: 13 }}>
          {t('superAdmin:platformUsers.failureWith', { defaultValue: 'Échec : {{error}}', error: errorText })}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onClose} style={buttonStyles.secondary}>
          {t('superAdmin:platformUsers.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          style={copy.danger ? buttonStyles.danger : buttonStyles.primary}
        >
          {run.isPending
            ? t('superAdmin:platformUsers.working', { defaultValue: 'En cours…' })
            : t('superAdmin:platformUsers.confirm', { defaultValue: 'Confirmer' })}
        </button>
      </div>
    </ModalShell>
  );
}
