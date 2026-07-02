import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { theme, cardStyles, layoutStyles, buttonStyles, formStyles } from '../theme';
import {
  listAllUsers,
  listTenants,
  updateUserBySuperAdmin,
  createUserBySuperAdmin,
  type AllUsersRow,
  type UpdateUserBySuperAdminInput,
  type CreateUserInput,
} from '../services/super-admin.service';

const EDITABLE_ROLES = ['ADMIN', 'DISPATCHER', 'TECHNICIAN'] as const;
type EditableRole = (typeof EDITABLE_ROLES)[number];

/**
 * « Tous les utilisateurs » — SA only (B7 follow-up).
 *
 * Liste paginée cross-tenant + édition inline (changer le tenant et
 * le role d'un user). SUPER_ADMIN n'est pas dans le dropdown role —
 * la promotion SA passe par le bootstrap (SUPER_ADMIN_EMAIL env).
 */
export default function SuperAdminAllUsersPage() {
  const [page, setPage] = useState(1);
  const [emailFilter, setEmailFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [editing, setEditing] = useState<AllUsersRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: usersData, isFetching } = useQuery({
    queryKey: ['superAdmin', 'all-users', page, emailFilter, tenantFilter],
    queryFn: () =>
      listAllUsers({
        page,
        limit: 50,
        email: emailFilter || undefined,
        tenantId: tenantFilter || undefined,
      }),
  });

  // Liste des tenants pour le dropdown filtre + le dropdown édition.
  const { data: tenantsData } = useQuery({
    queryKey: ['superAdmin', 'tenants-all', 1],
    queryFn: () => listTenants(1, 100),
  });

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>👥 Tous les utilisateurs</h1>
          <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
            Liste cross-tenant. Cliquez sur une ligne pour changer son tenant ou son rôle.
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={buttonStyles.primary}>
          ➕ Ajouter un utilisateur
        </button>
      </header>

      <div style={{ ...cardStyles.card, padding: 12, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input
          value={emailFilter}
          onChange={(e) => {
            setPage(1);
            setEmailFilter(e.target.value);
          }}
          placeholder="Filtrer par email (préfixe)"
          style={{ ...formStyles.input, flex: 1, minWidth: 220 }}
        />
        <select
          value={tenantFilter}
          onChange={(e) => {
            setPage(1);
            setTenantFilter(e.target.value);
          }}
          style={{ ...formStyles.input, minWidth: 200 }}
        >
          <option value="">Tous les tenants</option>
          {tenantsData?.data.map((t) => (
            <option key={t.id} value={t.id}>
              {t.slug} — {t.name}
            </option>
          ))}
        </select>
      </div>

      {isFetching && <p>Chargement…</p>}

      {usersData && (
        <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${theme.colors.border}`, fontSize: 13, color: theme.colors.textMuted }}>
            {usersData.pagination.total} utilisateur{usersData.pagination.total > 1 ? 's' : ''} —
            page {usersData.pagination.page} / {Math.max(1, Math.ceil(usersData.pagination.total / usersData.pagination.limit))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: theme.colors.surfaceAlt }}>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Nom</th>
                <th style={th}>Rôle</th>
                <th style={th}>Tenant</th>
                <th style={th}>Statut</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {usersData.data.map((u) => (
                <tr key={u.id} style={{ borderTop: `1px solid ${theme.colors.border}` }}>
                  <td style={td}>{u.email}</td>
                  <td style={td}>
                    {u.firstName} {u.lastName}
                  </td>
                  <td style={td}>
                    <RoleBadge role={u.role} />
                  </td>
                  <td style={td}>
                    <code style={{ color: theme.colors.primary }}>{u.tenant.slug}</code>
                    <span style={{ color: theme.colors.textMuted, marginLeft: 6 }}>{u.tenant.name}</span>
                  </td>
                  <td style={td}>
                    {u.isActive ? (
                      <span style={{ color: theme.colors.success }}>✓ actif</span>
                    ) : (
                      <span style={{ color: theme.colors.danger }}>✗ inactif</span>
                    )}
                  </td>
                  <td style={td}>
                    {u.role === 'SUPER_ADMIN' ? (
                      <span style={{ fontSize: 11, color: theme.colors.textMuted }}>
                        non éditable
                      </span>
                    ) : (
                      <button
                        onClick={() => setEditing(u)}
                        style={{ ...buttonStyles.secondary, fontSize: 11, padding: '3px 8px' }}
                      >
                        ✏️ Éditer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, borderTop: `1px solid ${theme.colors.border}` }}>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={buttonStyles.secondary}>
              ◀ Précédent
            </button>
            <button
              disabled={page * usersData.pagination.limit >= usersData.pagination.total}
              onClick={() => setPage(page + 1)}
              style={buttonStyles.secondary}
            >
              Suivant ▶
            </button>
          </div>
        </div>
      )}

      {editing && (
        <EditUserModal
          user={editing}
          tenants={tenantsData?.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      {creating && (
        <CreateUserModal
          tenants={tenantsData?.data ?? []}
          defaultTenantId={tenantFilter || tenantsData?.data?.[0]?.id || ''}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function CreateUserModal({
  tenants,
  defaultTenantId,
  onClose,
}: {
  tenants: Array<{ id: string; slug: string; name: string }>;
  defaultTenantId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateUserInput>({
    tenantId: defaultTenantId,
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'TECHNICIAN',
    phone: '',
    isActive: true,
  });

  const canSubmit =
    form.tenantId &&
    /^\S+@\S+\.\S+$/.test(form.email) &&
    form.password.length >= 8 &&
    form.firstName.trim() &&
    form.lastName.trim();

  const create = useMutation({
    mutationFn: () =>
      createUserBySuperAdmin({
        ...form,
        phone: form.phone?.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'all-users'] });
      onClose();
    },
  });

  const apiError =
    (create.error as { response?: { data?: { message?: string | string[] } } } | undefined)
      ?.response?.data?.message;
  const errorText = Array.isArray(apiError) ? apiError.join(', ') : apiError;

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
        <h2 style={{ margin: '0 0 16px' }}>➕ Nouvel utilisateur</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Tenant">
            <select
              value={form.tenantId}
              onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
              style={formStyles.input}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.slug} — {t.name}
                </option>
              ))}
            </select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Prénom">
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                style={formStyles.input}
              />
            </Field>
            <Field label="Nom">
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                style={formStyles.input}
              />
            </Field>
          </div>

          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={formStyles.input}
            />
          </Field>

          <Field label="Mot de passe (≥ 8 caractères)">
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              style={formStyles.input}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Rôle">
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as CreateUserInput['role'] })
                }
                style={formStyles.input}
              >
                {EDITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Téléphone (optionnel)">
              <input
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                style={formStyles.input}
              />
            </Field>
          </div>

          <Field label="Statut">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span style={{ fontSize: 13 }}>Compte actif</span>
            </label>
          </Field>
        </div>

        {errorText && (
          <p style={{ color: theme.colors.danger, marginTop: 12, fontSize: 13 }}>
            Échec : {errorText}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={buttonStyles.secondary}>
            Annuler
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
            style={{
              ...buttonStyles.primary,
              opacity: !canSubmit || create.isPending ? 0.6 : 1,
              cursor: !canSubmit || create.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {create.isPending ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: AllUsersRow['role'] }) {
  const color =
    role === 'SUPER_ADMIN'
      ? theme.colors.warning
      : role === 'ADMIN'
        ? theme.colors.primary
        : role === 'DISPATCHER'
          ? theme.colors.info
          : theme.colors.textMuted;
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 3,
        background: theme.colors.surfaceAlt,
        color,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}
    >
      {role}
    </span>
  );
}

function EditUserModal({
  user,
  tenants,
  onClose,
}: {
  user: AllUsersRow;
  tenants: Array<{ id: string; slug: string; name: string }>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const initialRole: EditableRole =
    user.role === 'SUPER_ADMIN' ? 'ADMIN' : (user.role as EditableRole);
  const [form, setForm] = useState<UpdateUserBySuperAdminInput>({
    tenantId: user.tenant.id,
    role: initialRole,
    isActive: user.isActive,
  });

  const save = useMutation({
    mutationFn: () => updateUserBySuperAdmin(user.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'all-users'] });
      onClose();
    },
  });

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
        <h2 style={{ margin: '0 0 8px' }}>
          Éditer <code>{user.email}</code>
        </h2>
        <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '0 0 16px' }}>
          {user.firstName} {user.lastName}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Tenant">
            <select
              value={form.tenantId}
              onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
              style={formStyles.input}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.slug} — {t.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>
              ⚠ Déplacer un user vers un autre tenant déplace aussi ses notifications,
              audit logs et BTs assignés.
            </span>
          </Field>

          <Field label="Rôle">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as EditableRole })}
              style={formStyles.input}
            >
              {EDITABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>
              SUPER_ADMIN n'est pas dans la liste — la promotion SA passe par
              SUPER_ADMIN_EMAIL en env.
            </span>
          </Field>

          <Field label="Statut">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span style={{ fontSize: 13 }}>Compte actif</span>
            </label>
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={buttonStyles.secondary}>
            Annuler
          </button>
          <button onClick={() => save.mutate()} disabled={save.isPending} style={buttonStyles.primary}>
            {save.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
        {save.isError && (
          <p style={{ color: theme.colors.danger, marginTop: 8, fontSize: 13 }}>
            Échec — vérifiez les valeurs (ex: tenant cible désactivé).
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: 8,
  fontWeight: 600,
  color: theme.colors.text,
  fontSize: 12,
};
const td: React.CSSProperties = { padding: 8, color: theme.colors.text };
