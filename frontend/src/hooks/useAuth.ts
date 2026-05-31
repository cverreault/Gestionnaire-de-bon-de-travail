import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';
import authService from '../services/auth.service';
import type { LoginCredentials } from '../types';

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      if (data.user.role === 'ADMIN' || data.user.role === 'DISPATCHER') {
        navigate('/dashboard');
      } else {
        navigate('/mes-bons');
      }
    },
  });
}

export function useLogout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  return () => {
    authService.logout().finally(() => {
      logout();
      navigate('/login');
    });
  };
}
