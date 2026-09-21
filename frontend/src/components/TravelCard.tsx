import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import workOrdersService, { computeTravel, downloadFile, getTravelInfo } from '../services/work-orders.service';
import { useDeparturePoints } from '../hooks/useSettings';
import type { WorkOrder } from '../types';
import { theme, buttonStyles, formStyles } from '../theme';
import RouteMapModal from './RouteMapModal';

interface Props {
  wo: WorkOrder;
  /** ADMIN / DISPATCHER may compute or type a manual value. */
  canEdit: boolean;
  cardStyle: React.CSSProperties;
}

/**
 * B49 — mileage of a work order, computed on demand : pick the origin (the
 * technician's GPS position or a predefined departure point), one way or round
 * trip, then « Calculer ». Map, GPX, manual entry.
 */
export default function TravelCard({ wo, canEdit, cardStyle }: Props) {
  const { t } = useTranslation('workOrders');
  const qc = useQueryClient();
  const { data: points = [] } = useDeparturePoints();
  const [showMap, setShowMap] = useState(false);
  const [origin, setOrigin] = useState<string>('GPS');
  const [roundTrip, setRoundTrip] = useState<boolean>(wo.travelRoundTrip ?? true);
  const [editing, setEditing] = useState(false);
  const [manual, setManual] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const travel = useQuery({
    queryKey: ['work-orders', wo.id, 'travel'],
    queryFn: () => getTravelInfo(wo.id).then((r) => r.data.data),
    enabled: showMap,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['work-orders', wo.id] });
    qc.invalidateQueries({ queryKey: ['work-orders', wo.id, 'travel'] });
  };
  const compute = useMutation({
    mutationFn: () => computeTravel(wo.id, { origin: origin === 'GPS' ? { type: 'GPS' } : { type: 'POINT', pointId: origin }, roundTrip }),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (err: unknown) => setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('travel.error', { defaultValue: 'Calcul impossible.' })),
  });
  const saveManual = useMutation({
    mutationFn: (value: number | null) => workOrdersService.update(wo.id, { travelDistanceKm: value }),
    onSuccess: () => { setEditing(false); setError(null); invalidate(); },
    onError: () => setError(t('travel.error', { defaultValue: 'Calcul impossible.' })),
  });

  const km = wo.travelDistanceKm;
  const min = wo.travelDurationMin;
  const gpxName = `${wo.referenceNumber}-trajet.gpx`;

  return (
    <div style={{ ...cardStyle, borderLeft: `4px solid ${theme.colors.info}` }}>
      <h2 style={{ fontSize: theme.font.sizeMd, marginBottom: '0.75rem', color: theme.colors.text }}>🚗 {t('travel.title', { defaultValue: 'Kilométrage' })}</h2>

      {km != null ? (
        <>
          <p style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', fontWeight: theme.font.weightBold, color: theme.colors.text }}>
            {km} km{' '}
            <span style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightNormal, color: theme.colors.textSecondary }}>
              {wo.travelSource === 'MANUAL' ? '' : wo.travelRoundTrip ? t('travel.roundTrip', { defaultValue: 'aller-retour' }) : t('travel.oneWay', { defaultValue: 'aller simple' })}
              {min != null && wo.travelSource !== 'MANUAL' ? ` · ${Math.round(min)} min` : ''}
            </span>
          </p>
          <p style={{ margin: '0 0 0.75rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
            {wo.travelSource === 'MANUAL'
              ? t('travel.sourceManual', { defaultValue: 'Saisi à la main' })
              : t('travel.sourceRouter', { defaultValue: 'Départ : {{origin}} · calculé par le moteur de routage', origin: wo.travelOriginLabel ?? '—' })}
          </p>
        </>
      ) : (
        <p style={{ margin: '0 0 0.75rem', color: theme.colors.textMuted, fontSize: theme.font.sizeSm }}>
          {t('travel.none', { defaultValue: 'Pas encore calculé. Choisissez le point de départ et le type de trajet, puis Calculer.' })}
        </p>
      )}

      {canEdit && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} style={{ ...formStyles.select, width: 'auto', minWidth: 220 }} aria-label={t('travel.origin', { defaultValue: 'Point de départ' })}>
            <option value="GPS">📍 {t('travel.originGps', { defaultValue: 'Position GPS du technicien' })}</option>
            {points.map((p) => <option key={p.id} value={p.id}>🏢 {p.label} — {p.address}</option>)}
          </select>
          <select value={roundTrip ? 'rt' : 'ow'} onChange={(e) => setRoundTrip(e.target.value === 'rt')} style={{ ...formStyles.select, width: 'auto' }} aria-label={t('travel.mode', { defaultValue: 'Trajet' })}>
            <option value="ow">{t('travel.oneWay', { defaultValue: 'aller simple' })}</option>
            <option value="rt">{t('travel.roundTrip', { defaultValue: 'aller-retour' })}</option>
          </select>
          <button type="button" disabled={compute.isPending} onClick={() => compute.mutate()} style={{ ...buttonStyles.primary, fontSize: theme.font.sizeSm }}>
            {compute.isPending ? t('travel.computing', { defaultValue: 'Calcul…' }) : t('travel.compute', { defaultValue: 'Calculer' })}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        {km != null && wo.travelSource !== 'MANUAL' && (
          <>
            <button type="button" onClick={() => setShowMap(true)} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
              🗺 {t('travel.showMap', { defaultValue: 'Voir le trajet' })}
            </button>
            <button type="button" onClick={() => void downloadFile(`/work-orders/${wo.id}/travel.gpx`, undefined, gpxName).catch(() => setError(t('travel.noRoute', { defaultValue: 'Tracé indisponible.' })))} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
              ⬇ GPX
            </button>
          </>
        )}
        {canEdit && (!editing ? (
          <button type="button" onClick={() => { setManual(km != null ? String(km) : ''); setEditing(true); }} style={{ ...buttonStyles.ghost, fontSize: theme.font.sizeSm }}>
            ✏️ {t('travel.manual', { defaultValue: 'Saisir à la main' })}
          </button>
        ) : (
          <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
            <input type="number" min={0} step={0.1} value={manual} onChange={(e) => setManual(e.target.value)} style={{ ...formStyles.input, width: 110 }} placeholder="km" />
            <button type="button" disabled={saveManual.isPending} onClick={() => saveManual.mutate(manual.trim() === '' ? null : Number(manual))} style={{ ...buttonStyles.primary, fontSize: theme.font.sizeSm }}>OK</button>
            <button type="button" onClick={() => setEditing(false)} style={{ ...buttonStyles.ghost, fontSize: theme.font.sizeSm }}>✕</button>
          </span>
        ))}
      </div>
      {error && <p style={{ margin: '0.5rem 0 0', color: theme.colors.danger, fontSize: theme.font.sizeSm }}>{error}</p>}
      {showMap && travel.data && (
        <RouteMapModal
          title={`${wo.referenceNumber} — ${wo.title}`}
          info={travel.data}
          onClose={() => setShowMap(false)}
          onExportGpx={() => void downloadFile(`/work-orders/${wo.id}/travel.gpx`, undefined, gpxName)}
        />
      )}
      {showMap && travel.isLoading && <p style={{ margin: '0.5rem 0 0', fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{t('travel.loading', { defaultValue: 'Calcul du trajet…' })}</p>}
    </div>
  );
}
