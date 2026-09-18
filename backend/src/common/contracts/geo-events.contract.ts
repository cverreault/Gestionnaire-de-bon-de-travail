/**
 * Events published by the `geo` module (B40.3). Constants live here so
 * consumers (`clients`) subscribe without importing the module.
 */
export const GEO_ROLL_IMPORTED_EVENT = 'geo.roll.imported' as const;

export interface GeoRollImportedPayload {
  eventName: typeof GEO_ROLL_IMPORTED_EVENT;
  occurredAt: Date;
  aggregateId: string;
  actorUserId: string | null;
  rollYear: number;
  rowsImported: number;
}
