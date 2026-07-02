import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Role } from '../types';
import { useAuthStore } from '../context/auth.store';
import {
  getMySubscription,
  type QuotaSeverity,
  type QuotaWarning,
} from '../services/subscription.service';

/**
 * Global quota-warning banner (B7.10).
 *
 * Sticky top-of-viewport bar shown to a tenant's primary admin when at
 * least one quota crosses the warning threshold (75%). The color and
 * copy scale with severity :
 *   - warning  (≥ 75%) : yellow, gentle nudge
 *   - danger   (≥ 90%) : orange, "close to the wall"
 *   - exceeded (≥ 100%): red, "you are blocked"
 *
 * The banner suppresses itself for :
 *   - non-ADMIN users
 *   - the SA on their own /super-admin routes (they see the SA dashboard)
 *   - non-primary admins (backend returns 403 → we silently skip)
 *
 * Clicking anywhere on the banner jumps to /mon-abonnement.
 */
export default function QuotaWarningBanner() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation('subscription');

  const enabled = user?.role === Role.ADMIN;

  const { data } = useQuery({
    queryKey: ['tenant', 'subscription'],
    queryFn: getMySubscription,
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
  });

  if (!enabled || !data || data.warnings.length === 0) return null;

  const worst = pickWorst(data.warnings);
  const style = STYLE[worst.severity];

  return (
    <div
      onClick={() => navigate('/mon-abonnement')}
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 999,
        background: style.bg,
        color: style.fg,
        padding: '8px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
      }}
    >
      <span>
        {style.icon}{' '}
        <strong>{worst.percent}%</strong>{' '}
        {t(
          worst.severity === 'exceeded'
            ? 'quotaBanner.sentenceExceeded'
            : worst.severity === 'danger'
            ? 'quotaBanner.sentenceDanger'
            : 'quotaBanner.sentence',
          { kind: t(`quotaKind.${worst.kind}`) },
        )}
        {data.warnings.length > 1 && (
          <span style={{ opacity: 0.85, marginLeft: 6 }}>
            {t('quotaBanner.plusOthers', { count: data.warnings.length - 1 })}
          </span>
        )}
      </span>
      <span
        style={{
          padding: '3px 10px',
          borderRadius: 999,
          background: 'rgba(0,0,0,0.12)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {t('quotaBanner.cta')}
      </span>
    </div>
  );
}

const STYLE: Record<QuotaSeverity, { bg: string; fg: string; icon: string }> = {
  warning: { bg: '#FEF3C7', fg: '#78350F', icon: '⚠️' },
  danger: { bg: '#FED7AA', fg: '#7C2D12', icon: '⚠️' },
  exceeded: { bg: '#DC2626', fg: '#FFFFFF', icon: '🚫' },
};

const RANK: Record<QuotaSeverity, number> = { warning: 1, danger: 2, exceeded: 3 };

function pickWorst(list: QuotaWarning[]): QuotaWarning {
  return list.reduce((worst, cur) =>
    RANK[cur.severity] > RANK[worst.severity] ? cur : worst,
  );
}

