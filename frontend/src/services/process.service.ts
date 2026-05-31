import api from './api';
import type {
  ApiResponse,
  PaginatedResponse,
  ProcessDefinition,
  ProcessStatus,
  ProcessTransitionDef,
} from '../types';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateProcessDefinitionPayload {
  name: string;
  description?: string;
  isDefault?: boolean;
}

export interface UpdateProcessDefinitionPayload {
  name?: string;
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface CreateProcessStatusPayload {
  code: number;
  name: string;
  color: string;
  position: number;
  isInitial?: boolean;
  isDispatch?: boolean;
  isStart?: boolean;
  isTerminalPositive?: boolean;
  isTerminalNegative?: boolean;
}

export type UpdateProcessStatusPayload = Partial<Omit<CreateProcessStatusPayload, 'code'>>;

export interface CreateProcessTransitionPayload {
  fromStatusId: string;
  toStatusId: string;
  label: string;
  allowedRoles?: string[];
  requiredFields?: string[];
  sortOrder?: number;
}

export type UpdateProcessTransitionPayload = Partial<CreateProcessTransitionPayload>;

export interface ProcessListParams {
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const processService = {
  // ── Process Definitions ────────────────────────────────────────────────────

  async findAll(params?: ProcessListParams): Promise<PaginatedResponse<ProcessDefinition>> {
    const { data } = await api.get<ApiResponse<PaginatedResponse<ProcessDefinition>>>(
      '/processes',
      { params },
    );
    return data.data;
  },

  async findOne(id: string): Promise<ProcessDefinition> {
    const { data } = await api.get<ApiResponse<ProcessDefinition>>(`/processes/${id}`);
    return data.data;
  },

  async create(dto: CreateProcessDefinitionPayload): Promise<ProcessDefinition> {
    const { data } = await api.post<ApiResponse<ProcessDefinition>>('/processes', dto);
    return data.data;
  },

  async update(id: string, dto: UpdateProcessDefinitionPayload): Promise<ProcessDefinition> {
    const { data } = await api.patch<ApiResponse<ProcessDefinition>>(`/processes/${id}`, dto);
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/processes/${id}`);
  },

  // ── Statuses ───────────────────────────────────────────────────────────────

  async addStatus(processId: string, dto: CreateProcessStatusPayload): Promise<ProcessStatus> {
    const { data } = await api.post<ApiResponse<ProcessStatus>>(
      `/processes/${processId}/statuses`,
      dto,
    );
    return data.data;
  },

  async updateStatus(
    processId: string,
    statusId: string,
    dto: UpdateProcessStatusPayload,
  ): Promise<ProcessStatus> {
    const { data } = await api.patch<ApiResponse<ProcessStatus>>(
      `/processes/${processId}/statuses/${statusId}`,
      dto,
    );
    return data.data;
  },

  async removeStatus(processId: string, statusId: string): Promise<void> {
    await api.delete(`/processes/${processId}/statuses/${statusId}`);
  },

  // ── Transitions ────────────────────────────────────────────────────────────

  async addTransition(
    processId: string,
    dto: CreateProcessTransitionPayload,
  ): Promise<ProcessTransitionDef> {
    const { data } = await api.post<ApiResponse<ProcessTransitionDef>>(
      `/processes/${processId}/transitions`,
      dto,
    );
    return data.data;
  },

  async updateTransition(
    processId: string,
    transitionId: string,
    dto: UpdateProcessTransitionPayload,
  ): Promise<ProcessTransitionDef> {
    const { data } = await api.patch<ApiResponse<ProcessTransitionDef>>(
      `/processes/${processId}/transitions/${transitionId}`,
      dto,
    );
    return data.data;
  },

  async removeTransition(processId: string, transitionId: string): Promise<void> {
    await api.delete(`/processes/${processId}/transitions/${transitionId}`);
  },

  // ── Snapshot ───────────────────────────────────────────────────────────────

  async getSnapshot(processId: string): Promise<ProcessDefinition> {
    const { data } = await api.get<ApiResponse<ProcessDefinition>>(
      `/processes/${processId}/snapshot`,
    );
    return data.data;
  },
};

export default processService;
