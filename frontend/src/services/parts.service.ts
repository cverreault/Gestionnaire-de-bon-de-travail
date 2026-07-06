import api from './api';
import type { ApiResponse } from '../types';

/** B24 — inventory/parts API surface. */

export interface Part {
  id: string;
  sku: string;
  name: string;
  nameFr?: string;
  nameEn?: string;
  description?: string | null;
  unit: string;
  costPrice: number;
  salePrice: number;
  quantityOnHand: number;
  minStock: number;
  isActive: boolean;
  truckQuantity: number;
  lowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogPart {
  id: string;
  sku: string;
  name: string;
  nameFr?: string;
  nameEn?: string;
  unit: string;
}

export interface CreatePartDto {
  sku: string;
  name: string;
  nameFr?: string;
  nameEn?: string;
  description?: string;
  unit?: string;
  costPrice?: number;
  salePrice?: number;
  minStock?: number;
}

export interface UpdatePartDto extends Partial<CreatePartDto> {
  isActive?: boolean;
}

export interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  note?: string | null;
  createdAt: string;
  technician?: { firstName: string; lastName: string } | null;
  createdBy: { firstName: string; lastName: string };
  workOrder?: { referenceNumber: string } | null;
}

export interface TechnicianStockRow {
  id: string;
  quantity: number;
  technician: { id: string; firstName: string; lastName: string };
  part: CatalogPart;
}

export interface MyStockRow {
  id: string;
  quantity: number;
  part: CatalogPart;
}

export interface WorkOrderPartRow {
  id: string;
  quantity: number;
  source: 'WAREHOUSE' | 'TECHNICIAN_STOCK';
  unitSalePrice: string | number;
  createdAt: string;
  part: CatalogPart;
  addedBy: { firstName: string; lastName: string };
}

const unwrap = <T>(r: { data: ApiResponse<T> }): T => r.data.data;

export const getParts = (search?: string, includeInactive = false) =>
  api
    .get<ApiResponse<Part[]>>('/parts', { params: { search: search || undefined, includeInactive } })
    .then(unwrap);

export const getPartsCatalog = () =>
  api.get<ApiResponse<CatalogPart[]>>('/parts/catalog').then(unwrap);

export const getStockByTechnician = () =>
  api.get<ApiResponse<TechnicianStockRow[]>>('/parts/stock-by-technician').then(unwrap);

export const createPart = (dto: CreatePartDto) =>
  api.post<ApiResponse<Part>>('/parts', dto).then(unwrap);

export const updatePart = (id: string, dto: UpdatePartDto) =>
  api.patch<ApiResponse<Part>>(`/parts/${id}`, dto).then(unwrap);

export const deletePart = (id: string) =>
  api.delete<ApiResponse<Part>>(`/parts/${id}`).then(unwrap);

export const getPartMovements = (id: string, page = 1) =>
  api
    .get<ApiResponse<{ items: StockMovement[]; total: number; page: number; limit: number }>>(
      `/parts/${id}/movements`,
      { params: { page } },
    )
    .then(unwrap);

export const receiveStock = (id: string, quantity: number, note?: string) =>
  api.post<ApiResponse<unknown>>(`/parts/${id}/receive`, { quantity, note }).then(unwrap);

export const adjustStock = (id: string, quantity: number, note: string, technicianId?: string) =>
  api
    .post<ApiResponse<unknown>>(`/parts/${id}/adjust`, { quantity, note, technicianId })
    .then(unwrap);

export const transferStock = (
  id: string,
  technicianId: string,
  quantity: number,
  direction: 'TO_TECH' | 'TO_WAREHOUSE',
) =>
  api
    .post<ApiResponse<unknown>>(`/parts/${id}/transfer`, { technicianId, quantity, direction })
    .then(unwrap);

export const getMyStock = () =>
  api.get<ApiResponse<MyStockRow[]>>('/me/parts-stock').then(unwrap);

export const getWorkOrderParts = (workOrderId: string) =>
  api.get<ApiResponse<WorkOrderPartRow[]>>(`/work-orders/${workOrderId}/parts`).then(unwrap);

export const addWorkOrderPart = (
  workOrderId: string,
  dto: { partId: string; quantity: number; source?: 'WAREHOUSE' | 'TECHNICIAN_STOCK' },
) => api.post<ApiResponse<WorkOrderPartRow>>(`/work-orders/${workOrderId}/parts`, dto).then(unwrap);

export const removeWorkOrderPart = (workOrderId: string, rowId: string) =>
  api
    .delete<ApiResponse<{ removed: boolean }>>(`/work-orders/${workOrderId}/parts/${rowId}`)
    .then(unwrap);

/** Locale-aware display name. */
export function partName(part: CatalogPart, locale: string): string {
  return (locale.startsWith('en') ? part.nameEn : part.nameFr) || part.name;
}
