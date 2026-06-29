import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { theme, cardStyles, layoutStyles, buttonStyles, formStyles } from '../theme';
import {
  listTenants,
  updateTenant,
  impersonate,
  type TenantRow,
  type TenantPlan,
  type UpdateTenantInput,
} from '../services/super-admin.service';
import { useAuthStore } from '../context/auth.store';

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

  const { data, isFetching } = useQuery({
    queryKey: ['superAdmin', 'tenants', page],
    queryFn: () => listTenants(page, 20),
  });

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>🌍 Gestion des tenants</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          Liste de tous les espaces de travail. Clique « Entrer » pour
          accéder à un tenant en tant que son 1er ADMIN.
        </p>
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
                <TenantRowDisplay key={t.id} tenant={t} onEdit={() => setEditing(t)} />
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
    </div>
  );
}

function TenantRowDisplay({
  tenant,
  onEdit,
}: {
  tenant: TenantRow;
  onEdit: () => void;
}) {
  const startImpersonation = useAuthStore((s) => s.startImpersonation);
  const enter = useMutation({
    mutationFn: () => impersonate({ tenantId: tenant.id }),
    onSuccess: (resp) => {
      startImpersonation({
        targetAccessToken: resp.accessToken,
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
        <button
          onClick={onEdit}
          style={{ ...buttonStyles.secondary, fontSize: 11, padding: '3px 6px', marginRight: 4 }}
        >
          ✏️
        </button>
        <button
          onClick={() => enter.mutate()}
          disabled={!tenant.isActive || enter.isPending}
          title={!tenant.isActive ? 'Tenant suspendu' : 'Entrer en tant qu\'ADMIN'}
          style={{ ...buttonStyles.primary, fontSize: 11, padding: '3px 6px' }}
        >
          {enter.isPending ? '…' : 'Entrer 🎭'}
        </button>
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
