import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { theme, cardStyles, layoutStyles, buttonStyles, formStyles } from '../theme';
import {
  listTenants,
  updateTenant,
  deleteTenant,
  impersonate,
  type TenantRow,
  type TenantPlan,
  type UpdateTenantInput,
} from '../services/super-admin.service';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';

const PLANS: TenantPlan[] = ['FREE', 'PRO', 'ENTERPRISE'];

/**
 * SA tenants management page (B7).
 *
 * Paginated list. Each row shows the tenant's identity + counters /
 * ceilings + an "Entrer" button that triggers the impersonation
 * handoff (auto-pick the 1st ADMIN). Inline edit modal lets the SA
 * rename, change plan, activate / suspend, and override quota caps.
 */
export default function SuperAdminTenantsPage() {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const [deleting, setDeleting] = useState<TenantRow | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['superAdmin', 'tenants', page],
    queryFn: () => listTenants(page, 20),
  });

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>🌍 Gestion des tenants</h1>
          <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
            Liste de tous les espaces de travail. Clique « Entrer » pour
            accéder à un tenant en tant que son 1er ADMIN.
          </p>
        </div>
        <Link to="/super-admin/tenants/nouveau" style={{ textDecoration: 'none' }}>
          <button style={buttonStyles.primary}>➕ Créer un tenant</button>
        </Link>
      </header>

      {isFetching && <p>Chargement…</p>}

      {data && (
        <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${theme.colors.border}`, fontSize: 13, color: theme.colors.textMuted }}>
            {data.pagination.total} tenant{data.pagination.total > 1 ? 's' : ''} — page {data.pagination.page} / {Math.max(1, Math.ceil(data.pagination.total / data.pagination.limit))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: theme.colors.surfaceAlt }}>
              <tr>
                <th style={th}>Slug</th>
                <th style={th}>Nom</th>
                <th style={th}>Plan</th>
                <th style={th}>Statut</th>
                <th style={th}>Users</th>
                <th style={th}>BTs/mois</th>
                <th style={th}>Stockage</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((t) => (
                <TenantRowDisplay
                  key={t.id}
                  tenant={t}
                  onEdit={() => setEditing(t)}
                  onDelete={() => setDeleting(t)}
                />
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, borderTop: `1px solid ${theme.colors.border}` }}>
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={buttonStyles.secondary}>
              ◀ Précédent
            </button>
            <button
              disabled={page * (data.pagination.limit ?? 20) >= data.pagination.total}
              onClick={() => setPage(page + 1)}
              style={buttonStyles.secondary}
            >
              Suivant ▶
            </button>
          </div>
        </div>
      )}

      {editing && <EditModal tenant={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteModal tenant={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function TenantRowDisplay({
  tenant,
  onEdit,
  onDelete,
}: {
  tenant: TenantRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const startImpersonation = useAuthStore((s) => s.startImpersonation);

  const toggleActive = useMutation({
    mutationFn: () => updateTenant(tenant.id, { isActive: !tenant.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superAdmin', 'tenants'] }),
  });

  const enter = useMutation({
    mutationFn: () => impersonate({ tenantId: tenant.id }),
    onSuccess: (resp) => {
      const now = new Date().toISOString();
      startImpersonation({
        targetAccessToken: resp.accessToken,
        targetUser: {
          id: resp.user.id,
          email: resp.user.email,
          firstName: resp.user.firstName,
          lastName: resp.user.lastName,
          role: resp.user.role as Role,
          isActive: true,
          phone: null,
          createdAt: now,
          updatedAt: now,
        },
        targetTenantSlug: resp.tenant.slug,
        targetTenantName: resp.tenant.name,
        targetUserEmail: resp.user.email,
      });
      window.location.href = '/dashboard';
    },
  });

  return (
    <tr style={{ borderTop: `1px solid ${theme.colors.border}` }}>
      <td style={td}>
        <code style={{ color: theme.colors.primary }}>{tenant.slug}</code>
      </td>
      <td style={td}>{tenant.name}</td>
      <td style={td}>
        <span
          style={{
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 3,
            background: tenant.plan === 'FREE' ? theme.colors.surfaceAlt : theme.colors.primaryLight,
            color: tenant.plan === 'FREE' ? theme.colors.textMuted : theme.colors.primary,
            fontWeight: 600,
          }}
        >
          {tenant.plan}
        </span>
      </td>
      <td style={td}>
        {tenant.isActive ? (
          <span style={{ color: theme.colors.success }}>✓ actif</span>
        ) : (
          <span style={{ color: theme.colors.danger }}>✗ suspendu</span>
        )}
      </td>
      <td style={td}>
        {tenant.currentUsers} / {tenant.maxUsers}
      </td>
      <td style={td}>
        {tenant.currentWorkOrdersThisMonth} / {tenant.maxWorkOrdersPerMonth}
      </td>
      <td style={td}>
        {(tenant.currentStorageBytes / 1024 / 1024).toFixed(0)} / {tenant.maxStorageMb} MB
      </td>
      <td style={td}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={onEdit}
            title="Éditer"
            style={{ ...buttonStyles.secondary, fontSize: 11, padding: '3px 6px' }}
          >
            ✏️
          </button>
          <button
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
            title={tenant.isActive ? 'Suspendre (rend inaccessible)' : 'Réactiver'}
            style={{
              ...buttonStyles.secondary,
              fontSize: 11,
              padding: '3px 6px',
              color: tenant.isActive ? theme.colors.warning : theme.colors.success,
            }}
          >
            {toggleActive.isPending ? '…' : tenant.isActive ? '⏸ Suspendre' : '▶ Réactiver'}
          </button>
          <button
            onClick={() => enter.mutate()}
            disabled={!tenant.isActive || enter.isPending}
            title={!tenant.isActive ? 'Tenant suspendu' : 'Entrer en tant qu\'ADMIN'}
            style={{ ...buttonStyles.primary, fontSize: 11, padding: '3px 6px' }}
          >
            {enter.isPending ? '…' : 'Entrer 🎭'}
          </button>
          <button
            onClick={onDelete}
            title="Supprimer définitivement"
            style={{
              ...buttonStyles.secondary,
              fontSize: 11,
              padding: '3px 6px',
              color: theme.colors.danger,
              borderColor: theme.colors.danger,
            }}
          >
            🗑
          </button>
        </div>
      </td>
    </tr>
  );
}

function EditModal({
  tenant,
  onClose,
}: {
  tenant: TenantRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdateTenantInput>({
    name: tenant.name,
    plan: tenant.plan,
    isActive: tenant.isActive,
    maxUsers: tenant.maxUsers,
    maxWorkOrdersPerMonth: tenant.maxWorkOrdersPerMonth,
    maxStorageMb: tenant.maxStorageMb,
    maxClients: tenant.maxClients,
  });

  const save = useMutation({
    mutationFn: () => updateTenant(tenant.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'tenants'] });
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
        style={{ ...cardStyles.card, padding: 24, maxWidth: 520, width: '100%' }}
      >
        <h2 style={{ margin: '0 0 12px' }}>Éditer <code>{tenant.slug}</code></h2>
        <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '0 0 16px' }}>
          Le slug n'est pas modifiable. Tout le reste l'est.
        </p>

        <Stack>
          <Field label="Nom">
            <input
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={formStyles.input}
            />
          </Field>
          <Field label="Plan">
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value as TenantPlan })}
              style={formStyles.input}
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Actif">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span style={{ fontSize: 13, color: theme.colors.textMuted }}>
                Espace de travail accessible
              </span>
            </label>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <NumField label="Max users" value={form.maxUsers} onChange={(v) => setForm({ ...form, maxUsers: v })} />
            <NumField label="Max BTs/mois" value={form.maxWorkOrdersPerMonth} onChange={(v) => setForm({ ...form, maxWorkOrdersPerMonth: v })} />
            <NumField label="Max stockage (MB)" value={form.maxStorageMb} onChange={(v) => setForm({ ...form, maxStorageMb: v })} />
            <NumField label="Max clients" value={form.maxClients} onChange={(v) => setForm({ ...form, maxClients: v })} />
          </div>
        </Stack>

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
            Échec : vérifie les valeurs et réessaie.
          </p>
        )}
      </div>
    </div>
  );
}

function DeleteModal({
  tenant,
  onClose,
}: {
  tenant: TenantRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [confirmSlug, setConfirmSlug] = useState('');
  const matches = confirmSlug === tenant.slug;

  const del = useMutation({
    mutationFn: () => deleteTenant(tenant.id, confirmSlug),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'tenants'] });
      onClose();
    },
  });

  const apiError =
    (del.error as { response?: { data?: { message?: string | string[] } } } | undefined)
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
        style={{
          ...cardStyles.card,
          padding: 24,
          maxWidth: 480,
          width: '100%',
          borderTop: `3px solid ${theme.colors.danger}`,
        }}
      >
        <h2 style={{ margin: '0 0 8px', color: theme.colors.danger }}>
          🗑 Supprimer définitivement
        </h2>
        <p style={{ fontSize: 13, color: theme.colors.text, margin: '0 0 12px' }}>
          Cette action est <strong>irréversible</strong>. Toutes les données de{' '}
          <strong>{tenant.name}</strong> seront effacées : utilisateurs, bons de
          travail, clients, pièces jointes, configuration — tout.
        </p>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: '0 0 8px' }}>
          Pour confirmer, tapez le slug{' '}
          <code style={{ color: theme.colors.danger }}>{tenant.slug}</code> :
        </p>
        <input
          value={confirmSlug}
          onChange={(e) => setConfirmSlug(e.target.value)}
          placeholder={tenant.slug}
          autoFocus
          style={{
            ...formStyles.input,
            borderColor:
              confirmSlug && !matches ? theme.colors.danger : theme.colors.border,
          }}
        />

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
            onClick={() => del.mutate()}
            disabled={!matches || del.isPending}
            style={{
              ...buttonStyles.primary,
              background: theme.colors.danger,
              borderColor: theme.colors.danger,
              opacity: !matches || del.isPending ? 0.6 : 1,
              cursor: !matches || del.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {del.isPending ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={1}
        value={value ?? ''}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || 0)}
        style={formStyles.input}
      />
    </Field>
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
