import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getLatestPositions, type LatestPositionRow } from '../services/locations.service';
import { theme } from '../theme';

/**
 * Live technician positions on a Leaflet map (B5.4).
 *
 * - Polls /api/dispatcher/technicians/positions every 15s. WebSocket
 *   would be lower-latency but the tech client only uploads every
 *   25s anyway — 15s of HTTP polling is the right complexity tier
 *   for v1.
 * - Auto-fits the map to all visible markers on first load. Manual
 *   pan/zoom afterwards isn't overridden — the dispatcher controls
 *   the view from then on.
 * - Falls back to a center on Quebec province when no positions are
 *   available.
 *
 * Marker icons : Leaflet's defaults require explicit Webpack/Vite
 * asset config. We sidestep that with a tiny custom divIcon that
 * needs no images.
 */

const QUEBEC_CENTER: [number, number] = [46.8, -71.2];

function technicianIcon(initials: string): L.DivIcon {
  return L.divIcon({
    className: 'taskmgr-tech-marker',
    html: `<div style="
      background: ${theme.colors.primary};
      color: white;
      font-weight: 700;
      font-size: 12px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">${initials}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function FitBoundsOnce({ rows }: { rows: LatestPositionRow[] }) {
  const map = useMap();
  useEffect(() => {
    if (rows.length === 0) return;
    const latlngs = rows.map((r) => L.latLng(r.latitude, r.longitude));
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    // Only fit once — subsequent renders shouldn't yank the
    // dispatcher's pan/zoom around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function TechnicianLocationsMap() {
  const { t } = useTranslation();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['dispatcher-positions'],
    queryFn: getLatestPositions,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  return (
    <div style={{ position: 'relative', height: 360, borderRadius: 8, overflow: 'hidden' }}>
      <MapContainer
        center={QUEBEC_CENTER}
        zoom={6}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBoundsOnce rows={rows} />
        {rows.map((r) => {
          const initials = `${r.firstName[0] ?? ''}${r.lastName[0] ?? ''}`.toUpperCase();
          return (
            <Marker
              key={r.technicianId}
              position={[r.latitude, r.longitude]}
              icon={technicianIcon(initials)}
            >
              <Popup>
                <strong>{r.firstName} {r.lastName}</strong>
                <br />
                {new Date(r.recordedAt).toLocaleTimeString()}
                {r.accuracy !== null && (
                  <>
                    <br />
                    Précision : {Math.round(r.accuracy)} m
                  </>
                )}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(255,255,255,0.9)',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            color: theme.colors.textMuted,
          }}
        >
          {t('common:messages.loading', { defaultValue: 'Chargement…' })}
        </div>
      )}
      {!isLoading && rows.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'rgba(255,255,255,0.95)',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            color: theme.colors.textMuted,
          }}
        >
          Aucun technicien actif n'a partagé sa position.
        </div>
      )}
    </div>
  );
}
