import api from './api';
import type { ApiResponse, WorkOrderStatus } from '../types';

/**
 * B21 — client-portal API surface (all under /portal, role CLIENT).
 * The backend returns a sanitized work-order shape — this is the full
 * contract of what a portal user sees.
 */

export interface PortalStep {
  code: number;
  name: string;
  nameFr: string;
  nameEn: string;
  color: string;
  isTerminalPositive: boolean;
  isTerminalNegative: boolean;
  isRequested: boolean;
}

export interface PortalWorkOrder {
  id: string;
  referenceNumber: string;
  title: string;
  description: string | null;
  status: WorkOrderStatus;
  priority: number;
  scheduledDate: string | null;
  completionNotes: string | null;
  negativeReason: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentStep: PortalStep | null;
  taskType: { id: string; name: string; nameFr: string; nameEn: string } | null;
  clientAddress_rel: {
    street: string;
    city: string;
    postalCode: string | null;
    province: string | null;
  } | null;
  assignedTo: { firstName: string } | null;
}

export interface PortalAddress {
  id: string;
  street: string;
  city: string;
  postalCode: string | null;
  province: string | null;
  addressType: string;
  isDefault: boolean;
}

export interface PortalTaskType {
  id: string;
  name: string;
  nameFr: string;
  nameEn: string;
}

export interface CreateWorkRequestDto {
  taskTypeId: string;
  clientAddressId: string;
  description: string;
  title?: string;
}

export const getPortalWorkOrders = async (): Promise<PortalWorkOrder[]> => {
  const res = await api.get<ApiResponse<PortalWorkOrder[]>>('/portal/work-orders');
  return res.data.data;
};

export const getPortalWorkOrder = async (id: string): Promise<PortalWorkOrder> => {
  const res = await api.get<ApiResponse<PortalWorkOrder>>(`/portal/work-orders/${id}`);
  return res.data.data;
};

export const getPortalAddresses = async (): Promise<PortalAddress[]> => {
  const res = await api.get<ApiResponse<PortalAddress[]>>('/portal/addresses');
  return res.data.data;
};

export const getPortalTaskTypes = async (): Promise<PortalTaskType[]> => {
  const res = await api.get<ApiResponse<PortalTaskType[]>>('/portal/task-types');
  return res.data.data;
};

export const createWorkRequest = async (
  dto: CreateWorkRequestDto,
): Promise<PortalWorkOrder> => {
  const res = await api.post<ApiResponse<PortalWorkOrder>>('/portal/work-requests', dto);
  return res.data.data;
};

/** Public — no auth header needed (the interceptor just no-ops without a token). */
export const activatePortalAccount = async (token: string, password: string) => {
  const res = await api.post<ApiResponse<{ activated: boolean }>>('/portal/activate', {
    token,
    password,
  });
  return res.data.data;
};

/** Staff side — invite (or re-invite) a client to the portal. */
export const invitePortalClient = async (clientId: string, email?: string) => {
  const res = await api.post<ApiResponse<{ invitationId: string; email: string; expiresAt: string }>>(
    '/portal/invitations',
    { clientId, ...(email ? { email } : {}) },
  );
  return res.data.data;
};
