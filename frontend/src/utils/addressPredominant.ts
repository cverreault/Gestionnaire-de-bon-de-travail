import type { AddressTypeConfig } from '../types';

/**
 * Minimal address shape needed to resolve the predominant field.
 * Compatible with both ClientAddress (from /adresses) and the embedded
 * clientAddress_rel on WorkOrder.
 */
export interface PredominantAddressInput {
  addressType?: string | null;
  typeData?: Record<string, unknown> | null;
}

/**
 * Resolve the "predominant field" display for an address based on its
 * AddressTypeConfig. Returns null when the type has no predominant field
 * configured, or when the address has no value for it.
 */
export function getPredominantDisplay(
  address: PredominantAddressInput | null | undefined,
  configs: AddressTypeConfig[] | undefined,
): { label: string; value: string } | null {
  if (!address?.addressType || !configs?.length) return null;
  const config = configs.find((c) => c.code === address.addressType);
  if (!config?.predominantFieldId || !config.fields) return null;
  const field = config.fields.find((f) => f.id === config.predominantFieldId);
  if (!field) return null;
  const td = (address.typeData ?? {}) as Record<string, unknown>;
  const raw = td[field.id];
  if (raw === null || raw === undefined || raw === '') return null;
  return { label: field.label, value: String(raw) };
}
