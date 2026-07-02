import { useEffect, useState } from 'react';
import { useAuthStore } from '../context/auth.store';
import { theme } from '../theme';

/**
 * Persistent banner displayed while the SA is impersonating another
 * tenant's ADMIN (B7).
 *
 * Sticky top of the viewport, bright orange so it's impossible to
 * forget you're inside someone else's workspace. "Sortir" restores
 * the SA's original session and redirects back to the SA portal.
 *
 * The impersonation access token is signed with a 15-min TTL — we
 * display the remaining time and auto-stop when it hits zero so the
 * SA doesn't suddenly start seeing 401s without knowing why (B7.6).
 */
export default function ImpersonationBanner() {
  const impersonation = useAuthStore((s) => s.impersonation);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);
  const [now, setNow] = useState(() => Date.now());

  // Tick once per second only while impersonating.
  useEffect(() => {
    if (!impersonation.active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [impersonation.active]);

  // Auto-exit on expiry.
  useEffect(() => {
    if (!impersonation.active || !impersonation.expiresAt) return;
    if (now >= impersonation.expiresAt) {
      stopImpersonation();
      window.location.href = '/super-admin/tenants?reason=impersonation-expired';
    }
  }, [now, impersonation.active, impersonation.expiresAt, stopImpersonation]);

  if (!impersonation.active) return null;

  const handleExit = () => {
    stopImpersonation();
    // After restoring the SA session, drop the user back at the
    // tenants list — they were probably about to enter another one.
    window.location.href = '/super-admin/tenants';
  };

  const remainingMs = impersonation.expiresAt
    ? Math.max(0, impersonation.expiresAt - now)
    : null;
  const remainingLabel = remainingMs !== null
    ? formatRemaining(remainingMs)
    : null;
  const isLowOnTime = remainingMs !== null && remainingMs <= 60_000;

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: isLowOnTime ? '#DC2626' : '#F59E0B',
        color: isLowOnTime ? '#fff' : '#1f2937',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
        fontWeight: 600,
        fontSize: 13,
        transition: 'background 0.3s ease, color 0.3s ease',
      }}
    >
      <span>
        🎭 Vous êtes connecté en tant que{' '}
        <strong>{impersonation.impersonatedUserEmail}</strong> dans{' '}
        <strong>{impersonation.impersonatedTenantName}</strong>{' '}
        <span style={{ opacity: 0.7, fontWeight: 400 }}>
          ({impersonation.impersonatedTenantSlug})
        </span>
        {remainingLabel && (
          <span
            style={{
              marginLeft: 12,
              padding: '2px 8px',
              borderRadius: 999,
              background: isLowOnTime ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
              fontSize: 12,
              fontVariantNumeric: 'tabular-nums',
            }}
            title="Temps restant avant expiration du token d'imitation"
          >
            ⏱ {remainingLabel}
          </span>
        )}
      </span>
      <button
        onClick={handleExit}
        style={{
          background: theme.colors.text,
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 12px',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Sortir
      </button>
    </div>
  );
}

function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
