import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { theme, cardStyles, layoutStyles, buttonStyles, formStyles } from '../theme';
import {
  getMySubscription,
  getSubscriptionHistory,
  requestPlanChange,
  getBillingStatus,
  createCheckoutSession,
  createBillingPortalSession,
  type MonthlyPeakRow,
  type MySubscription,
  type PlanCode,
} from '../services/subscription.service';
import { getPlanCatalog, type PlanDefinition } from '../services/super-admin.service';
import { toast } from '../context/toast.store';

/**
 * Tenant primary-admin subscription page (B7.9).
 *
 * Shows the current plan, quota consumption, and monthly charge
 * estimate. A "Demander un changement" section lets the primary admin
 * request a plan change — the actual switch stays SA-approved for now
 * (event goes into the audit stream).
 *
 * Access control : the backend PrimaryAdminGuard rejects any user who
 * isn't the first ADMIN of the tenant. On 403 we render a friendly
 * "réservé" panel instead of the payload.
 */
export default function MySubscriptionPage() {
  const { t } = useTranslation('subscription');
  const subQuery = useQuery({
    queryKey: ['tenant', 'subscription'],
    queryFn: getMySubscription,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isForbidden =
    (subQuery.error as { response?: { status?: number } } | null)?.response
      ?.status === 403;

  return (
    <div style={layoutStyles.page}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>💳 {t('title')}</h1>
        <p style={{ color: theme.colors.textMuted, margin: '4px 0 0', fontSize: 13 }}>
          {t('subtitle')}
        </p>
      </header>

      {subQuery.isLoading && <p>{t('loading')}</p>}
      {isForbidden && <ForbiddenPanel />}
      {subQuery.error && !isForbidden && (
        <p style={{ color: theme.colors.danger }}>{t('loadFailed')}</p>
      )}
      {subQuery.data && <SubscriptionView sub={subQuery.data} />}
    </div>
  );
}

function ForbiddenPanel() {
  const { t } = useTranslation('subscription');
  return (
    <div
      style={{
        ...cardStyles.card,
        padding: 24,
        textAlign: 'center',
        color: theme.colors.textMuted,
        fontSize: 14,
      }}
    >
      {t('forbidden.title')}
      <br />
      <span style={{ fontSize: 12 }}>{t('forbidden.subtitle')}</span>
    </div>
  );
}

function SubscriptionView({ sub }: { sub: MySubscription }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BillingCard sub={sub} />
      <PeaksCard sub={sub} />
      <QuotasCard sub={sub} />
      <HistoryCard />
      <ChangePlanCard sub={sub} />
    </div>
  );
}

// ─── Billing block ─────────────────────────────────────────────────

function BillingCard({ sub }: { sub: MySubscription }) {
  const { plan, billing, usage } = sub;
  const { t, i18n } = useTranslation('subscription');
  const hasBase = billing.priceMonthly > 0;
  const hasPerUser = billing.pricePerUserMonthly > 0;
  const isFree = !hasBase && !hasPerUser;
  const numberLocale = i18n.language === 'en' ? 'en-CA' : 'fr-CA';
  const peakDrivesBill = billing.billedUsers > usage.activeUsers;

  return (
    <section
      style={{
        ...cardStyles.card,
        padding: 20,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 24,
        alignItems: 'center',
      }}
    >
      <div>
        <div style={eyebrow}>{t('billing.currentPlan')}</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
          {plan.displayName}{' '}
          <span style={{ fontSize: 12, fontWeight: 500, color: theme.colors.textMuted }}>
            ({plan.code})
          </span>
        </div>
        <div style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 4 }}>
          {plan.tagline}
        </div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={eyebrow}>{t('billing.estimatedThisMonth')}</div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            marginTop: 4,
            color: theme.colors.text,
          }}
        >
          {isFree
            ? t('billing.free')
            : `${billing.monthlyCharge.toLocaleString(numberLocale)} ${billing.currency}`}
        </div>
        {!isFree && (
          <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
            {hasBase && (
              <span>
                {t('billing.baseFee', {
                  amount: billing.priceMonthly,
                  currency: billing.currency,
                })}
              </span>
            )}
            {hasBase && hasPerUser && <span>{t('billing.plus')}</span>}
            {hasPerUser && (
              <span>
                {t('billing.perUserFee', {
                  count: billing.billedUsers,
                  amount: billing.pricePerUserMonthly,
                  currency: billing.currency,
                })}
              </span>
            )}
          </div>
        )}
        {hasPerUser && peakDrivesBill && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: theme.colors.warning,
              fontWeight: 600,
            }}
            title={t('billing.peakExplanation')}
          >
            {t('billing.peakBadge', {
              peak: billing.billedUsers,
              current: usage.activeUsers,
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Peaks card ────────────────────────────────────────────────────

function PeaksCard({ sub }: { sub: MySubscription }) {
  const { t, i18n } = useTranslation('subscription');
  const numberLocale = i18n.language === 'en' ? 'en-CA' : 'fr-CA';
  const { peaks } = sub;
  return (
    <section style={{ ...cardStyles.card, padding: 20 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>{t('peaks.title')}</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: theme.colors.textMuted }}>
        {t('peaks.subtitle', { yearMonth: peaks.yearMonth })}
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        <PeakStat
          icon="👥"
          label={t('peaks.users')}
          value={peaks.maxUsers.toLocaleString(numberLocale)}
          highlight
        />
        <PeakStat
          icon="🧑‍🤝‍🧑"
          label={t('peaks.clients')}
          value={peaks.maxClients.toLocaleString(numberLocale)}
        />
        <PeakStat
          icon="📋"
          label={t('peaks.workOrders')}
          value={peaks.maxWorkOrdersThisMonth.toLocaleString(numberLocale)}
        />
        <PeakStat
          icon="💾"
          label={t('peaks.storage')}
          value={formatBytes(peaks.maxStorageBytes)}
        />
      </div>
    </section>
  );
}

function PeakStat({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 6,
        background: highlight ? theme.colors.surfaceAlt : theme.colors.surface,
        border: `1px solid ${highlight ? theme.colors.warning : theme.colors.border}`,
      }}
    >
      <div style={{ fontSize: 11, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: theme.colors.text, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

// ─── History card ──────────────────────────────────────────────────

function HistoryCard() {
  const { t, i18n } = useTranslation('subscription');
  const numberLocale = i18n.language === 'en' ? 'en-CA' : 'fr-CA';
  const history = useQuery({
    queryKey: ['tenant', 'subscription', 'history'],
    queryFn: getSubscriptionHistory,
    retry: false,
    staleTime: 60_000,
  });

  return (
    <section style={{ ...cardStyles.card, padding: 20 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>{t('history.title')}</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: theme.colors.textMuted }}>
        {t('history.subtitle')}
      </p>

      {history.isLoading && <p style={{ fontSize: 13, color: theme.colors.textMuted }}>{t('loading')}</p>}
      {history.error && (
        <p style={{ fontSize: 13, color: theme.colors.danger }}>{t('history.loadFailed')}</p>
      )}
      {history.data && history.data.length <= 1 && (
        <p style={{ fontSize: 13, color: theme.colors.textMuted }}>{t('history.empty')}</p>
      )}
      {history.data && history.data.length > 1 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: theme.colors.surfaceAlt }}>
                <Th>{t('history.month')}</Th>
                <Th>{t('history.users')}</Th>
                <Th>{t('history.clients')}</Th>
                <Th>{t('history.workOrders')}</Th>
                <Th>{t('history.storage')}</Th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((row) => (
                <HistoryRow key={row.yearMonth} row={row} locale={numberLocale} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '8px 12px',
        fontSize: 11,
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

function HistoryRow({ row, locale }: { row: MonthlyPeakRow; locale: string }) {
  return (
    <tr style={{ borderTop: `1px solid ${theme.colors.border}` }}>
      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{row.yearMonth}</td>
      <td style={{ padding: '8px 12px' }}>{row.maxUsers.toLocaleString(locale)}</td>
      <td style={{ padding: '8px 12px' }}>{row.maxClients.toLocaleString(locale)}</td>
      <td style={{ padding: '8px 12px' }}>{row.maxWorkOrdersThisMonth.toLocaleString(locale)}</td>
      <td style={{ padding: '8px 12px' }}>{formatBytes(row.maxStorageBytes)}</td>
    </tr>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: theme.colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

// ─── Quotas block ──────────────────────────────────────────────────

function QuotasCard({ sub }: { sub: MySubscription }) {
  const { quotas, usage } = sub;
  const { t } = useTranslation('subscription');
  const storageMb = usage.currentStorageBytes / 1024 / 1024;

  return (
    <section style={{ ...cardStyles.card, padding: 20 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>{t('quotas.title')}</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <QuotaBar
          label={t('quotas.users')}
          icon="👥"
          current={usage.activeUsers}
          max={quotas.maxUsers}
        />
        <QuotaBar
          label={t('quotas.workOrdersThisMonth')}
          icon="📋"
          current={usage.currentWorkOrdersThisMonth}
          max={quotas.maxWorkOrdersPerMonth}
        />
        <QuotaBar
          label={t('quotas.clients')}
          icon="🧑‍🤝‍🧑"
          current={usage.currentClients}
          max={quotas.maxClients}
        />
        <QuotaBar
          label={t('quotas.storage')}
          icon="💾"
          current={storageMb}
          max={quotas.maxStorageMb}
          currentLabel={formatBytes(usage.currentStorageBytes)}
          maxLabel={`${quotas.maxStorageMb} MB`}
        />
      </div>
    </section>
  );
}

function QuotaBar({
  icon,
  label,
  current,
  max,
  currentLabel,
  maxLabel,
}: {
  icon: string;
  label: string;
  current: number;
  max: number;
  currentLabel?: string;
  maxLabel?: string;
}) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const color =
    pct >= 90
      ? theme.colors.danger
      : pct >= 70
      ? theme.colors.warning
      : theme.colors.success;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 13,
          marginBottom: 4,
        }}
      >
        <span style={{ color: theme.colors.textMuted }}>
          <span style={{ marginRight: 6 }}>{icon}</span>
          {label}
        </span>
        <span style={{ fontWeight: 600 }}>
          {currentLabel ?? current.toLocaleString('fr-CA')}
          <span style={{ color: theme.colors.textMuted, fontWeight: 400 }}>
            {' / '}
            {maxLabel ?? max.toLocaleString('fr-CA')}
          </span>{' '}
          <span style={{ fontSize: 11, color, fontWeight: 700 }}>
            ({pct.toFixed(0)}%)
          </span>
        </span>
      </div>
      <div
        style={{
          height: 8,
          width: '100%',
          background: theme.colors.surfaceAlt,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

// ─── Change plan block ─────────────────────────────────────────────

function ChangePlanCard({ sub }: { sub: MySubscription }) {
  const qc = useQueryClient();
  const plans = useQuery({
    queryKey: ['tenant', 'plan-catalog'],
    // Reuse the SA plans list — same public shape. When a customer-facing
    // "public plans" endpoint lands we'll swap it here in one line.
    queryFn: getPlanCatalog,
    staleTime: 5 * 60_000,
  });

  const [targetPlan, setTargetPlan] = useState<PlanCode | ''>('');
  const [message, setMessage] = useState('');

  const { t } = useTranslation('subscription');
  const request = useMutation({
    mutationFn: () =>
      requestPlanChange({ targetPlan: targetPlan as PlanCode, message: message.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('toasts.changeRequested'));
      qc.invalidateQueries({ queryKey: ['tenant', 'subscription'] });
      setTargetPlan('');
      setMessage('');
    },
    onError: (err) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? '';
      toast.error(Array.isArray(msg) ? msg.join(', ') : String(msg));
    },
  });

  // B22 — Stripe online payment (shown only when the SA configured it)
  const billing = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: getBillingStatus,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const checkout = useMutation({
    mutationFn: (planCode: string) => createCheckoutSession(planCode),
    onSuccess: (res) => {
      if (res.url) window.location.href = res.url;
      else toast.error('Stripe n\'a pas retourné d\'URL de paiement.');
    },
    onError: (err) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? String(err);
      toast.error(Array.isArray(msg) ? msg.join(', ') : String(msg));
    },
  });
  const portal = useMutation({
    mutationFn: createBillingPortalSession,
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) => {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message ?? String(err);
      toast.error(Array.isArray(msg) ? msg.join(', ') : String(msg));
    },
  });
  const stripeEnabled = billing.data?.enabled === true;
  const canPayOnline =
    stripeEnabled && !!targetPlan && (billing.data?.purchasablePlans ?? []).includes(targetPlan);

  const availablePlans =
    plans.data?.filter(
      (p) => p.code !== sub.plan.code && p.isActive !== false,
    ) ?? [];

  const selectedDef = availablePlans.find((p) => p.code === targetPlan);

  return (
    <section style={{ ...cardStyles.card, padding: 20 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>{t('changePlan.title')}</h2>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: theme.colors.textMuted }}>
        {t('changePlan.subtitle')}
      </p>

      {availablePlans.length === 0 ? (
        <p style={{ fontSize: 13, color: theme.colors.textMuted }}>
          {t('changePlan.noneAvailable')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: theme.colors.textMuted }}>
                {t('changePlan.newPlan')}
              </span>
              <select
                value={targetPlan}
                onChange={(e) => setTargetPlan(e.target.value as PlanCode | '')}
                style={formStyles.input}
              >
                <option value="">{t('changePlan.select')}</option>
                {availablePlans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.displayName} ({p.code})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: theme.colors.textMuted }}>
                {t('changePlan.message')}
              </span>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('changePlan.messagePlaceholder')}
                style={formStyles.input}
              />
            </label>
          </div>

          {selectedDef && <PlanTargetPreview plan={selectedDef} />}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            {stripeEnabled && (
              <button
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
                style={{ ...buttonStyles.secondary, opacity: portal.isPending ? 0.5 : 1 }}
                title={t('billing.portalHint', { defaultValue: 'Factures, carte de paiement, annulation' })}
              >
                🧾 {t('billing.portal', { defaultValue: 'Gérer ma facturation' })}
              </button>
            )}
            {canPayOnline && (
              <button
                onClick={() => checkout.mutate(targetPlan as string)}
                disabled={checkout.isPending}
                style={{ ...buttonStyles.primary, opacity: checkout.isPending ? 0.5 : 1 }}
              >
                {checkout.isPending
                  ? t('billing.redirecting', { defaultValue: 'Redirection…' })
                  : `💳 ${t('billing.payOnline', { defaultValue: 'Payer en ligne' })}`}
              </button>
            )}
            <button
              onClick={() => request.mutate()}
              disabled={!targetPlan || request.isPending}
              style={{
                ...(canPayOnline ? buttonStyles.secondary : buttonStyles.primary),
                opacity: !targetPlan || request.isPending ? 0.5 : 1,
                cursor: !targetPlan || request.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              {request.isPending ? t('changePlan.submitting') : t('changePlan.submit')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PlanTargetPreview({ plan }: { plan: PlanDefinition }) {
  const hasBase = plan.priceMonthly > 0;
  const hasPerUser = plan.pricePerUserMonthly > 0;
  const isFree = !hasBase && !hasPerUser;
  return (
    <div
      style={{
        padding: 12,
        background: theme.colors.surfaceAlt,
        borderRadius: 6,
        border: `1px solid ${theme.colors.border}`,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{plan.displayName}</div>
        <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
          👥 {plan.quotas.maxUsers} users · 📋{' '}
          {plan.quotas.maxWorkOrdersPerMonth.toLocaleString('fr-CA')} BTs/mois ·
          🧑‍🤝‍🧑 {plan.quotas.maxClients.toLocaleString('fr-CA')} clients · 💾{' '}
          {plan.quotas.maxStorageMb >= 1000
            ? `${(plan.quotas.maxStorageMb / 1000).toFixed(0)} Go`
            : `${plan.quotas.maxStorageMb} Mo`}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: theme.colors.primary, whiteSpace: 'nowrap' }}>
        {isFree && 'Gratuit'}
        {hasBase && (
          <div>
            {plan.priceMonthly} {plan.currency}
            <span style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: 500 }}>
              {' '}/ mois
            </span>
          </div>
        )}
        {hasPerUser && (
          <div>
            {hasBase && <span style={{ color: theme.colors.textMuted, fontWeight: 500 }}>+ </span>}
            {plan.pricePerUserMonthly} {plan.currency}
            <span style={{ fontSize: 11, color: theme.colors.textMuted, fontWeight: 500 }}>
              {' '}/ user / mois
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
