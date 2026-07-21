import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { theme, cardStyles, layoutStyles, buttonStyles } from '../theme';
import { toast } from '../context/toast.store';
import { getMapSnapshot, optimizeRoute, geocodeMissing, type MapSnapshot, type MapWorkOrder, type SnapshotFilter } from '../services/dispatch-map.service';

// ─── Period filters ──────────────────────────────────────────────
// Filter map WOs by their scheduledDate. « Tous » clears the filter.
type Period = 'all' | 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  all: 'Tous',
  today: "Aujourd'hui",
  week: 'Cette semaine',
  month: 'Ce mois',
};

/** Compute [from, to] for a period, in local time. Week starts Monday. */
function periodRange(period: Period): { from: string; to: string } | null {
  if (period === 'all') return null;
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (period === 'week') {
    // Monday of the current week.
    const dow = (start.getDay() + 6) % 7; // 0 = Monday
    start.setDate(start.getDate() - dow);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'month') {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * B13 — Dispatcher map view.
 *
 * Two layers on OSM tiles:
 *   - Technicians at their latest known position (marker with initials).
 *   - Active WOs geocoded to their client address (marker coloured by
 *     task-type or priority).
 *
 * When a technician is selected the sidebar shows their assigned WOs; the
 * dispatcher can then request an « optimize route » — the backend returns
 * the ordered WO ids and we draw a polyline connecting them.
 */
export default function DispatchMapPage() {
  const { t } = useTranslation();
  const { isDesktop } = useBreakpoint();
  const [period, setPeriod] = useState<Period>('all');
  const [includeUnscheduled, setIncludeUnscheduled] = useState(true);

  const filter = useMemo<SnapshotFilter | undefined>(() => {
    const range = periodRange(period);
    if (!range) return undefined;
    return { ...range, includeUnscheduled };
  }, [period, includeUnscheduled]);

  const { data: snap, isLoading, refetch } = useQuery({
    queryKey: ['dispatch-map', 'snapshot', period, includeUnscheduled],
    queryFn: () => getMapSnapshot(filter),
    refetchInterval: 30_000,
  });

  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [orderedRoute, setOrderedRoute] = useState<string[]>([]);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const ungeocodedCount = (snap?.workOrders ?? []).filter(
    (w) => w.hasAddress && !w.location,
  ).length;

  async function handleGeocode() {
    setGeocoding(true);
    try {
      const r = await geocodeMissing();
      if (r.attempted === 0) {
        toast.info('Aucune adresse à géocoder.');
      } else {
        toast.success(
          `Géocodage : ${r.resolved} résolue(s), ${r.failed} échec(s) sur ${r.attempted}.`,
        );
      }
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setGeocoding(false);
    }
  }

  // Reset route when tech changes.
  useEffect(() => {
    setOrderedRoute([]);
    setRouteDistance(null);
  }, [selectedTechId]);

  const selectedTech = snap?.technicians.find((t) => t.id === selectedTechId);
  const assignedWos = useMemo<MapWorkOrder[]>(
    () => (snap?.workOrders ?? []).filter((w) => w.assignedToId === selectedTechId),
    [snap, selectedTechId],
  );

  async function handleOptimize() {
    if (!selectedTech?.position) {
      toast.error(
        'Technicien sans position GPS. Le technicien doit activer le suivi GPS dans son Profil (mobile).',
      );
      return;
    }
    const geocodedWos = assignedWos.filter((w) => w.location);
    if (geocodedWos.length === 0) {
      toast.info('Aucun BT assigné avec adresse géocodée à optimiser.');
      return;
    }
    setOptimizing(true);
    try {
      const res = await optimizeRoute(
        selectedTech.id,
        geocodedWos.map((w) => w.id),
      );
      setOrderedRoute(res.orderedWorkOrderIds);
      setRouteDistance(res.totalDistanceKm);
      toast.success(`Tournée optimisée — ${res.totalDistanceKm} km`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setOptimizing(false);
    }
  }

  // Compute route polyline coordinates once we have an order + positions.
  const routeCoords = useMemo<[number, number][]>(() => {
    if (!selectedTech?.position || orderedRoute.length === 0) return [];
    const woMap = new Map(assignedWos.map((w) => [w.id, w]));
    const points: [number, number][] = [
      [selectedTech.position.lat, selectedTech.position.lng],
    ];
    for (const id of orderedRoute) {
      const w = woMap.get(id);
      if (w?.location) points.push([w.location.lat, w.location.lng]);
    }
    return points;
  }, [selectedTech, orderedRoute, assignedWos]);

  const initialCenter = deriveCenter(snap);

  return (
    <div style={{ ...layoutStyles.page, paddingBottom: 0 }}>
      <header
        style={{
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>🗺️ Carte dispatch</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: theme.colors.textMuted }}>
            Position en temps quasi réel des techniciens + BT actifs géocodés. Optimisation de tournée pour un technicien sélectionné.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {ungeocodedCount > 0 && (
            <button
              style={buttonStyles.primary}
              onClick={handleGeocode}
              disabled={geocoding}
              title="Résout les coordonnées GPS des adresses clients via OpenStreetMap (~1 s par adresse)"
            >
              {geocoding
                ? '🌐 Géocodage en cours…'
                : `🌐 Géocoder ${ungeocodedCount} adresse(s)`}
            </button>
          )}
          <button style={buttonStyles.secondary} onClick={() => refetch()}>
            🔄 Rafraîchir
          </button>
        </div>
      </header>

      {/* ── Period filter bar ─────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: theme.colors.textMuted }}>
          📅 Planifiés :
        </span>
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '5px 12px',
              borderRadius: 16,
              border: `1px solid ${period === p ? theme.colors.primary : theme.colors.border}`,
              background: period === p ? theme.colors.primary : 'transparent',
              color: period === p ? '#fff' : theme.colors.text,
              fontSize: 12,
              fontWeight: period === p ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
        {period !== 'all' && (
          <label style={{ fontSize: 12, color: theme.colors.textMuted, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeUnscheduled}
              onChange={(e) => setIncludeUnscheduled(e.target.checked)}
            />{' '}
            inclure les BT non planifiés
          </label>
        )}
        <span style={{ fontSize: 12, color: theme.colors.textMuted, marginLeft: 'auto' }}>
          {(snap?.workOrders ?? []).length} BT affiché(s)
        </span>
      </div>

      {ungeocodedCount > 0 && !geocoding && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'var(--c-warningLight)',
            border: '1px solid #fbbf24',
            borderRadius: 6,
            fontSize: 12,
            color: '#78350f',
          }}
        >
          ⚠️ {ungeocodedCount} BT actif(s) ont une adresse sans coordonnées GPS — ils n'apparaissent pas sur la carte.
          Clique « Géocoder » pour les résoudre automatiquement.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          // B20 — mobile/tablette : carte au-dessus, panneau techniciens dessous.
          gridTemplateColumns: isDesktop ? '1fr 280px' : '1fr',
          gap: 16,
          minHeight: isDesktop ? 600 : undefined,
        }}
      >
        <div style={{ ...cardStyles.card, padding: 0, overflow: 'hidden', minHeight: isDesktop ? 560 : 420 }}>
          {isLoading ? (
            <div style={{ padding: 24 }}>{t('common:messages.loading', { defaultValue: 'Chargement…' })}</div>
          ) : (
            <MapContainer
              center={initialCenter}
              zoom={11}
              style={{ height: isDesktop ? 560 : 420, width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitOnData snap={snap} routeCoords={routeCoords} selectedTechId={selectedTechId} />

              {(snap?.technicians ?? []).map((t) =>
                t.position ? (
                  <Marker
                    key={t.id}
                    position={[t.position.lat, t.position.lng]}
                    icon={techIcon(t.name, t.id === selectedTechId)}
                    eventHandlers={{ click: () => setSelectedTechId(t.id) }}
                  >
                    <Popup>
                      <strong>{t.name}</strong>
                      <br />
                      <span style={{ color: '#6b7280', fontSize: 11 }}>
                        Dernière position : {new Date(t.position.recordedAt).toLocaleString()}
                      </span>
                    </Popup>
                  </Marker>
                ) : null,
              )}

              {(snap?.workOrders ?? [])
                .filter((w): w is MapWorkOrder & { location: NonNullable<MapWorkOrder['location']> } => !!w.location)
                .map((w) => {
                  const routePos = orderedRoute.indexOf(w.id);
                  const isInRoute = routePos >= 0;
                  return (
                    <Marker
                      key={w.id}
                      position={[w.location.lat, w.location.lng]}
                      icon={woIcon(w, isInRoute ? routePos + 1 : null)}
                    >
                      <Popup>
                        <strong>{w.referenceNumber}</strong> — {w.title}
                        <br />
                        <span style={{ fontSize: 11 }}>{w.location.addressLine}</span>
                        {w.scheduledDate && (
                          <>
                            <br />
                            <span style={{ fontSize: 11, color: '#2563eb' }}>
                              📅 {new Date(w.scheduledDate).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          </>
                        )}
                      </Popup>
                    </Marker>
                  );
                })}

              {routeCoords.length > 1 && (
                <Polyline positions={routeCoords} color="#2563eb" weight={4} opacity={0.7} />
              )}
            </MapContainer>
          )}
        </div>

        <aside style={{ ...cardStyles.card, padding: 16, height: 'fit-content' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Techniciens actifs</h3>
          {(snap?.technicians ?? []).length === 0 && (
            <p style={{ fontSize: 12, color: theme.colors.textMuted }}>Aucun technicien.</p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {(snap?.technicians ?? []).map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelectedTechId(t.id === selectedTechId ? null : t.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    marginBottom: 4,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: 4,
                    background:
                      t.id === selectedTechId ? theme.colors.surfaceAlt : 'transparent',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{t.name || t.email || 'Sans nom'}</div>
                  <div style={{ color: theme.colors.textMuted, fontSize: 10 }}>
                    {t.position
                      ? `📍 il y a ${relativeTime(t.position.recordedAt)}`
                      : '⚠️ Pas de position — le technicien doit activer le suivi GPS dans son Profil'}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {selectedTech && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 12 }}>
                BT assignés ({assignedWos.length})
              </h4>
              {assignedWos.length === 0 ? (
                <p style={{ fontSize: 11, color: theme.colors.textMuted }}>
                  Aucun BT assigné à ce technicien.
                </p>
              ) : (
                <>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 11 }}>
                    {(orderedRoute.length > 0
                      ? orderedRoute
                          .map((id) => assignedWos.find((w) => w.id === id))
                          .filter((x): x is MapWorkOrder => !!x)
                      : assignedWos
                    ).map((w, i) => (
                      <li
                        key={w.id}
                        style={{
                          padding: '4px 6px',
                          marginBottom: 2,
                          borderLeft: `3px solid ${w.taskTypeColor ?? '#6b7280'}`,
                          background: theme.colors.surfaceAlt,
                        }}
                      >
                        {orderedRoute.length > 0 && (
                          <strong style={{ marginRight: 4 }}>{i + 1}.</strong>
                        )}
                        {w.referenceNumber} — {w.title}
                        {!w.location && (
                          <span
                            style={{ display: 'block', color: '#b45309', fontSize: 10 }}
                            title={w.hasAddress
                              ? 'Adresse non géocodée — utilise le bouton Géocoder'
                              : 'Aucune adresse client sur ce BT'}
                          >
                            {w.hasAddress ? '📍 adresse non géocodée' : '📍 aucune adresse'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    style={{ ...buttonStyles.primary, marginTop: 8, width: '100%' }}
                    disabled={optimizing || !selectedTech.position}
                    onClick={handleOptimize}
                  >
                    {optimizing ? 'Calcul…' : '🎯 Optimiser la tournée'}
                  </button>
                  {routeDistance !== null && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: theme.colors.textMuted,
                      }}
                    >
                      Distance totale : {routeDistance} km
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Map helpers ──────────────────────────────────────────────────

function FitOnData({
  snap,
  routeCoords,
  selectedTechId,
}: {
  snap: MapSnapshot | undefined;
  routeCoords: [number, number][];
  selectedTechId: string | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!snap) return;
    const points: [number, number][] = [];
    if (routeCoords.length > 0) {
      points.push(...routeCoords);
    } else {
      for (const t of snap.technicians) {
        if (t.position) points.push([t.position.lat, t.position.lng]);
      }
      for (const w of snap.workOrders) {
        if (w.location) points.push([w.location.lat, w.location.lng]);
      }
    }
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, routeCoords.length, selectedTechId]);
  return null;
}

function deriveCenter(snap: MapSnapshot | undefined): [number, number] {
  const t = snap?.technicians.find((x) => x.position);
  if (t?.position) return [t.position.lat, t.position.lng];
  const w = snap?.workOrders.find((x) => x.location);
  if (w?.location) return [w.location.lat, w.location.lng];
  // Default to Montréal.
  return [45.5017, -73.5673];
}

function techIcon(name: string, selected: boolean): L.DivIcon {
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const bg = selected ? '#dc2626' : '#2563eb';
  return L.divIcon({
    className: 'tech-marker',
    html: `<div style="width:34px;height:34px;background:${bg};color:#fff;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font:600 12px sans-serif;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${initials}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function woIcon(w: MapWorkOrder, orderNumber: number | null): L.DivIcon {
  const color = w.taskTypeColor ?? priorityColor(w.priority);
  const label = orderNumber !== null ? String(orderNumber) : '📋';
  return L.divIcon({
    className: 'wo-marker',
    html: `<div style="width:26px;height:26px;background:${color};color:#fff;border:2px solid #fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font:600 11px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.3);">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function priorityColor(p: number): string {
  if (p >= 3) return '#dc2626';
  if (p >= 2) return '#f59e0b';
  if (p >= 1) return '#3b82f6';
  return '#6b7280';
}

function relativeTime(iso: string): string {
  const t = Date.now() - new Date(iso).getTime();
  const min = Math.round(t / 60_000);
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} j`;
}
