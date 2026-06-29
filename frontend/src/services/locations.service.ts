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

export async function getLatestPositions(): Promise<LatestPositionRow[]> {
  const { data } = await api.get<{ rows: LatestPositionRow[] }>(
    '/dispatcher/technicians/positions',
  );
  return data.rows;
}
