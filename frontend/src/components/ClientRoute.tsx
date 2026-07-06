import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';
import { Role } from '../types';

/**
 * B21 — allows access to CLIENT portal accounts only. Staff members who
 * wander into /portail/* are bounced to their own home.
 */
export default function ClientRoute() {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== Role.CLIENT) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
