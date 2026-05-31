import { useQuery } from '@tanstack/react-query';
import dashboardService from '../services/dashboard.service';

export const DASHBOARD_KEY = 'dashboard';

export function useAdminStats() {
  return useQuery({
    queryKey: [DASHBOARD_KEY, 'admin'],
    queryFn: () => dashboardService.getAdminStats(),
    staleTime: 30_000, // 30s — stats refresh every 30s
  });
}

export function useTechnicianStats() {
  return useQuery({
    queryKey: [DASHBOARD_KEY, 'technician'],
    queryFn: () => dashboardService.getTechnicianStats(),
    staleTime: 30_000,
  });
}
