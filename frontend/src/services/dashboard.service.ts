import api from './api';
import type { ApiResponse, WorkOrder } from '../types';

export interface TechnicianStat {
  id: string;
  name: string;
  activeWorkOrders: number;
  completedToday: number;
}

export interface AdminStats {
  workOrdersByStatus: { status: string; count: number }[];
  workOrdersToday: number;
  /** B21 — client-portal requests awaiting approval. */
  pendingRequests?: number;
  workOrdersThisWeek: number;
  overdueWorkOrders: number;
  technicianStats: TechnicianStat[];
  recentWorkOrders: WorkOrder[];
}

export interface TechnicianStats {
  myActiveWorkOrders: number;
  myCompletedToday: number;
  myCompletedThisWeek: number;
  myUpcoming: WorkOrder[];
  myOverdue: number;
}

const dashboardService = {
  // FIX 6 — backend exposes /dashboard/stats (not /dashboard/admin)
  async getAdminStats(): Promise<AdminStats> {
    const { data } = await api.get<ApiResponse<AdminStats>>('/dashboard/stats');
    return data.data;
  },

  // FIX 6 — backend exposes /dashboard/technician-stats (not /dashboard/technician)
  async getTechnicianStats(): Promise<TechnicianStats> {
    const { data } = await api.get<ApiResponse<TechnicianStats>>('/dashboard/technician-stats');
    return data.data;
  },
};

export default dashboardService;
