import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';

/**
 * Redirects unauthenticated users to /login.
 */
export default function ProtectedRoute() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
