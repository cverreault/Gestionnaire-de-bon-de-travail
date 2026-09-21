import api from './api';
import type { User, ApiResponse } from '../types';

export interface CreateUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  phone?: string;
}

export interface UpdateUserDto {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive?: boolean;
  password?: string;
}

const usersService = {
  async findAll(): Promise<User[]> {
    const { data } = await api.get<ApiResponse<User[]>>('/users');
    return data.data;
  },

  async findTechnicians(): Promise<User[]> {
    const { data } = await api.get<ApiResponse<User[]>>('/users/technicians');
    return data.data;
  },

  async findOne(id: string): Promise<User> {
    const { data } = await api.get<ApiResponse<User>>(`/users/${id}`);
    return data.data;
  },

  async create(dto: CreateUserDto): Promise<User> {
    const { data } = await api.post<ApiResponse<User>>('/users', dto);
    return data.data;
  },

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const { data } = await api.patch<ApiResponse<User>>(`/users/${id}`, dto);
    return data.data;
  },

  async deactivate(id: string): Promise<User> {
    const { data } = await api.delete<ApiResponse<User>>(`/users/${id}`);
    return data.data;
  },
};

// ─── Standalone functions (used by profile hooks) ─────────────────────────────

/** PATCH /users/me — update the authenticated user's own profile fields. */
export const updateMyProfile = (dto: {
  firstName?: string;
  lastName?: string;
  phone?: string;
}): Promise<import('axios').AxiosResponse<ApiResponse<User>>> =>
  api.patch<ApiResponse<User>>('/users/me', dto);

/** PATCH /users/me/password — change the authenticated user's own password. */
export const changeMyPassword = (dto: {
  currentPassword: string;
  newPassword: string;
}): Promise<import('axios').AxiosResponse<ApiResponse<void>>> =>
  api.patch<ApiResponse<void>>('/users/me/password', dto);

/** PATCH /users/:id/reset-password — admin-only password reset without current-password check. */
export const adminResetPassword = (
  userId: string,
  newPassword: string,
): Promise<import('axios').AxiosResponse<ApiResponse<void>>> =>
  api.patch<ApiResponse<void>>(`/users/${userId}/reset-password`, { newPassword });

/** POST /users/:id/revoke-sessions — admin: cut every refresh token and mobile device of a user. */
export const revokeUserSessions = (
  userId: string,
): Promise<import('axios').AxiosResponse<ApiResponse<{ refreshTokens: number; devices: number }>>> =>
  api.post<ApiResponse<{ refreshTokens: number; devices: number }>>(`/users/${userId}/revoke-sessions`);

/** GET /mobile/users/:id/devices — admin: live mobile devices of a user. */
export const getUserDevices = (
  userId: string,
): Promise<import('axios').AxiosResponse<ApiResponse<import('../types').MobileDevice[]>>> =>
  api.get<ApiResponse<import('../types').MobileDevice[]>>(`/mobile/users/${userId}/devices`);

/** DELETE /mobile/users/:id/devices/:installationId — admin: revoke one device. */
export const revokeUserDevice = (userId: string, installationId: string): Promise<import('axios').AxiosResponse<void>> =>
  api.delete<void>(`/mobile/users/${userId}/devices/${installationId}`);

// ── B51 — presence, sessions, login history ─────────────────────────────────

export interface UserPresence {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
  lastSeenIp: string | null;
  sessionSince: string | null;
  activeSessions: number;
  mobileSessions: number;
}

export interface ActiveSession {
  family: string;
  startedAt: string;
  lastRefreshAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
}

export interface LoginEvent {
  id: string;
  userId: string | null;
  email: string;
  kind: 'LOGIN' | 'LOGIN_2FA' | 'FAILED' | 'LOGOUT';
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; role: string } | null;
}

export const getPresence = () => api.get<ApiResponse<UserPresence[]>>('/auth/sessions/presence');
export const getUserSessions = (userId: string) => api.get<ApiResponse<ActiveSession[]>>(`/auth/sessions/users/${userId}`);
export const getLoginHistory = (params: { userId?: string; kind?: string; from?: string; to?: string; page?: number; limit?: number }) =>
  api.get<ApiResponse<{ data: LoginEvent[]; meta: { page: number; limit: number; total: number; totalPages: number } }>>('/auth/sessions/history', { params });

export default usersService;
