import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';

/**
 * Restricts access to ADMIN role only (SUPER_ADMIN also accepted —
 * inherits every ADMIN privilege per SA.1.a).
 * Used for sensitive sections such as Users and Settings.
 * Dispatchers and technicians are redirected to /dashboard.
 */
export default function AdminOnlyRoute() {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
