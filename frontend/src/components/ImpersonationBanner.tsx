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
 * The banner is mounted unconditionally in AppLayout — it renders
 * nothing when impersonation.active is false.
 */
export default function ImpersonationBanner() {
  const impersonation = useAuthStore((s) => s.impersonation);
  const stopImpersonation = useAuthStore((s) => s.stopImpersonation);

  if (!impersonation.active) return null;

  const handleExit = () => {
    stopImpersonation();
    // After restoring the SA session, drop the user back at the
    // tenants list — they were probably about to enter another one.
    window.location.href = '/super-admin/tenants';
  };

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: '#F59E0B',
        color: '#1f2937',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      <span>
        🎭 Vous êtes connecté en tant que{' '}
        <strong>{impersonation.impersonatedUserEmail}</strong> dans{' '}
        <strong>{impersonation.impersonatedTenantName}</strong>{' '}
        <span style={{ opacity: 0.7, fontWeight: 400 }}>
          ({impersonation.impersonatedTenantSlug})
        </span>
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
