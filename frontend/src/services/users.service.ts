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

export default usersService;
