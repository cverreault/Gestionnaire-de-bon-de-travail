import api from './api';
import type { ApiResponse } from '../types';

/**
 * Géo (B40) — autocomplétion d'adresse (Adresses Québec via le backend)
 * et fiche propriété (rôle d'évaluation foncière importé).
 */

export interface AddressSuggestion {
  text: string;
  magicKey: string;
}

export interface ResolvedAddress {
  streetNumber: string | null;
  street: string;
  apartment: string | null;
  city: string;
  postalCode: string | null;
  province: 'QC';
  country: 'Canada';
  latitude: number;
  longitude: number;
  score: number;
}

export interface PropertySheet {
  matricule: string;
  municipality: string;
  address: string;
  landUseCode: string | null;
  landUseLabel: string | null;
  dwellings: number | null;
  storeys: number | null;
  yearBuilt: number | null;
  landAreaM2: number | null;
  floorAreaM2: number | null;
  lotNumbers: string[];
  valueLand: number | null;
  valueBuilding: number | null;
  valueTotal: number | null;
  rollYear: number;
  latitude: number;
  longitude: number;
  matchedBy: 'number+street' | 'nearest';
  distanceMeters: number | null;
}

export async function suggestAddresses(q: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const { data } = await api.get<ApiResponse<{ suggestions: AddressSuggestion[] }>>('/geo/suggest', {
    params: { q },
    signal,
  });
  return data.data.suggestions;
}

export async function resolveAddress(text: string, magicKey?: string): Promise<ResolvedAddress | null> {
  const { data } = await api.get<ApiResponse<{ address: ResolvedAddress | null }>>('/geo/resolve', {
    params: { text, magicKey },
  });
  return data.data.address;
}

export async function getPropertyForAddress(addressId: string): Promise<PropertySheet | null> {
  const { data } = await api.get<ApiResponse<{ property: PropertySheet | null }>>('/geo/property', {
    params: { addressId },
  });
  return data.data.property;
}
