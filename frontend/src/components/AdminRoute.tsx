import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';

/**
 * Allows access to ADMIN and DISPATCHER only.
 *
 * SUPER_ADMIN is intentionally excluded — the platform admin has its own
 * dedicated portal under /super-admin and must never see tenant-scoped
 * pages (BTs, clients, calendar, …). The SA acts on tenants through
 * impersonation, not through direct tenant data access.
 *
 * Technicians (and unauthenticated users) are bounced to their work-order
 * list. SA hitting one of these routes goes to their own dashboard.
 */
export default function AdminRoute() {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === Role.SUPER_ADMIN) {
    return <Navigate to="/super-admin/stats" replace />;
  }
  if (user.role === Role.CLIENT) {
    return <Navigate to="/portail" replace />;
  }
  if (user.role !== Role.ADMIN && user.role !== Role.DISPATCHER) {
    return <Navigate to="/mes-bons" replace />;
  }

  return <Outlet />;
}
