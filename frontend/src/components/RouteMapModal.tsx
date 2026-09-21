import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import { theme, buttonStyles, modalStyles } from '../theme';
import type { TravelInfo } from '../services/work-orders.service';

interface Props {
  title: string;
  info: TravelInfo;
  onClose: () => void;
  onExportGpx?: () => void;
}

function pin(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};color:#fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);white-space:nowrap">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
  }, [map, points]);
  return null;
}

/** B49 — the round trip base → site → base on a map. Closes only through ✕ / Fermer. */
export default function RouteMapModal({ title, info, onClose, onExportGpx }: Props) {
  const { t } = useTranslation('workOrders');
  const shape: [number, number][] = (info.route?.shape ?? []).map((p) => [p.lat, p.lng]);
  const points: [number, number][] = shape.length > 1 ? shape : [info.base, info.site].filter((p): p is NonNullable<typeof p> => !!p).map((p) => [p.lat, p.lng]);
  const center: [number, number] = points[0] ?? [46.8, -71.2];

  return (
    <div style={{ ...modalStyles.overlay, zIndex: 1200 }}>
      <div style={{ ...modalStyles.content, maxWidth: 900, width: '95vw' }}>
        <div style={{ ...modalStyles.header }}>
          <h2 style={{ ...modalStyles.headerTitle }}>🚗 {title}</h2>
          <button type="button" onClick={onClose} aria-label={t('travel.close', { defaultValue: 'Fermer' })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: theme.colors.textLight }}>✕</button>
        </div>
        <div style={{ padding: '0.75rem 1rem 1rem' }}>
          <p style={{ margin: '0 0 0.6rem', fontSize: theme.font.sizeSm, color: theme.colors.textSecondary }}>
            {info.route
              ? t('travel.roundTripSummary', { defaultValue: 'Aller-retour : {{km}} km · {{min}} min de route', km: info.route.distanceKm, min: Math.round(info.route.durationMin) })
              : t('travel.noRoute', { defaultValue: 'Tracé indisponible (adresse de départ, coordonnées ou moteur manquants).' })}
            {info.base?.address ? ` · ${t('travel.from', { defaultValue: 'Départ' })} : ${info.base.address}` : ''}
          </p>
          <div style={{ height: 460, borderRadius: theme.radius.md, overflow: 'hidden', border: theme.borders.default }}>
            <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
              {info.base && (
                <Marker position={[info.base.lat, info.base.lng]} icon={pin(t('travel.base', { defaultValue: 'Départ' }), '#1e40af')}>
                  <Popup>{info.base.address ?? t('travel.base', { defaultValue: 'Départ' })}</Popup>
                </Marker>
              )}
              {info.site && (
                <Marker position={[info.site.lat, info.site.lng]} icon={pin(t('travel.site', { defaultValue: 'Site' }), '#16a34a')}>
                  <Popup>{title}</Popup>
                </Marker>
              )}
              {shape.length > 1 && <Polyline positions={shape} color="#2563eb" weight={4} opacity={0.75} />}
              <Fit points={points} />
            </MapContainer>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
            {onExportGpx && info.route && (
              <button type="button" onClick={onExportGpx} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
                ⬇ {t('travel.exportGpx', { defaultValue: 'Exporter le trajet (GPX)' })}
              </button>
            )}
            <button type="button" onClick={onClose} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
              {t('travel.close', { defaultValue: 'Fermer' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
