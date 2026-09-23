import api from './api';

export interface RecordLocationInput {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface LatestPositionRow {
  technicianId: string;
  firstName: string;
  lastName: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
}

export async function recordMyLocation(input: RecordLocationInput): Promise<void> {
  await api.post('/me/location', input);
}

/** B57 — « où est le technicien ? » */
export interface TechnicianPosition {
  technicianId: string;
  name: string;
  gpsEnabled: boolean;
  position: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    recordedAt: string;
    ageSeconds: number;
    source: string;
  } | null;
  nearestAddress: { label: string; street: string | null; city: string | null; postalCode: string | null } | null;
}

export async function getTechnicianPosition(technicianId: string): Promise<TechnicianPosition> {
  const { data } = await api.get<{ data?: TechnicianPosition } & TechnicianPosition>(`/dispatcher/technicians/${technicianId}/position`);
  return (data.data ?? data) as TechnicianPosition;
}

export interface LocateResult {
  sent: boolean;
  reason?: string;
  /** B65 — the request is flagged server-side ; the app answers at its next sync even without push. */
  viaSync?: boolean;
}

export async function requestLocate(technicianId: string): Promise<LocateResult> {
  const { data } = await api.post<{ data?: LocateResult } & LocateResult>(`/dispatcher/technicians/${technicianId}/locate`);
  return (data.data ?? data) as LocateResult;
}

export async function getLatestPositions(): Promise<LatestPositionRow[]> {
  const { data } = await api.get<{ rows: LatestPositionRow[] }>(
    '/dispatcher/technicians/positions',
  );
  return data.rows;
}
