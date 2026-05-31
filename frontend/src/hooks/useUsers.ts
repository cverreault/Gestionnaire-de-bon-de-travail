import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import usersService, {
  CreateUserDto,
  UpdateUserDto,
  updateMyProfile,
  changeMyPassword,
  adminResetPassword,
} from '../services/users.service';
import { useAuthStore } from '../context/auth.store';
import type { User } from '../types';

export const USERS_KEY = 'users';

export function useUsers() {
  return useQuery({
    queryKey: [USERS_KEY],
    queryFn: () => usersService.findAll(),
  });
}

export function useTechnicians() {
  return useQuery({
    queryKey: [USERS_KEY, 'technicians'],
    queryFn: () => usersService.findTechnicians(),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: [USERS_KEY, id],
    queryFn: () => usersService.findOne(id),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUserDto) => usersService.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
    },
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateUserDto) => usersService.update(id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY, id] });
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersService.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [USERS_KEY] });
    },
  });
}

// ─── Profile hooks (all roles) ────────────────────────────────────────────────

/** Update the authenticated user's own profile (firstName, lastName, phone). */
export function useUpdateMyProfile() {
  const qc = useQueryClient();
  const updateUser = useAuthStore((s) => s.updateUser);
  const currentUser = useAuthStore((s) => s.user);

  return useMutation({
    mutationFn: (dto: { firstName?: string; lastName?: string; phone?: string }) =>
      updateMyProfile(dto),
    onSuccess: (response) => {
      // Sync the Zustand auth store so the UI reflects the new name immediately.
      // Merge with the existing store user so that fields not returned by the API
      // (e.g. isActive, createdAt) are preserved in the store.
      const fresh = response.data?.data;
      if (fresh && currentUser) {
        updateUser({ ...currentUser, ...fresh } as User);
      } else if (fresh) {
        updateUser(fresh);
      }
      // Also invalidate any React Query cache that carries the user (future-proof)
      qc.invalidateQueries({ queryKey: ['auth-user'] });
    },
  });
}

/** Change the authenticated user's own password (requires current password). */
export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (dto: { currentPassword: string; newPassword: string }) =>
      changeMyPassword(dto),
  });
}

/** Admin-only: reset any user's password without knowing the current password. */
export function useAdminResetPassword() {
  return useMutation({
    mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      adminResetPassword(userId, newPassword),
  });
}
