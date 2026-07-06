import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';
import authService, { is2faChallenge } from '../services/auth.service';
import { login2fa } from '../services/totp.service';
import type { LoginCredentials, User } from '../types';

/**
 * Handle the SUCCESS payload of either step of the login (single-step or
 * post-2FA). Sets auth state and redirects based on role.
 */
function handleAuthSuccess(
  data: { user: User; accessToken: string; refreshToken: string },
  setAuth: (u: User, a: string, r: string) => void,
  navigate: (path: string) => void,
): void {
  setAuth(data.user, data.accessToken, data.refreshToken);
  if (data.user.role === 'ADMIN' || data.user.role === 'DISPATCHER') {
    navigate('/dashboard');
  } else {
    navigate('/mes-bons');
  }
}

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: (data) => {
      if (is2faChallenge(data)) {
        // Caller sees `data.requires2fa === true` and prompts for TOTP code.
        return;
      }
      handleAuthSuccess(data, setAuth, navigate);
    },
  });
}

/**
 * Step 2 of a 2FA-gated login. Given the pending token from step 1 and
 * the user's TOTP (or backup) code, completes the login.
 */
export function useLogin2fa() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: ({ pendingToken, code }: { pendingToken: string; code: string }) =>
      login2fa(pendingToken, code),
    onSuccess: (data) => {
      handleAuthSuccess(
        data as { user: User; accessToken: string; refreshToken: string },
        setAuth,
        navigate,
      );
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
