import api from './api';

export type SearchHitType = 'workOrder' | 'client' | 'address';

export interface SearchHit {
  type: SearchHitType;
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
}

export interface SearchResults {
  query: string;
  total: number;
  hits: SearchHit[];
}

/**
 * Recherche globale unifiée (BT + clients + adresses).
 * Réservée ADMIN + DISPATCHER côté backend.
 */
export const globalSearch = (q: string) =>
  api.get<{ success: true; data: SearchResults }>('/search', { params: { q } });
