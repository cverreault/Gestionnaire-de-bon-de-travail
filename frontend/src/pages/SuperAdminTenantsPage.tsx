import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { theme, cardStyles, layoutStyles, buttonStyles, formStyles } from '../theme';
import {
  listTenants,
  updateTenant,
  deleteTenant,
  impersonate,
  getPlanCatalog,
  type TenantRow,
  type TenantPlan,
  type UpdateTenantInput,
} from '../services/super-admin.service';
import { useAuthStore } from '../context/auth.store';
import { toast } from '../context/toast.store';
import { Role } from '../types';
import EmptyState from '../components/EmptyState';
import SkeletonList from '../components/SkeletonList';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

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
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation('superAdmin');

  const { data, isLoading } = useQuery({
    queryKey: ['superAdmin', 'tenants', page],
    queryFn: () => listTenants(page, 20),
  });

  // Client-side substring filter (list is at most 20 rows per page — cheap).
  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.data;
    return data.data.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.ownerEmail?.toLowerCase().includes(q) ?? false),
    );
  }, [data, search]);

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('tenants.title')}</h1>
          <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
            {t('tenants.subtitle')}
          </p>
        </div>
        <Link to="/super-admin/tenants/nouveau" style={{ textDecoration: 'none' }}>
          <button style={buttonStyles.primary}>{t('tenants.createButton')}</button>
        </Link>
      </header>

      <div style={{ marginBottom: 12, position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.colors.textMuted,
            fontSize: 14,
            pointerEvents: 'none',
          }}
        >
          🔎
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('tenants.searchPlaceholder')}
          style={{ ...formStyles.input, paddingLeft: 34 }}
        />
      </div>

      {isLoading && <SkeletonList rows={5} />}

      {data && data.pagination.total === 0 && (
        <EmptyState
          icon="🌍"
          title={t('tenants.empty')}
          subtitle={t('tenants.emptySubtitle')}
          actionLabel={t('tenants.createButton')}
          onAction={() => navigate('/super-admin/tenants/nouveau')}
        />
      )}

      {data && data.pagination.total > 0 && filtered.length === 0 && (
        <EmptyState
          icon="🔎"
          title={t('tenants.noResults')}
          subtitle={t('tenants.noResultsSub', { q: search })}
          actionLabel={t('tenants.clearSearch')}
          onAction={() => setSearch('')}
        />
      )}

      {data && filtered.length > 0 && (
        <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${theme.colors.border}`, fontSize: 13, color: theme.colors.textMuted }}>
            {search
              ? t('tenants.countFiltered', { shown: filtered.length, count: data.pagination.total, total: data.pagination.total })
              : t('tenants.countAll', { count: data.pagination.total, page: data.pagination.page, total: Math.max(1, Math.ceil(data.pagination.total / data.pagination.limit)) })}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: theme.colors.surfaceAlt }}>
              <tr>
                <th style={th}>{t('tenants.column.slug')}</th>
                <th style={th}>{t('tenants.column.name')}</th>
                <th style={th}>{t('tenants.column.plan')}</th>
                <th style={th}>{t('tenants.column.status')}</th>
                <th style={th}>{t('tenants.column.users')}</th>
                <th style={th}>{t('tenants.column.workOrders')}</th>
                <th style={th}>{t('tenants.column.storage')}</th>
                <th style={th}>{t('tenants.column.action')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <TenantRowDisplay
                  key={row.id}
                  tenant={row}
                  onEdit={() => setEditing(row)}
                  onDelete={() => setDeleting(row)}
                />
              ))}
            </tbody>
          </table>
          {!search && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, borderTop: `1px solid ${theme.colors.border}` }}>
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={buttonStyles.secondary}>
                {t('tenants.prev')}
              </button>
              <button
                disabled={page * (data.pagination.limit ?? 20) >= data.pagination.total}
                onClick={() => setPage(page + 1)}
                style={buttonStyles.secondary}
              >
                {t('tenants.next')}
              </button>
            </div>
          )}
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
  const { t } = useTranslation('superAdmin');

  const toggleActive = useMutation({
    mutationFn: () => updateTenant(tenant.id, { isActive: !tenant.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'tenants'] });
      toast.success(
        tenant.isActive
          ? t('tenants.toasts.suspended', { slug: tenant.slug })
          : t('tenants.toasts.reactivated', { slug: tenant.slug }),
      );
    },
    onError: (err) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? '';
      toast.error(
        t('tenants.toasts.toggleFailed', {
          msg: Array.isArray(msg) ? msg.join(', ') : msg,
        }),
      );
    },
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
          <span style={{ color: theme.colors.success }}>{t('tenants.status.active')}</span>
        ) : (
          <span style={{ color: theme.colors.danger }}>{t('tenants.status.suspended')}</span>
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
            title={t('tenants.actions.editTitle')}
            style={{ ...buttonStyles.secondary, fontSize: 11, padding: '3px 6px' }}
          >
            {t('tenants.actions.edit')}
          </button>
          <button
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
            title={tenant.isActive ? t('tenants.actions.suspendTitle') : t('tenants.actions.reactivateTitle')}
            style={{
              ...buttonStyles.secondary,
              fontSize: 11,
              padding: '3px 6px',
              color: tenant.isActive ? theme.colors.warning : theme.colors.success,
            }}
          >
            {toggleActive.isPending
              ? t('tenants.actions.loading')
              : tenant.isActive
              ? t('tenants.actions.suspend')
              : t('tenants.actions.reactivate')}
          </button>
          <button
            onClick={() => enter.mutate()}
            disabled={!tenant.isActive || enter.isPending}
            title={!tenant.isActive ? t('tenants.actions.enterDisabledTitle') : t('tenants.actions.enterTitle')}
            style={{ ...buttonStyles.primary, fontSize: 11, padding: '3px 6px' }}
          >
            {enter.isPending ? t('tenants.actions.loading') : t('tenants.actions.enter')}
          </button>
          <button
            onClick={onDelete}
            title={t('tenants.actions.deleteTitle')}
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
  const { t } = useTranslation('superAdmin');
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
        <h2 style={{ margin: '0 0 12px' }}>{t('superAdmin:tenantsPage.editHeading', { defaultValue: 'Éditer' })} <code>{tenant.slug}</code></h2>
        <p style={{ fontSize: 12, color: theme.colors.textMuted, margin: '0 0 16px' }}>
          {t('superAdmin:tenantsPage.slugNotEditable', { defaultValue: "Le slug n'est pas modifiable. Tout le reste l'est." })}
        </p>

        <Stack>
          <Field label={t('superAdmin:tenantsPage.fieldName', { defaultValue: 'Nom' })}>
            <input
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={formStyles.input}
            />
          </Field>
          <Field label={t('superAdmin:tenantsPage.fieldPlan', { defaultValue: 'Plan' })}>
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
            <PlanPreview
              plan={form.plan as TenantPlan}
              currentPlan={tenant.plan}
            />
          </Field>
          <Field label={t('superAdmin:tenantsPage.fieldActive', { defaultValue: 'Actif' })}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span style={{ fontSize: 13, color: theme.colors.textMuted }}>
                {t('superAdmin:tenantsPage.workspaceAccessible', { defaultValue: 'Espace de travail accessible' })}
              </span>
            </label>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <NumField label={t('superAdmin:tenantsPage.maxUsers', { defaultValue: 'Max users' })} value={form.maxUsers} onChange={(v) => setForm({ ...form, maxUsers: v })} />
            <NumField label={t('superAdmin:tenantsPage.maxWorkOrders', { defaultValue: 'Max BTs/mois' })} value={form.maxWorkOrdersPerMonth} onChange={(v) => setForm({ ...form, maxWorkOrdersPerMonth: v })} />
            <NumField label={t('superAdmin:tenantsPage.maxStorage', { defaultValue: 'Max stockage (MB)' })} value={form.maxStorageMb} onChange={(v) => setForm({ ...form, maxStorageMb: v })} />
            <NumField label={t('superAdmin:tenantsPage.maxClients', { defaultValue: 'Max clients' })} value={form.maxClients} onChange={(v) => setForm({ ...form, maxClients: v })} />
          </div>
        </Stack>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={buttonStyles.secondary}>
            {t('superAdmin:tenantsPage.cancel', { defaultValue: 'Annuler' })}
          </button>
          <button onClick={() => save.mutate()} disabled={save.isPending} style={buttonStyles.primary}>
            {save.isPending ? t('superAdmin:tenantsPage.saving', { defaultValue: 'Sauvegarde…' }) : t('superAdmin:tenantsPage.save', { defaultValue: 'Sauvegarder' })}
          </button>
        </div>
        {save.isError && (
          <p style={{ color: theme.colors.danger, marginTop: 8, fontSize: 13 }}>
            {t('superAdmin:tenantsPage.editError', { defaultValue: 'Échec : vérifie les valeurs et réessaie.' })}
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
  const { t } = useTranslation('superAdmin');
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
          🗑 {t('superAdmin:tenantsPage.deletePermanently', { defaultValue: 'Supprimer définitivement' })}
        </h2>
        <p style={{ fontSize: 13, color: theme.colors.text, margin: '0 0 12px' }}>
          {t('superAdmin:tenantsPage.deleteWarnPart1', { defaultValue: 'Cette action est ' })}<strong>{t('superAdmin:tenantsPage.irreversible', { defaultValue: 'irréversible' })}</strong>{t('superAdmin:tenantsPage.deleteWarnPart2', { defaultValue: '. Toutes les données de ' })}
          <strong>{tenant.name}</strong>{t('superAdmin:tenantsPage.deleteWarnPart3', { defaultValue: ' seront effacées : utilisateurs, bons de travail, clients, pièces jointes, configuration — tout.' })}
        </p>
        <p style={{ fontSize: 13, color: theme.colors.textMuted, margin: '0 0 8px' }}>
          {t('superAdmin:tenantsPage.confirmSlugPrompt', { defaultValue: 'Pour confirmer, tapez le slug ' })}
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
            {t('superAdmin:tenantsPage.failureWith', { defaultValue: 'Échec : {{error}}', error: errorText })}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={buttonStyles.secondary}>
            {t('superAdmin:tenantsPage.cancel', { defaultValue: 'Annuler' })}
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
            {del.isPending ? t('superAdmin:tenantsPage.deleting', { defaultValue: 'Suppression…' }) : t('superAdmin:tenantsPage.deletePermanently', { defaultValue: 'Supprimer définitivement' })}
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

function PlanPreview({
  plan,
  currentPlan,
}: {
  plan: TenantPlan;
  currentPlan: TenantPlan;
}) {
  const { t } = useTranslation('superAdmin');
  const { data } = useQuery({
    queryKey: ['superAdmin', 'plans'],
    queryFn: getPlanCatalog,
    staleTime: 5 * 60_000,
  });
  const def = data?.find((p) => p.code === plan);
  if (!def) return null;
  const hasBase = def.priceMonthly > 0;
  const hasPerUser = def.pricePerUserMonthly > 0;
  const isFree = !hasBase && !hasPerUser;
  const isChanging = plan !== currentPlan;
  return (
    <div
      style={{
        marginTop: 4,
        padding: '8px 10px',
        borderRadius: 6,
        background: theme.colors.surfaceAlt,
        border: `1px solid ${isChanging ? theme.colors.warning : theme.colors.border}`,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          {def.displayName}
          {isChanging && (
            <span style={{ marginLeft: 6, fontSize: 10, color: theme.colors.warning }}>
              ⚠ {t('superAdmin:tenantsPage.quotasSnap', { defaultValue: 'quotas snap au save' })}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: theme.colors.textMuted, marginTop: 2 }}>
          👥 {def.quotas.maxUsers} · 📋 {def.quotas.maxWorkOrdersPerMonth.toLocaleString('fr-CA')} · 🧑‍🤝‍🧑 {def.quotas.maxClients.toLocaleString('fr-CA')} · 💾{' '}
          {def.quotas.maxStorageMb >= 1000
            ? `${(def.quotas.maxStorageMb / 1000).toFixed(0)} Go`
            : `${def.quotas.maxStorageMb} Mo`}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.colors.primary, textAlign: 'right', lineHeight: 1.3 }}>
        {isFree && t('superAdmin:tenantsPage.free', { defaultValue: 'Gratuit' })}
        {hasBase && (
          <div>
            {def.priceMonthly} {def.currency}
            <span style={{ fontSize: 10, color: theme.colors.textMuted, fontWeight: 500 }}>
              {' '}{t('superAdmin:tenantsPage.perMonth', { defaultValue: '/ mois' })}
            </span>
          </div>
        )}
        {hasPerUser && (
          <div>
            {hasBase && <span style={{ color: theme.colors.textMuted, fontWeight: 500 }}>+ </span>}
            {def.pricePerUserMonthly} {def.currency}
            <span style={{ fontSize: 10, color: theme.colors.textMuted, fontWeight: 500 }}>
              {' '}{t('superAdmin:tenantsPage.perUserPerMonth', { defaultValue: '/ user / mois' })}
            </span>
          </div>
        )}
      </div>
    </div>
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
