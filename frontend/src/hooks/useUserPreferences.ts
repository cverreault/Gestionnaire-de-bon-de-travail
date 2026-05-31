import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useAuthStore } from '../context/auth.store';

export const PREFERENCES_KEY = 'user-preferences';

export interface UserPreferences {
  /** Ordered list of column ids visible in the work-orders list. */
  workOrderColumns?: string[];
  /** UI theme preference (light / dark / OS-follow). */
  theme?: 'light' | 'dark' | 'system';
  /** Preferred UI language. */
  locale?: 'fr' | 'en';
  [k: string]: unknown;
}

export function useUserPreferences() {
  // Skip the request entirely on the login page — there's no token yet and
  // it would 401 needlessly.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: [PREFERENCES_KEY],
    queryFn: async () => {
      const res = await api.get('/users/me/preferences');
      return (res.data?.data ?? res.data) as UserPreferences;
    },
    enabled: isAuthenticated,
    // Treat as fairly fresh — column layout doesn't change behind our back.
    staleTime: 60_000,
  });
}

export function useUpdateUserPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<UserPreferences>) => {
      const res = await api.patch('/users/me/preferences', patch);
      return (res.data?.data ?? res.data) as UserPreferences;
    },
    onSuccess: (next) => {
      qc.setQueryData([PREFERENCES_KEY], next);
    },
  });
}
