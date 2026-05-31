import api from './api';
import type { LoginCredentials, AuthTokens, User, ApiResponse } from '../types';

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

const authService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const { data } = await api.post<ApiResponse<LoginResponse>>('/auth/login', credentials);
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
