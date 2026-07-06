import api from './api';
import type { LoginCredentials, AuthTokens, User, ApiResponse } from '../types';

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/** Emitted when the account has 2FA enabled — client must call /auth/login/2fa. */
export interface Login2faChallenge {
  requires2fa: true;
  pendingToken: string;
  userId: string;
}

export type LoginResult = LoginResponse | Login2faChallenge;

export function is2faChallenge(x: LoginResult): x is Login2faChallenge {
  return (x as Login2faChallenge).requires2fa === true;
}

const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const { data } = await api.post<ApiResponse<LoginResult>>('/auth/login', credentials);
    return data.data;
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors on logout
    }
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { data } = await api.post<ApiResponse<AuthTokens>>('/auth/refresh', { refreshToken });
    return data.data;
  },

  async me(): Promise<User> {
    const { data } = await api.get<ApiResponse<User>>('/auth/me');
    return data.data;
  },
};

export default authService;
