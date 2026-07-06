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
