import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';

/**
 * Allows access to ADMIN and DISPATCHER roles.
 * Redirects technicians (and unauthenticated users) to their work orders list.
 */
export default function AdminRoute() {
  const { user } = useAuthStore();

  if (!user || (user.role !== Role.ADMIN && user.role !== Role.DISPATCHER)) {
    return <Navigate to="/mes-bons" replace />;
  }

  return <Outlet />;
}
