import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';

/**
 * Allows access to ADMIN, DISPATCHER and SUPER_ADMIN roles.
 * SUPER_ADMIN inherits every ADMIN/DISPATCHER privilege (SA.1.a), so it must
 * pass this guard too — otherwise the root redirect sends SA to /dashboard
 * and this guard bounces it straight back to /mes-bons (no dashboard at all).
 * Redirects technicians (and unauthenticated users) to their work orders list.
 */
export default function AdminRoute() {
  const { user } = useAuthStore();

  if (
    !user ||
    (user.role !== Role.ADMIN &&
      user.role !== Role.DISPATCHER &&
      user.role !== Role.SUPER_ADMIN)
  ) {
    return <Navigate to="/mes-bons" replace />;
  }

  return <Outlet />;
}
