import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { fetchRoute, type RouteEstimate } from '../api/endpoints';
import { useSyncStore } from '../sync/sync.store';

/**
 * B47 — distance and driving time from the phone to a work-order address,
 * computed by the self-hosted routing engine. Best effort : null offline,
 * without permission, or when the engine is unavailable.
 */
export function useRouteEstimate(target: { lat?: number | null; lng?: number | null } | null | undefined): { estimate: RouteEstimate | null; loading: boolean } {
  const { i18n } = useTranslation();
  const online = useSyncStore((s) => s.online);
  const [estimate, setEstimate] = useState<RouteEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const lat = target?.lat ?? null;
  const lng = target?.lng ?? null;

  useEffect(() => {
    let cancelled = false;
    setEstimate(null);
    if (!online || lat == null || lng == null) return;
    (async () => {
      setLoading(true);
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) return;
        const pos = (await Location.getLastKnownPositionAsync({ maxAge: 120_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        if (!pos || cancelled) return;
        const res = await fetchRoute({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { lat, lng }, i18n.language.startsWith('en') ? 'en' : 'fr');
        if (!cancelled) setEstimate(res);
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, lat, lng, i18n.language]);

  return { estimate, loading };
}
