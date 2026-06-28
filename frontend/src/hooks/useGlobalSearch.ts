import { useQuery } from '@tanstack/react-query';
import { globalSearch, type SearchResults } from '../services/search.service';

export const SEARCH_KEY = 'global-search';

/**
 * Recherche globale (BT + clients + adresses) avec debounce côté caller.
 *
 * Désactivée si la query est trop courte (<2 chars) ou si l'utilisateur
 * n'a pas accès (TECHNICIAN — 403 côté backend).
 */
export function useGlobalSearch(query: string, enabled = true) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: [SEARCH_KEY, trimmed],
    queryFn: async (): Promise<SearchResults> => {
      const res = await globalSearch(trimmed);
      return (res.data?.data ?? res.data) as SearchResults;
    },
    enabled: enabled && trimmed.length >= 2,
    staleTime: 30_000,
    retry: false,
  });
}
