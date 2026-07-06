import api from './api';
import type { ApiResponse } from '../types';

export interface MapTechnician {
  id: string;
  name: string;
  email: string | null;
  position: {
    lat: number;
    lng: number;
    accuracyMeters: number | null;
    recordedAt: string;
  } | null;
}

export interface MapWorkOrder {
  id: string;
  referenceNumber: string;
  title: string;
  priority: number;
  status: string;
  scheduledDate: string | null;
  assignedToId: string | null;
  taskTypeName: string | null;
  taskTypeColor: string | null;
  /** Null quand l'adresse du client n'est pas encore géocodée. */
  location: { lat: number; lng: number; addressLine: string } | null;
  hasAddress: boolean;
}

export interface MapSnapshot {
  technicians: MapTechnician[];
  workOrders: MapWorkOrder[];
}

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export interface SnapshotFilter {
  /** ISO timestamps — filter WOs by scheduledDate ∈ [from, to]. */
  from?: string;
  to?: string;
  /** Also keep WOs with no scheduledDate when a period is active. */
  includeUnscheduled?: boolean;
}

export async function getMapSnapshot(filter?: SnapshotFilter): Promise<MapSnapshot> {
  const params: Record<string, string> = {};
  if (filter?.from && filter?.to) {
    params.from = filter.from;
    params.to = filter.to;
    if (filter.includeUnscheduled) params.includeUnscheduled = 'true';
  }
  const { data } = await api.get<ApiResponse<MapSnapshot>>('/dispatch-map/snapshot', { params });
  return unwrap<MapSnapshot>(data);
}

export async function optimizeRoute(
  technicianId: string,
  workOrderIds: string[],
): Promise<{ orderedWorkOrderIds: string[]; totalDistanceKm: number }> {
  const { data } = await api.post<
    ApiResponse<{ orderedWorkOrderIds: string[]; totalDistanceKm: number }>
  >('/dispatch-map/optimize-route', { technicianId, workOrderIds });
  return unwrap(data);
}

/**
 * Géocode jusqu'à 25 adresses clients sans coordonnées via Nominatim.
 * ~1 s par adresse (rate limit OSM) — le bouton doit afficher un état
 * « en cours » persistant.
 */
export async function geocodeMissing(): Promise<{
  attempted: number;
  resolved: number;
  failed: number;
}> {
  const { data } = await api.post<
    ApiResponse<{ attempted: number; resolved: number; failed: number }>
  >('/dispatch-map/geocode-missing', {}, { timeout: 120_000 });
  return unwrap(data);
}
