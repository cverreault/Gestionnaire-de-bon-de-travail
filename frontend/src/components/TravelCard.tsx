import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import workOrdersService, { computeTravel, downloadFile, getTravelInfo } from '../services/work-orders.service';
import type { WorkOrder } from '../types';
import { theme, buttonStyles, formStyles } from '../theme';
import RouteMapModal from './RouteMapModal';

interface Props {
  wo: WorkOrder;
  /** ADMIN / DISPATCHER may recompute or type a manual value. */
  canEdit: boolean;
  cardStyle: React.CSSProperties;
}

/** B49 — round-trip mileage of a work order : value, source, map, GPX, recompute, manual entry. */
export default function TravelCard({ wo, canEdit, cardStyle }: Props) {
  const { t } = useTranslation('workOrders');
  const qc = useQueryClient();
  const [showMap, setShowMap] = useState(false);
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
  const recompute = useMutation({
    mutationFn: () => computeTravel(wo.id),
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

  return (
    <div style={{ ...cardStyle, borderLeft: `4px solid ${theme.colors.info}` }}>
      <h2 style={{ fontSize: theme.font.sizeMd, marginBottom: '0.75rem', color: theme.colors.text }}>🚗 {t('travel.title', { defaultValue: 'Kilométrage' })}</h2>
      {km != null ? (
        <p style={{ margin: '0 0 0.25rem', fontSize: '1.4rem', fontWeight: theme.font.weightBold, color: theme.colors.text }}>
          {km} km <span style={{ fontSize: theme.font.sizeSm, fontWeight: theme.font.weightNormal, color: theme.colors.textSecondary }}>
            {t('travel.roundTrip', { defaultValue: 'aller-retour' })}{min != null ? ` · ${Math.round(min)} min` : ''}
          </span>
        </p>
      ) : (
        <p style={{ margin: '0 0 0.25rem', color: theme.colors.textMuted, fontSize: theme.font.sizeSm }}>
          {t('travel.none', { defaultValue: "Pas encore calculé : il l'est automatiquement à la fin des travaux, si l'adresse de départ de l'entreprise est définie." })}
        </p>
      )}
      {km != null && (
        <p style={{ margin: '0 0 0.75rem', fontSize: theme.font.sizeXs, color: theme.colors.textMuted }}>
          {wo.travelSource === 'MANUAL' ? t('travel.sourceManual', { defaultValue: 'Saisi à la main' }) : t('travel.sourceRouter', { defaultValue: 'Calculé par le moteur de routage (départ → site → départ)' })}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <button type="button" onClick={() => setShowMap(true)} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
          🗺 {t('travel.showMap', { defaultValue: 'Voir le trajet' })}
        </button>
        <button type="button" onClick={() => void downloadFile(`/work-orders/${wo.id}/travel.gpx`, undefined, `${wo.referenceNumber}-trajet.gpx`).catch(() => setError(t('travel.noRoute', { defaultValue: 'Tracé indisponible (adresse de départ, coordonnées ou moteur manquants).' })))} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
          ⬇ GPX
        </button>
        {canEdit && (
          <>
            <button type="button" disabled={recompute.isPending} onClick={() => recompute.mutate()} style={{ ...buttonStyles.secondary, fontSize: theme.font.sizeSm }}>
              {recompute.isPending ? t('travel.computing', { defaultValue: 'Calcul…' }) : `🔄 ${t('travel.recompute', { defaultValue: 'Recalculer' })}`}
            </button>
            {!editing ? (
              <button type="button" onClick={() => { setManual(km != null ? String(km) : ''); setEditing(true); }} style={{ ...buttonStyles.ghost, fontSize: theme.font.sizeSm }}>
                ✏️ {t('travel.manual', { defaultValue: 'Saisir' })}
              </button>
            ) : (
              <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                <input type="number" min={0} step={0.1} value={manual} onChange={(e) => setManual(e.target.value)} style={{ ...formStyles.input, width: 110 }} placeholder="km" />
                <button type="button" disabled={saveManual.isPending} onClick={() => saveManual.mutate(manual.trim() === '' ? null : Number(manual))} style={{ ...buttonStyles.primary, fontSize: theme.font.sizeSm }}>OK</button>
                <button type="button" onClick={() => setEditing(false)} style={{ ...buttonStyles.ghost, fontSize: theme.font.sizeSm }}>✕</button>
              </span>
            )}
          </>
        )}
      </div>
      {error && <p style={{ margin: '0.5rem 0 0', color: theme.colors.danger, fontSize: theme.font.sizeSm }}>{error}</p>}
      {showMap && travel.data && (
        <RouteMapModal
          title={`${wo.referenceNumber} — ${wo.title}`}
          info={travel.data}
          onClose={() => setShowMap(false)}
          onExportGpx={() => void downloadFile(`/work-orders/${wo.id}/travel.gpx`, undefined, `${wo.referenceNumber}-trajet.gpx`)}
        />
      )}
      {showMap && travel.isLoading && <p style={{ margin: '0.5rem 0 0', fontSize: theme.font.sizeSm, color: theme.colors.textMuted }}>{t('travel.loading', { defaultValue: 'Calcul du trajet…' })}</p>}
    </div>
  );
}
