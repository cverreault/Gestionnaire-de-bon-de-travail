import api from './api';

// ── TaskType ──────────────────────────────────────────────────────────────────

export const getTaskTypes = (isActive?: boolean) =>
  api.get('/settings/task-types', { params: isActive !== undefined ? { isActive } : undefined });

export const createTaskType = (data: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}) => api.post('/settings/task-types', data);

export const updateTaskType = (id: string, data: Partial<{
  name: string;
  description: string;
  color: string;
  icon: string;
  isActive: boolean;
}>) => api.patch(`/settings/task-types/${id}`, data);

export const deleteTaskType = (id: string) =>
  api.delete(`/settings/task-types/${id}`);

// ── Company settings (B48) ────────────────────────────────────────────────────

export interface DeparturePoint {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  sortOrder: number;
}

export interface TenantSettings {
  completedJobsEmail: string | null;
  /** B59 — IANA time zone of the company. */
  timezone: string;
  departurePoints: DeparturePoint[];
  emailConfigured: boolean;
}

export const getTenantSettings = () => api.get('/tenants/settings');
export const updateTenantSettings = (data: Partial<Pick<TenantSettings, 'completedJobsEmail' | 'timezone'>>) => api.patch('/tenants/settings', data);
export const getDeparturePoints = () => api.get('/tenants/settings/departure-points');
export const addDeparturePoint = (data: { label: string; address: string; lat: number; lng: number }) => api.post('/tenants/settings/departure-points', data);
export const removeDeparturePoint = (id: string) => api.delete(`/tenants/settings/departure-points/${id}`);

// ── Tags (B44) ────────────────────────────────────────────────────────────────

export const getTags = (isActive?: boolean) =>
  api.get('/settings/tags', { params: isActive !== undefined ? { isActive } : undefined });

export const createTag = (data: { name: string; color?: string; isActive?: boolean }) =>
  api.post('/settings/tags', data);

export const updateTag = (id: string, data: Partial<{ name: string; color: string; isActive: boolean }>) =>
  api.patch(`/settings/tags/${id}`, data);

export const deleteTag = (id: string) => api.delete(`/settings/tags/${id}`);

// ── ClientTypeConfig ──────────────────────────────────────────────────────────

export const getClientTypes = (isActive?: boolean) =>
  api.get('/settings/client-types', { params: isActive !== undefined ? { isActive } : undefined });

export const createClientType = (data: {
  name: string;
  code: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
}) => api.post('/settings/client-types', data);

export const updateClientType = (id: string, data: Partial<{
  name: string;
  code: string;
  description: string;
  color: string;
  icon: string;
  isActive: boolean;
  sortOrder: number;
}>) => api.patch(`/settings/client-types/${id}`, data);

export const deleteClientType = (id: string) =>
  api.delete(`/settings/client-types/${id}`);

// ── AddressTypeConfig ─────────────────────────────────────────────────────────

export const getAddressTypes = (isActive?: boolean) =>
  api.get('/settings/address-types', { params: isActive !== undefined ? { isActive } : undefined });

export const createAddressType = (data: {
  name: string;
  code: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
}) => api.post('/settings/address-types', data);

export const updateAddressType = (id: string, data: Partial<{
  name: string;
  code: string;
  description: string;
  color: string;
  icon: string;
  isActive: boolean;
  sortOrder: number;
  predominantFieldId: string | null;
}>) => api.patch(`/settings/address-types/${id}`, data);

export const deleteAddressType = (id: string) =>
  api.delete(`/settings/address-types/${id}`);

// ── AddressTypeConfig — custom fields ───────────────────────────────────────

export interface AddressTypeFieldPayload {
  label: string;
  /// B10.2 — bilingual pair (legacy `label` still accepted and synced by the
  /// backend's Prisma middleware).
  labelFr?: string;
  labelEn?: string;
  fieldType: import('../types').TemplateFieldType;
  required?: boolean;
  options?: string[];
  sortOrder?: number;
}

export const addAddressTypeField = (typeId: string, data: AddressTypeFieldPayload) =>
  api.post(`/settings/address-types/${typeId}/fields`, data);

export const updateAddressTypeField = (
  typeId: string,
  fieldId: string,
  data: Partial<AddressTypeFieldPayload>,
) => api.patch(`/settings/address-types/${typeId}/fields/${fieldId}`, data);

export const deleteAddressTypeField = (typeId: string, fieldId: string) =>
  api.delete(`/settings/address-types/${typeId}/fields/${fieldId}`);
