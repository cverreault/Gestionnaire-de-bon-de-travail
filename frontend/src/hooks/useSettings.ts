import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as settingsService from '../services/settings.service';
import type { TaskType, ClientTypeConfig, AddressTypeConfig, Tag } from '../types';

// ── TaskType ──────────────────────────────────────────────────────────────────

export const TASK_TYPES_KEY = 'task-types';

export function useTaskTypes(isActive?: boolean) {
  return useQuery({
    queryKey: [TASK_TYPES_KEY, isActive],
    queryFn: () =>
      settingsService
        .getTaskTypes(isActive)
        .then((r) => (r.data?.data ?? r.data) as TaskType[]),
  });
}

export function useCreateTaskType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      prefix: string;
      name: string;
      nameFr?: string;
      nameEn?: string;
      description?: string;
      descriptionFr?: string;
      descriptionEn?: string;
      color?: string;
      icon?: string;
      templateId?: string | null;
      processDefinitionId?: string | null;
    }) =>
      settingsService
        .createTaskType(data)
        .then((r) => (r.data?.data ?? r.data) as TaskType),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TASK_TYPES_KEY] }),
  });
}

export function useUpdateTaskType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        prefix: string;
        name: string;
        nameFr: string;
        nameEn: string;
        description: string;
        descriptionFr: string;
        descriptionEn: string;
        color: string;
        icon: string;
        isActive: boolean;
        templateId: string | null;
        processDefinitionId: string | null;
      }>;
    }) =>
      settingsService
        .updateTaskType(id, data)
        .then((r) => (r.data?.data ?? r.data) as TaskType),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TASK_TYPES_KEY] }),
  });
}

export function useDeleteTaskType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsService.deleteTaskType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TASK_TYPES_KEY] }),
  });
}

// ── Company settings (B48) ────────────────────────────────────────────────────

export const TENANT_SETTINGS_KEY = 'tenant-settings';

export function useTenantSettings() {
  return useQuery({
    queryKey: [TENANT_SETTINGS_KEY],
    queryFn: () => settingsService.getTenantSettings().then((r) => (r.data?.data ?? r.data) as settingsService.TenantSettings),
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof settingsService.updateTenantSettings>[0]) => settingsService.updateTenantSettings(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TENANT_SETTINGS_KEY] }),
  });
}

// ── Tags (B44) ────────────────────────────────────────────────────────────────

export const TAGS_KEY = 'tags';

export function useTags(isActive?: boolean) {
  return useQuery({
    queryKey: [TAGS_KEY, isActive],
    queryFn: () => settingsService.getTags(isActive).then((r) => (r.data?.data ?? r.data) as Tag[]),
    staleTime: 60_000,
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string; isActive?: boolean }) => settingsService.createTag(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TAGS_KEY] }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ name: string; color: string; isActive: boolean }> }) =>
      settingsService.updateTag(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [TAGS_KEY] }),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsService.deleteTag(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TAGS_KEY] });
      // The tag disappears from every entity : refresh the lists that show chips.
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

// ── ClientTypeConfig ──────────────────────────────────────────────────────────

export const CLIENT_TYPES_KEY = 'client-types';

export function useClientTypes(isActive?: boolean) {
  return useQuery({
    queryKey: [CLIENT_TYPES_KEY, isActive],
    queryFn: () =>
      settingsService
        .getClientTypes(isActive)
        .then((r) => (r.data?.data ?? r.data) as ClientTypeConfig[]),
  });
}

export function useCreateClientType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      nameFr?: string;
      nameEn?: string;
      code: string;
      description?: string;
      descriptionFr?: string;
      descriptionEn?: string;
      color?: string;
      icon?: string;
      sortOrder?: number;
    }) =>
      settingsService
        .createClientType(data)
        .then((r) => (r.data?.data ?? r.data) as ClientTypeConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLIENT_TYPES_KEY] }),
  });
}

export function useUpdateClientType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        name: string;
        nameFr: string;
        nameEn: string;
        code: string;
        description: string;
        descriptionFr: string;
        descriptionEn: string;
        color: string;
        icon: string;
        isActive: boolean;
        sortOrder: number;
      }>;
    }) =>
      settingsService
        .updateClientType(id, data)
        .then((r) => (r.data?.data ?? r.data) as ClientTypeConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLIENT_TYPES_KEY] }),
  });
}

export function useDeleteClientType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsService.deleteClientType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [CLIENT_TYPES_KEY] }),
  });
}

// ── AddressTypeConfig ─────────────────────────────────────────────────────────

export const ADDRESS_TYPES_KEY = 'address-types';

export function useAddressTypes(isActive?: boolean) {
  return useQuery({
    queryKey: [ADDRESS_TYPES_KEY, isActive],
    queryFn: () =>
      settingsService
        .getAddressTypes(isActive)
        .then((r) => (r.data?.data ?? r.data) as AddressTypeConfig[]),
  });
}

export function useCreateAddressType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      nameFr?: string;
      nameEn?: string;
      code: string;
      description?: string;
      descriptionFr?: string;
      descriptionEn?: string;
      color?: string;
      icon?: string;
      sortOrder?: number;
    }) =>
      settingsService
        .createAddressType(data)
        .then((r) => (r.data?.data ?? r.data) as AddressTypeConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADDRESS_TYPES_KEY] }),
  });
}

export function useUpdateAddressType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        name: string;
        nameFr: string;
        nameEn: string;
        code: string;
        description: string;
        descriptionFr: string;
        descriptionEn: string;
        color: string;
        icon: string;
        isActive: boolean;
        sortOrder: number;
        predominantFieldId: string | null;
      }>;
    }) =>
      settingsService
        .updateAddressType(id, data)
        .then((r) => (r.data?.data ?? r.data) as AddressTypeConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADDRESS_TYPES_KEY] }),
  });
}

export function useDeleteAddressType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsService.deleteAddressType(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADDRESS_TYPES_KEY] }),
  });
}

// ── AddressType custom fields ────────────────────────────────────────────────

export function useAddAddressTypeField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ typeId, data }: { typeId: string; data: settingsService.AddressTypeFieldPayload }) =>
      settingsService.addAddressTypeField(typeId, data).then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADDRESS_TYPES_KEY] }),
  });
}

export function useUpdateAddressTypeField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      typeId,
      fieldId,
      data,
    }: {
      typeId: string;
      fieldId: string;
      data: Partial<settingsService.AddressTypeFieldPayload>;
    }) =>
      settingsService
        .updateAddressTypeField(typeId, fieldId, data)
        .then((r) => r.data?.data ?? r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADDRESS_TYPES_KEY] }),
  });
}

export function useDeleteAddressTypeField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ typeId, fieldId }: { typeId: string; fieldId: string }) =>
      settingsService.deleteAddressTypeField(typeId, fieldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADDRESS_TYPES_KEY] }),
  });
}
