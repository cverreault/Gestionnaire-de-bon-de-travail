import api from './api';
import type {
  WorkOrder,
  WorkOrderFilters,
  ApiResponse,
  PaginatedResponse,
  Note,
  Attachment,
  WorkOrderStatus,
  AvailableTransitionsResponse,
} from '../types';

export interface CreateWorkOrderDto {
  title: string;
  description?: string;
  type: string;
  priority?: number;
  temporaryClientId?: string;
  externalClientId?: string;
  externalClientName?: string;
  clientAddress?: string;
  assignedToId?: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  // V3
  clientId?: string;
  clientAddressId?: string;
  taskTypeId?: string;
}

export interface UpdateWorkOrderDto extends Partial<CreateWorkOrderDto> {
  status?: WorkOrderStatus;
  completionNotes?: string;
  negativeReason?: string;
  actualStartTime?: string;
  actualEndTime?: string;
}

// DTO for the dynamic process-engine transition endpoint
export interface TransitionDynamicDto {
  targetStepId: string;
  assignedToId?: string;
  negativeReason?: string;
  completionNotes?: string;
  reopenReason?: string;
  expectedUpdatedAt?: string;
}

const workOrdersService = {
  async findAll(filters?: WorkOrderFilters): Promise<PaginatedResponse<WorkOrder>> {
    const { data } = await api.get<ApiResponse<PaginatedResponse<WorkOrder>>>('/work-orders', {
      params: filters,
    });
    return data.data;
  },

  async findOne(id: string): Promise<WorkOrder> {
    const { data } = await api.get<ApiResponse<WorkOrder>>(`/work-orders/${id}`);
    return data.data;
  },

  async create(dto: CreateWorkOrderDto): Promise<WorkOrder> {
    const { data } = await api.post<ApiResponse<WorkOrder>>('/work-orders', dto);
    return data.data;
  },

  async update(id: string, dto: UpdateWorkOrderDto): Promise<WorkOrder> {
    const { data } = await api.patch<ApiResponse<WorkOrder>>(`/work-orders/${id}`, dto);
    return data.data;
  },

  /** POST /work-orders/:id/duplicate — clone an existing work order (ADMIN + DISPATCHER) */
  async duplicate(id: string): Promise<WorkOrder> {
    const { data } = await api.post<ApiResponse<WorkOrder>>(`/work-orders/${id}/duplicate`);
    return data.data;
  },

  async addNote(workOrderId: string, content: string): Promise<Note> {
    const { data } = await api.post<ApiResponse<Note>>(`/work-orders/${workOrderId}/notes`, {
      content,
    });
    return data.data;
  },

  async uploadAttachment(workOrderId: string, file: File): Promise<Attachment> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<ApiResponse<Attachment>>(
      `/work-orders/${workOrderId}/attachments`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data.data;
  },

  // FIX 3 — backend exposes DELETE /api/attachments/:id (not under /work-orders/)
  async deleteAttachment(attachmentId: string): Promise<void> {
    await api.delete(`/attachments/${attachmentId}`);
  },

  // FIX 2 — /work-orders/my does not exist; backend filters by role inside GET /work-orders
  async getMyWorkOrders(filters?: WorkOrderFilters): Promise<PaginatedResponse<WorkOrder>> {
    return this.findAll(filters);
  },

  // ── Process Engine ─────────────────────────────────────────────────────────

  /** POST /work-orders/:id/transition — execute a process engine transition */
  async transitionDynamic(id: string, dto: TransitionDynamicDto): Promise<WorkOrder> {
    const { data } = await api.post<ApiResponse<WorkOrder>>(
      `/work-orders/${id}/transition`,
      dto,
    );
    return data.data;
  },

  /** GET /work-orders/:id/available-transitions — list available process engine transitions */
  async getAvailableTransitions(id: string): Promise<AvailableTransitionsResponse> {
    const { data } = await api.get<ApiResponse<AvailableTransitionsResponse>>(
      `/work-orders/${id}/available-transitions`,
    );
    return data.data;
  },

  /**
   * Export the current filtered list as a CSV file (ADMIN + DISPATCHER only).
   * Streams the response as a blob and triggers a browser download.
   */
  async exportCsv(filters?: WorkOrderFilters): Promise<{ filename: string; size: number }> {
    const response = await api.get('/work-orders/export.csv', {
      params: filters,
      responseType: 'blob',
    });

    const cd = response.headers['content-disposition'] as string | undefined;
    const fallback = `work-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    const match = cd ? /filename="?([^"]+)"?/i.exec(cd) : null;
    const filename = match?.[1] ?? fallback;

    const blob = response.data as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    return { filename, size: blob.size };
  },
};

export default workOrdersService;
