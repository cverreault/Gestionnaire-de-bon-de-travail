import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  theme,
  cardStyles,
  layoutStyles,
  formStyles,
  buttonStyles,
} from '../theme';
import {
  getPlanCatalog,
  updatePlan,
  type PlanDefinition,
  type UpdatePlanInput,
} from '../services/super-admin.service';
import { toast } from '../context/toast.store';

/**
 * SA plan catalog page (B7.8 — DB-backed + editable).
 *
 * Three-card Stripe-style layout with an "Éditer" button on each card
 * opening a side modal. Updates go through `PATCH /super-admin/plans/:code`.
 * Per-user pricing is now first-class : the card displays `49 $/mois`,
 * `20 $/utilisateur/mois`, or both, depending on how the SA configured it.
 *
 * The plan `code` (FREE / PRO / ENTERPRISE) is read-only — it's the stable
 * join key with `tenant.plan` and is not exposed in the editor.
 */
export default function SuperAdminPlansPage() {
  const { t } = useTranslation('superAdmin');
  const { data, isLoading, error } = useQuery({
    queryKey: ['superAdmin', 'plans'],
    queryFn: getPlanCatalog,
    staleTime: 60_000,
  });

  const [editing, setEditing] = useState<PlanDefinition | null>(null);

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{t('plans.title')}</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          {t('plans.subtitle')}
        </p>
      </header>

      {isLoading && <p>{t('plans.loading')}</p>}
      {error && (
        <p style={{ color: theme.colors.danger }}>{t('plans.loadFailed')}</p>
      )}
      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${data.data.length}, minmax(0, 1fr))`,
            gap: 16,
          }}
        >
          {data.data.map((p) => (
            <PlanCard key={p.code} plan={p} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}

      {editing && (
        <EditPlanModal plan={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

// ─── Plan card ─────────────────────────────────────────────────────

function PlanCard({
  plan,
  onEdit,
}: {
  plan: PlanDefinition;
  onEdit: () => void;
}) {
  const { t } = useTranslation('superAdmin');
  const isRecommended = plan.recommended === true;
  const accent = colorFor(plan.code);

  return (
    <div
      style={{
        ...cardStyles.card,
        padding: 0,
        overflow: 'hidden',
        border: isRecommended
          ? `2px solid ${accent}`
          : `1px solid ${theme.colors.border}`,
        position: 'relative',
        opacity: plan.isActive === false ? 0.55 : 1,
      }}
    >
      {isRecommended && (
        <span
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 999,
            background: accent,
            color: '#fff',
            letterSpacing: 0.5,
          }}
        >
          {t('plans.recommended')}
        </span>
      )}

      <div
        style={{
          padding: '20px 20px 16px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: accent,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {plan.code}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
          {plan.displayName}
        </div>
        <div style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
          {plan.tagline}
        </div>

        <PriceBlock plan={plan} />
      </div>

      <div style={{ padding: 20 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: theme.colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          {t('plans.quotasIncluded')}
        </div>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px 12px',
            fontSize: 12,
          }}
        >
          <QuotaLine icon="👥" label={t('plans.columns.users')} value={plan.quotas.maxUsers} />
          <QuotaLine icon="📋" label={t('plans.columns.btsPerMonth')} value={plan.quotas.maxWorkOrdersPerMonth.toLocaleString()} />
          <QuotaLine icon="🧑‍🤝‍🧑" label={t('plans.columns.clients')} value={plan.quotas.maxClients.toLocaleString()} />
          <QuotaLine icon="💾" label={t('plans.columns.storage')} value={formatStorage(plan.quotas.maxStorageMb)} />
        </ul>

        {plan.features.length > 0 && (
          <>
            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: `1px solid ${theme.colors.border}`,
                fontSize: 11,
                fontWeight: 600,
                color: theme.colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {t('plans.included')}
            </div>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '8px 0 0',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              {plan.features.map((f) => (
                <li key={f} style={{ display: 'flex', gap: 6 }}>
                  <span style={{ color: accent, fontWeight: 700 }}>✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div
        style={{
          padding: '10px 20px 16px',
          background: theme.colors.surfaceAlt,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 11, color: theme.colors.textMuted, lineHeight: 1.4 }}>
          {plan.description}
        </span>
        <button
          onClick={onEdit}
          style={{ ...buttonStyles.secondary, fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' }}
        >
          {t('plans.editButton')}
        </button>
      </div>
    </div>
  );
}

function PriceBlock({ plan }: { plan: PlanDefinition }) {
  const { t } = useTranslation('superAdmin');
  const hasBase = plan.priceMonthly > 0;
  const hasPerUser = plan.pricePerUserMonthly > 0;
  const isFree = !hasBase && !hasPerUser;

  if (isFree) {
    return (
      <div style={{ marginTop: 16, fontSize: 28, fontWeight: 800 }}>
        {t('plans.free')}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {hasBase && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 32, fontWeight: 800 }}>{plan.priceMonthly}</span>
          <span style={{ fontSize: 13, color: theme.colors.textMuted }}>
            {plan.currency} {t('plans.perMonth')}
          </span>
        </div>
      )}
      {hasPerUser && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          {hasBase && (
            <span style={{ fontSize: 13, color: theme.colors.textMuted, fontWeight: 600 }}>
              +
            </span>
          )}
          <span style={{ fontSize: hasBase ? 18 : 32, fontWeight: 700 }}>
            {plan.pricePerUserMonthly}
          </span>
          <span style={{ fontSize: 13, color: theme.colors.textMuted }}>
            {plan.currency} {t('plans.perUserPerMonth')}
          </span>
        </div>
      )}
    </div>
  );
}

function QuotaLine({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string | number;
}) {
  return (
    <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: theme.colors.textMuted }}>
        <span style={{ marginRight: 4 }}>{icon}</span>
        {label}
      </span>
      <span style={{ fontWeight: 600, color: theme.colors.text }}>{value}</span>
    </li>
  );
}

// ─── Edit modal ────────────────────────────────────────────────────

function EditPlanModal({
  plan,
  onClose,
}: {
  plan: PlanDefinition;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdatePlanInput>({
    displayName: plan.displayName,
    tagline: plan.tagline,
    description: plan.description,
    priceMonthly: plan.priceMonthly,
    pricePerUserMonthly: plan.pricePerUserMonthly,
    currency: plan.currency,
    maxUsers: plan.quotas.maxUsers,
    maxWorkOrdersPerMonth: plan.quotas.maxWorkOrdersPerMonth,
    maxStorageMb: plan.quotas.maxStorageMb,
    maxClients: plan.quotas.maxClients,
    features: plan.features,
    recommended: plan.recommended ?? false,
    isActive: plan.isActive ?? true,
  });

  const { t } = useTranslation('superAdmin');
  const save = useMutation({
    mutationFn: () => updatePlan(plan.code, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superAdmin', 'plans'] });
      toast.success(t('plans.toasts.updated', { name: plan.displayName }));
      onClose();
    },
    onError: (err) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? '';
      toast.error(Array.isArray(msg) ? msg.join(', ') : String(msg));
    },
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '5vh 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...cardStyles.card,
          width: '100%',
          maxWidth: 640,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${theme.colors.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: 700 }}>
              {t('plans.editModal.eyebrow')}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{plan.code}</div>
          </div>
          <button onClick={onClose} style={buttonStyles.secondary}>
            {t('plans.editModal.close')}
          </button>
        </header>

        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          <Section title={t('plans.editModal.sections.presentation')}>
            <Field label={t('plans.editModal.fields.displayName')}>
              <input
                value={form.displayName ?? ''}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                style={formStyles.input}
              />
            </Field>
            <Field label={t('plans.editModal.fields.tagline')}>
              <input
                value={form.tagline ?? ''}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                style={formStyles.input}
              />
            </Field>
            <Field label={t('plans.editModal.fields.description')}>
              <textarea
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                style={{ ...formStyles.input, fontFamily: 'inherit', resize: 'vertical' }}
              />
            </Field>
          </Section>

          <Section title={t('plans.editModal.sections.pricing')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <NumField
                label={t('plans.editModal.fields.baseMonthly')}
                value={form.priceMonthly}
                min={0}
                step={1}
                onChange={(v) => setForm({ ...form, priceMonthly: v })}
              />
              <NumField
                label={t('plans.editModal.fields.perUserMonthly')}
                value={form.pricePerUserMonthly}
                min={0}
                step={1}
                onChange={(v) => setForm({ ...form, pricePerUserMonthly: v })}
              />
              <Field label={t('plans.editModal.fields.currency')}>
                <select
                  value={form.currency ?? 'CAD'}
                  onChange={(e) => setForm({ ...form, currency: e.target.value as 'CAD' | 'USD' | 'EUR' })}
                  style={formStyles.input}
                >
                  <option value="CAD">CAD</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </Field>
            </div>
            <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>
              {t('plans.editModal.pricingHint')}
            </div>
          </Section>

          <Section title={t('plans.editModal.sections.quotas')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <NumField
                label={t('plans.editModal.fields.maxUsers')}
                value={form.maxUsers}
                min={1}
                onChange={(v) => setForm({ ...form, maxUsers: v })}
              />
              <NumField
                label={t('plans.editModal.fields.maxBts')}
                value={form.maxWorkOrdersPerMonth}
                min={1}
                onChange={(v) => setForm({ ...form, maxWorkOrdersPerMonth: v })}
              />
              <NumField
                label={t('plans.editModal.fields.maxClients')}
                value={form.maxClients}
                min={1}
                onChange={(v) => setForm({ ...form, maxClients: v })}
              />
              <NumField
                label={t('plans.editModal.fields.maxStorage')}
                value={form.maxStorageMb}
                min={1}
                onChange={(v) => setForm({ ...form, maxStorageMb: v })}
              />
            </div>
          </Section>

          <Section title={t('plans.editModal.sections.features')}>
            <textarea
              value={(form.features ?? []).join('\n')}
              onChange={(e) =>
                setForm({
                  ...form,
                  features: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                })
              }
              rows={6}
              style={{ ...formStyles.input, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </Section>

          <Section title={t('plans.editModal.sections.availability')}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={form.recommended ?? false}
                onChange={(e) => setForm({ ...form, recommended: e.target.checked })}
              />
              {t('plans.editModal.recommended')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 6 }}>
              <input
                type="checkbox"
                checked={form.isActive ?? true}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              {t('plans.editModal.active')}
            </label>
          </Section>
        </div>

        <footer
          style={{
            padding: '12px 20px',
            borderTop: `1px solid ${theme.colors.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            background: theme.colors.surface,
            position: 'sticky',
            bottom: 0,
          }}
        >
          <button onClick={onClose} style={buttonStyles.secondary}>
            {t('plans.editModal.cancel')}
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            style={{
              ...buttonStyles.primary,
              opacity: save.isPending ? 0.6 : 1,
              cursor: save.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {save.isPending ? t('plans.editModal.saving') : t('plans.editModal.save')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: theme.colors.textMuted }}>{label}</span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        step={step ?? 1}
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') onChange(undefined);
          else {
            const n = Number(v);
            onChange(Number.isFinite(n) ? n : undefined);
          }
        }}
        style={formStyles.input}
      />
    </Field>
  );
}

function colorFor(code: string): string {
  switch (code) {
    case 'FREE':
      return theme.colors.textMuted;
    case 'PRO':
      return theme.colors.primary;
    case 'ENTERPRISE':
      return '#8B5CF6';
    default:
      return theme.colors.primary;
  }
}

function formatStorage(mb: number): string {
  if (mb < 1000) return `${mb} Mo`;
  return `${(mb / 1000).toFixed(mb % 1000 === 0 ? 0 : 1)} Go`;
}
