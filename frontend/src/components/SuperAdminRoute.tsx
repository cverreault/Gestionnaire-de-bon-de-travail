import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';

/**
 * Restricts access to SUPER_ADMIN role only. The /super-admin section
 * isn't reachable to regular ADMINs even though SA inherits ADMIN
 * elsewhere — the inheritance is one-way.
 */
export default function SuperAdminRoute() {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== Role.SUPER_ADMIN) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
