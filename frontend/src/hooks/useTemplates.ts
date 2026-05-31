import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as svc from '../services/templates.service';
import type { WorkOrderTemplate } from '../types';

export const TEMPLATES_KEY = 'templates';

export function useTemplates(includeInactive = false) {
  return useQuery({
    queryKey: [TEMPLATES_KEY, 'list', includeInactive],
    queryFn: async () => {
      const res = await svc.listTemplates(includeInactive);
      return (res.data?.data ?? res.data) as WorkOrderTemplate[];
    },
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: [TEMPLATES_KEY, 'detail', id],
    queryFn: async () => {
      const res = await svc.getTemplate(id);
      return (res.data?.data ?? res.data) as WorkOrderTemplate;
    },
    enabled: !!id,
  });
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: svc.CreateTemplatePayload) =>
      svc.createTemplate(data).then((r) => r.data?.data ?? r.data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<svc.CreateTemplatePayload> }) =>
      svc.updateTemplate(id, data).then((r) => r.data?.data ?? r.data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.deleteTemplate(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAddSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: svc.CreateSectionPayload }) =>
      svc.addSection(templateId, data).then((r) => r.data?.data ?? r.data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      sectionId,
      data,
    }: {
      templateId: string;
      sectionId: string;
      data: Partial<svc.CreateSectionPayload>;
    }) => svc.updateSection(templateId, sectionId, data).then((r) => r.data?.data ?? r.data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, sectionId }: { templateId: string; sectionId: string }) =>
      svc.deleteSection(templateId, sectionId),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAddField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      sectionId,
      data,
    }: {
      templateId: string;
      sectionId: string;
      data: svc.CreateFieldPayload;
    }) => svc.addField(templateId, sectionId, data).then((r) => r.data?.data ?? r.data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      sectionId,
      fieldId,
      data,
    }: {
      templateId: string;
      sectionId: string;
      fieldId: string;
      data: Partial<svc.CreateFieldPayload>;
    }) =>
      svc
        .updateField(templateId, sectionId, fieldId, data)
        .then((r) => r.data?.data ?? r.data),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      templateId,
      sectionId,
      fieldId,
    }: {
      templateId: string;
      sectionId: string;
      fieldId: string;
    }) => svc.deleteField(templateId, sectionId, fieldId),
    onSuccess: () => invalidateAll(qc),
  });
}
