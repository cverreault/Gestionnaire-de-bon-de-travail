import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';

/**
 * Restricts access to ADMIN role only.
 *
 * SUPER_ADMIN is excluded by design — the platform admin has no business
 * touching a tenant's settings, backup, or audit pages directly. To act on
 * a tenant the SA must impersonate its ADMIN.
 */
export default function AdminOnlyRoute() {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === Role.SUPER_ADMIN) {
    return <Navigate to="/super-admin/stats" replace />;
  }
  if (user.role !== Role.ADMIN) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
