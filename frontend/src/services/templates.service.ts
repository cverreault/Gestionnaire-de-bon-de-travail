import api from './api';
import type { TemplateFieldType, Role } from '../types';

export interface CreateTemplatePayload {
  name: string;
  /// B10.2 — bilingual pair (backend Prisma middleware keeps legacy in sync).
  nameFr?: string;
  nameEn?: string;
  description?: string;
  descriptionFr?: string;
  descriptionEn?: string;
  isActive?: boolean;
}

export interface CreateSectionPayload {
  name: string;
  nameFr?: string;
  nameEn?: string;
  sortOrder?: number;
  viewRoles?: Role[];
  editRoles?: Role[];
}

export interface CreateFieldPayload {
  label: string;
  labelFr?: string;
  labelEn?: string;
  fieldType: TemplateFieldType;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  sortOrder?: number;
  viewRoles?: Role[];
  editRoles?: Role[];
  requiredRoles?: Role[];
}

export const listTemplates = (includeInactive = false) =>
  api.get('/templates', { params: { includeInactive } });

export const getTemplate = (id: string) => api.get(`/templates/${id}`);

export const createTemplate = (data: CreateTemplatePayload) =>
  api.post('/templates', data);

export const updateTemplate = (id: string, data: Partial<CreateTemplatePayload>) =>
  api.patch(`/templates/${id}`, data);

export const deleteTemplate = (id: string) => api.delete(`/templates/${id}`);

export const addSection = (templateId: string, data: CreateSectionPayload) =>
  api.post(`/templates/${templateId}/sections`, data);

export const updateSection = (
  templateId: string,
  sectionId: string,
  data: Partial<CreateSectionPayload>,
) => api.patch(`/templates/${templateId}/sections/${sectionId}`, data);

export const deleteSection = (templateId: string, sectionId: string) =>
  api.delete(`/templates/${templateId}/sections/${sectionId}`);

export const addField = (
  templateId: string,
  sectionId: string,
  data: CreateFieldPayload,
) => api.post(`/templates/${templateId}/sections/${sectionId}/fields`, data);

export const updateField = (
  templateId: string,
  sectionId: string,
  fieldId: string,
  data: Partial<CreateFieldPayload>,
) => api.patch(`/templates/${templateId}/sections/${sectionId}/fields/${fieldId}`, data);

export const deleteField = (templateId: string, sectionId: string, fieldId: string) =>
  api.delete(`/templates/${templateId}/sections/${sectionId}/fields/${fieldId}`);
